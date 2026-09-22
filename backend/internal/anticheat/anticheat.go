package anticheat

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrRateLimitExceeded   = errors.New("RATE_LIMIT_EXCEEDED: Zbyt wiele akcji naraz. Zwolnij tempo.")
	ErrInvalidBetAmount    = errors.New("INVALID_BET: Stawka musi wynosić od 1 do 10,000,000 $FGT.")
	ErrInsufficientBalance = errors.New("INSUFFICIENT_BALANCE: Brak wystarczających środków na koncie.")
	ErrInvalidGameParam    = errors.New("INVALID_PARAM: Nieprawidłowe parametry gry.")
	ErrInvalidMove         = errors.New("INVALID_MOVE: Niedozwolony ruch w obecnym stanie gry.")
	ErrExploitAttempt      = errors.New("SECURITY_VIOLATION: Wykryto próbę manipulacji stanem gry.")
)

// ============================================================================
// Bot Detection File Logger
// ============================================================================

var (
	botLoggerOnce sync.Once
	botLogger     *log.Logger
	botLogMu      sync.Mutex
)

func getBotLogger() *log.Logger {
	botLoggerOnce.Do(func() {
		logPath := os.Getenv("BOT_LOG_PATH")
		if logPath == "" {
			logPath = "/app/logs/bot_detections.log"
		}
		if err := os.MkdirAll("/app/logs", 0755); err == nil {
			f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
			if err == nil {
				botLogger = log.New(f, "", 0)
				return
			}
		}
		// Fallback to stderr
		botLogger = log.New(os.Stderr, "[BOT-FALLBACK] ", log.LstdFlags)
	})
	return botLogger
}

func logBotEvent(nick, userID, ip, action, reason string, violationCount int) {
	now := time.Now().UTC()
	line := fmt.Sprintf(
		"[%s] BOT_DETECTED | nick=%q | user_id=%s | ip=%s | action=%q | reason=%s | violations=%d",
		now.Format("2006-01-02 15:04:05 UTC"),
		nick, userID, ip, action, reason, violationCount,
	)

	// Always print to stdout for docker logs
	log.Printf("[ANTICHEAT/BOT] %s", line)

	// Write to file
	botLogMu.Lock()
	getBotLogger().Println(line)
	botLogMu.Unlock()
}

// ============================================================================
// Per-User Lock Manager (prevents concurrent double-sends)
// ============================================================================

type UserLockManager struct {
	mu    sync.Mutex
	locks map[string]*userLockEntry
}

type userLockEntry struct {
	mu         sync.Mutex
	lastAccess time.Time
}

func NewUserLockManager() *UserLockManager {
	m := &UserLockManager{
		locks: make(map[string]*userLockEntry),
	}
	go m.cleanupLoop()
	return m
}

func (m *UserLockManager) LockUser(userID string) func() {
	m.mu.Lock()
	entry, ok := m.locks[userID]
	if !ok {
		entry = &userLockEntry{lastAccess: time.Now()}
		m.locks[userID] = entry
	} else {
		entry.lastAccess = time.Now()
	}
	m.mu.Unlock()

	entry.mu.Lock()
	return func() { entry.mu.Unlock() }
}

func (m *UserLockManager) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		m.mu.Lock()
		cutoff := time.Now().Add(-30 * time.Minute)
		for uid, entry := range m.locks {
			if entry.lastAccess.Before(cutoff) {
				delete(m.locks, uid)
			}
		}
		m.mu.Unlock()
	}
}

// ============================================================================
// Sliding-Window Rate Limiter with Bot Detection
//
// Limits (designed so a human CANNOT hit them accidentally):
//   - Game actions (POST /api/casino): max 4/s, max 12/10s, max 30/min
//   - State polls (GET /api/casino):  max 8/s (already has JS 5s interval)
//
// Bot detection trigger: 3 violations within 60 seconds → flagged + logged
// ============================================================================

const (
	// Game action limits
	gameActionMaxPerSec  = 4
	gameActionMaxPer10s  = 12
	gameActionMaxPerMin  = 30

	// Read state limits
	stateReadMaxPerSec = 8

	// How many violations before we flag as bot
	botViolationThreshold = 3
	botViolationWindow    = 60 * time.Second
)

type requestRecord struct {
	t time.Time
}

type userRateEntry struct {
	// Sliding window timestamps for game actions
	gameActions []time.Time
	// Sliding window timestamps for state reads
	stateReads []time.Time
	// Violation tracking
	violations    []time.Time
	lastViolation time.Time
	flaggedAsBot  bool
	flaggedAt     time.Time
	// Identity (filled on first detection)
	nick string
	ip   string
}

type RateLimiter struct {
	mu      sync.Mutex
	entries map[string]*userRateEntry
}

func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{entries: make(map[string]*userRateEntry)}
	go rl.cleanupLoop()
	return rl
}

func (rl *RateLimiter) getEntry(userID string) *userRateEntry {
	e, ok := rl.entries[userID]
	if !ok {
		e = &userRateEntry{}
		rl.entries[userID] = e
	}
	return e
}

// SetIdentity stores nick and IP for richer bot logs (call after auth).
func (rl *RateLimiter) SetIdentity(userID, nick, ip string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	e := rl.getEntry(userID)
	e.nick = nick
	e.ip = ip
}

// AllowGameAction checks a POST game action. Returns false + logs if bot detected.
func (rl *RateLimiter) AllowGameAction(userID, action string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	e := rl.getEntry(userID)
	now := time.Now()

	// Prune old timestamps
	e.gameActions = pruneOlderThan(e.gameActions, now, time.Minute)

	// Check limits (most strict first for performance)
	var violationReason string
	lastSec := countSince(e.gameActions, now, time.Second)
	last10s := countSince(e.gameActions, now, 10*time.Second)
	lastMin := countSince(e.gameActions, now, time.Minute)

	switch {
	case lastSec >= gameActionMaxPerSec:
		violationReason = fmt.Sprintf("%d req/s (limit %d/s)", lastSec+1, gameActionMaxPerSec)
	case last10s >= gameActionMaxPer10s:
		violationReason = fmt.Sprintf("%d req/10s (limit %d/10s)", last10s+1, gameActionMaxPer10s)
	case lastMin >= gameActionMaxPerMin:
		violationReason = fmt.Sprintf("%d req/min (limit %d/min)", lastMin+1, gameActionMaxPerMin)
	}

	// Record the request regardless (so we track bursts accurately)
	e.gameActions = append(e.gameActions, now)

	if violationReason == "" {
		return true
	}

	// Record violation
	e.violations = pruneOlderThan(e.violations, now, botViolationWindow)
	e.violations = append(e.violations, now)
	e.lastViolation = now

	botFlag := len(e.violations) >= botViolationThreshold
	if botFlag && !e.flaggedAsBot {
		e.flaggedAsBot = true
		e.flaggedAt = now
	}

	logBotEvent(e.nick, userID, e.ip, action, violationReason, len(e.violations))

	return false
}

// AllowStateRead checks a GET /api/casino read. Softer limits, still logged.
func (rl *RateLimiter) AllowStateRead(userID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	e := rl.getEntry(userID)
	now := time.Now()

	e.stateReads = pruneOlderThan(e.stateReads, now, time.Second)
	if len(e.stateReads) >= stateReadMaxPerSec {
		e.violations = pruneOlderThan(e.violations, now, botViolationWindow)
		e.violations = append(e.violations, now)
		logBotEvent(e.nick, userID, e.ip, "GET /api/casino",
			fmt.Sprintf("%d reads/s (limit %d/s)", len(e.stateReads)+1, stateReadMaxPerSec),
			len(e.violations))
		e.stateReads = append(e.stateReads, now)
		return false
	}
	e.stateReads = append(e.stateReads, now)
	return true
}

// IsFlaggedBot returns true if this user has been flagged as a bot.
func (rl *RateLimiter) IsFlaggedBot(userID string) (bool, time.Time) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	e, ok := rl.entries[userID]
	if !ok {
		return false, time.Time{}
	}
	return e.flaggedAsBot, e.flaggedAt
}

// Legacy method — kept for compatibility with existing handler code.
// Routes to AllowGameAction with action="unknown".
func (rl *RateLimiter) Allow(userID string) bool {
	return rl.AllowGameAction(userID, "unknown")
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-60 * time.Minute)
		for uid, e := range rl.entries {
			if e.lastViolation.Before(cutoff) && len(e.gameActions) == 0 {
				delete(rl.entries, uid)
			}
		}
		rl.mu.Unlock()
	}
}

// ============================================================================
// Sliding window helpers
// ============================================================================

func pruneOlderThan(ts []time.Time, now time.Time, window time.Duration) []time.Time {
	cutoff := now.Add(-window)
	i := 0
	for i < len(ts) && ts[i].Before(cutoff) {
		i++
	}
	return ts[i:]
}

func countSince(ts []time.Time, now time.Time, window time.Duration) int {
	cutoff := now.Add(-window)
	count := 0
	for j := len(ts) - 1; j >= 0; j-- {
		if ts[j].Before(cutoff) {
			break
		}
		count++
	}
	return count
}

// ============================================================================
// Parameter & State Sanitization Rules
// ============================================================================

func ValidateBet(bet int64, playerBalance int64) error {
	if bet < 1 || bet > 10_000_000 {
		return ErrInvalidBetAmount
	}
	if bet > playerBalance {
		return ErrInsufficientBalance
	}
	return nil
}

func ValidateRouletteChoice(choice string) error {
	choice = strings.ToLower(strings.TrimSpace(choice))
	validKeywords := map[string]bool{
		"red": true, "black": true, "even": true, "odd": true,
		"low": true, "high": true, "dozen1": true, "dozen2": true, "dozen3": true,
		"1-18": true, "19-36": true, "1st12": true, "2nd12": true, "3rd12": true,
	}
	if validKeywords[choice] {
		return nil
	}
	num, err := strconv.Atoi(choice)
	if err == nil && num >= 0 && num <= 36 {
		return nil
	}
	return fmt.Errorf("%w: nieprawidłowy wybór w ruletce: %s", ErrInvalidGameParam, choice)
}

func ValidateCoinflipChoice(choice string) error {
	choice = strings.ToLower(strings.TrimSpace(choice))
	if choice != "heads" && choice != "tails" {
		return fmt.Errorf("%w: coinflip akceptuje tylko 'heads' lub 'tails'", ErrInvalidGameParam)
	}
	return nil
}

func ValidateRPSChoice(choice string) error {
	choice = strings.ToLower(strings.TrimSpace(choice))
	if choice != "rock" && choice != "paper" && choice != "scissors" {
		return fmt.Errorf("%w: KPN akceptuje tylko 'rock', 'paper' lub 'scissors'", ErrInvalidGameParam)
	}
	return nil
}

func ValidatePlinkoParams(rows int, risk string) error {
	if rows < 8 || rows > 16 {
		return fmt.Errorf("%w: plinko rows musi mieścić się w przedziale 8-16", ErrInvalidGameParam)
	}
	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		return fmt.Errorf("%w: poziom ryzyka w plinko musi być low/medium/high", ErrInvalidGameParam)
	}
	return nil
}

func ValidateLimboTarget(target float64) error {
	if target < 1.01 || target > 10000.0 {
		return fmt.Errorf("%w: cel w Limbo musi wynosić od 1.01x do 10,000x", ErrInvalidGameParam)
	}
	return nil
}

func ValidateCrashTarget(target float64) error {
	if target < 1.01 || target > 1000.0 {
		return fmt.Errorf("%w: cel w Crash musi wynosić od 1.01x do 1,000x", ErrInvalidGameParam)
	}
	return nil
}

func ValidateMinesStart(mineCount int) error {
	if mineCount < 2 || mineCount > 24 {
		return fmt.Errorf("%w: liczba min musi wynosić od 2 do 24", ErrInvalidGameParam)
	}
	return nil
}

func ValidateMinesReveal(tile int, revealed []int) error {
	if tile < 0 || tile > 24 {
		return fmt.Errorf("%w: numer kafelka w Saperze musi wynosić od 0 do 24", ErrInvalidGameParam)
	}
	for _, r := range revealed {
		if r == tile {
			return fmt.Errorf("%w: kafelek #%d został już odkryty", ErrInvalidMove, tile)
		}
	}
	return nil
}

func ValidateMinesCashout(revealedCount int) error {
	if revealedCount < 1 {
		return fmt.Errorf("%w: musisz odkryć przynajmniej jeden diament przed wypłatą", ErrInvalidMove)
	}
	return nil
}

func ValidateBlackjackMove(move string, cardsLen int) error {
	move = strings.ToLower(strings.TrimSpace(move))
	if move != "hit" && move != "stand" && move != "double" {
		return fmt.Errorf("%w: nieznany ruch w Blackjacku: %s", ErrInvalidMove, move)
	}
	if move == "double" && cardsLen != 2 {
		return fmt.Errorf("%w: podwojenie stawki jest możliwe tylko przy pierwszych 2 kartach", ErrInvalidMove)
	}
	return nil
}

// LogSecurityAlert logs suspicious or illegal operations to both stdout and bot log file.
func LogSecurityAlert(userID, action, details string) {
	msg := fmt.Sprintf("[%s] SECURITY_ALERT | user_id=%s | action=%q | details=%s",
		time.Now().UTC().Format("2006-01-02 15:04:05 UTC"), userID, action, details)
	log.Printf("[ANTICHEAT] %s", msg)
	botLogMu.Lock()
	getBotLogger().Println(msg)
	botLogMu.Unlock()
}
