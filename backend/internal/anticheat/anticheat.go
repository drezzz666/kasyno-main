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
	ErrInvalidBetAmount    = errors.New("INVALID_BET: Stawka musi wynosić od 1 do 10,000,000 ₽.")
	ErrInsufficientBalance = errors.New("INSUFFICIENT_BALANCE: Brak wystarczających środków na koncie.")
	ErrInvalidGameParam    = errors.New("INVALID_PARAM: Nieprawidłowe parametry gry.")
	ErrInvalidMove         = errors.New("INVALID_MOVE: Niedozwolony ruch w obecnym stanie gry.")
	ErrExploitAttempt      = errors.New("SECURITY_VIOLATION: Wykryto próbę manipulacji stanem gry.")
)

// ============================================================================
// Bot Detection File Logger
// ============================================================================

var (
	botLoggerOnce       sync.Once
	botLogger           *log.Logger
	botLogMu            sync.Mutex
	alertCallbackMu     sync.RWMutex
	alertCallbackHandler func(category, ip, userID, nick, action, details string)
)

// SetSecurityAlertHandler registers a global callback to dispatch security and anticheat events (e.g. to Discord webhook).
func SetSecurityAlertHandler(handler func(category, ip, userID, nick, action, details string)) {
	alertCallbackMu.Lock()
	defer alertCallbackMu.Unlock()
	alertCallbackHandler = handler
}

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

func LogSuspiciousActivity(category, ip, userID, nick, action, details string) {
	now := time.Now().UTC()
	line := fmt.Sprintf(
		"[%s] [%s] ip=%s | user_id=%s | nick=%q | action=%q | details=%s",
		now.Format("2006-01-02 15:04:05 UTC"),
		category, ip, userID, nick, action, details,
	)

	log.Printf("[ANTICHEAT/%s] %s", category, line)

	botLogMu.Lock()
	getBotLogger().Println(line)
	botLogMu.Unlock()

	alertCallbackMu.RLock()
	cb := alertCallbackHandler
	alertCallbackMu.RUnlock()
	if cb != nil {
		cb(category, ip, userID, nick, action, details)
	}
}

func logBotEvent(nick, userID, ip, action, reason string, violationCount int) {
	status := ""
	if violationCount >= botViolationThreshold {
		status = " ⚠️ [ZFLAGOWANO JAKO AUTOMAT/BOT]"
	}
	details := fmt.Sprintf("%s | Naruszenia w oknie 60s: %d%s", reason, violationCount, status)
	LogSuspiciousActivity("BOT_DETECTION", ip, userID, nick, action, details)
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
	// Game action limits (standard turn-based games: Blackjack, Roulette, Coinflip, RPS)
	gameActionMaxPerSec = 10
	gameActionMaxPer10s = 40
	gameActionMaxPerMin = 180

	// Rapid action limits (supports continuous rapid 0.25s drops & spins: Plinko, Slots, Limbo, Mines moves)
	rapidActionMaxPerSec = 25
	rapidActionMaxPer10s = 250
	rapidActionMaxPerMin = 1500

	// Read state limits (pre-fetching proofs and status polling)
	stateReadMaxPerSec = 30

	// How many violations before we flag as bot
	botViolationThreshold = 4
	botViolationWindow    = 60 * time.Second
)

type requestRecord struct {
	t time.Time
}

type userRateEntry struct {
	// Sliding window timestamps for standard game actions
	gameActions []time.Time
	// Sliding window timestamps for rapid actions (plinko, mines moves)
	rapidActions []time.Time
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
// Supports custom high-frequency limits for rapid games like Plinko and Mines tile reveals (20 CPS).
func (rl *RateLimiter) AllowGameAction(userID, action string, game ...string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	e := rl.getEntry(userID)
	now := time.Now()

	actLower := strings.ToLower(strings.TrimSpace(action))
	gLower := ""
	if len(game) > 0 {
		gLower = strings.ToLower(strings.TrimSpace(game[0]))
	}
	isRapid := actLower == "plinko" || gLower == "plinko" ||
		actLower == "mines" || (gLower == "mines" && actLower != "start_mines") ||
		actLower == "chicken" || (gLower == "chicken" && actLower != "start_chicken") ||
		actLower == "slots" || gLower == "slots" ||
		actLower == "limbo" || gLower == "limbo" ||
		actLower == "upgrader" || gLower == "upgrader"

	if isRapid {
		e.rapidActions = pruneOlderThan(e.rapidActions, now, time.Minute)

		var violationReason string
		lastSec := countSince(e.rapidActions, now, time.Second)
		last10s := countSince(e.rapidActions, now, 10*time.Second)
		lastMin := countSince(e.rapidActions, now, time.Minute)

		switch {
		case lastSec >= rapidActionMaxPerSec:
			violationReason = fmt.Sprintf("%d rapid req/s (limit %d/s)", lastSec+1, rapidActionMaxPerSec)
		case last10s >= rapidActionMaxPer10s:
			violationReason = fmt.Sprintf("%d rapid req/10s (limit %d/10s)", last10s+1, rapidActionMaxPer10s)
		case lastMin >= rapidActionMaxPerMin:
			violationReason = fmt.Sprintf("%d rapid req/min (limit %d/min)", lastMin+1, rapidActionMaxPerMin)
		}

		e.rapidActions = append(e.rapidActions, now)

		if violationReason == "" {
			return true
		}

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

	// Standard turn-based games
	e.gameActions = pruneOlderThan(e.gameActions, now, time.Minute)

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
			if e.lastViolation.Before(cutoff) && len(e.gameActions) == 0 && len(e.rapidActions) == 0 && len(e.stateReads) == 0 {
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
		"col1": true, "col2": true, "col3": true,
		"column1": true, "column2": true, "column3": true,
		"2to1_1": true, "2to1_2": true, "2to1_3": true,
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

// ============================================================================
// Plinko Active Drop & Configuration Lock Tracker
// ============================================================================

const PlinkoDropDuration = 2500 * time.Millisecond

type PlinkoDropState struct {
	LastDropTime time.Time
	Rows         int
	Risk         string
}

type PlinkoTracker struct {
	mu     sync.Mutex
	states map[string]*PlinkoDropState
}

func NewPlinkoTracker() *PlinkoTracker {
	t := &PlinkoTracker{
		states: make(map[string]*PlinkoDropState),
	}
	go t.cleanupLoop()
	return t
}

// ValidateAndRecordDrop checks if a player is attempting to change rows or risk while previous balls are still in flight.
// Returns an error if an in-flight configuration change is attempted.
func (pt *PlinkoTracker) ValidateAndRecordDrop(userID string, rows int, risk string) error {
	pt.mu.Lock()
	defer pt.mu.Unlock()

	now := time.Now()
	state, exists := pt.states[userID]
	if exists && now.Sub(state.LastDropTime) < PlinkoDropDuration {
		if state.Rows != rows || state.Risk != risk {
			return fmt.Errorf("%w: nie możesz zmienić liczby rzędów ani poziomu ryzyka podczas trwania zrzutu kulek (poczekaj na zakończenie lotu kulek)", ErrInvalidMove)
		}
	}

	pt.states[userID] = &PlinkoDropState{
		LastDropTime: now,
		Rows:         rows,
		Risk:         risk,
	}
	return nil
}

func (pt *PlinkoTracker) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		pt.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for uid, s := range pt.states {
			if s.LastDropTime.Before(cutoff) {
				delete(pt.states, uid)
			}
		}
		pt.mu.Unlock()
	}
}

func ValidatePlinkoParams(rows int, risk string) error {
	if rows != 14 && rows != 16 {
		return fmt.Errorf("%w: plinko rows musi wynosić 14 lub 16", ErrInvalidGameParam)
	}
	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		return fmt.Errorf("%w: poziom ryzyka w plinko musi być low/medium/high", ErrInvalidGameParam)
	}
	return nil
}

func ValidateLimboTarget(target float64) error {
	if target < 1.50 || target > 10000.0 {
		return fmt.Errorf("%w: cel w Limbo musi wynosić od 1.50x do 10,000x", ErrInvalidGameParam)
	}
	return nil
}

func ValidateUpgraderTarget(target float64) error {
	if target < 1.50 || target > 10000.0 {
		return fmt.Errorf("%w: cel w Upgrader musi wynosić od 1.50x do 10,000x", ErrInvalidGameParam)
	}
	return nil
}

func ValidateCrashTarget(target float64) error {
	if target < 0.80 || target > 1000.0 {
		return fmt.Errorf("%w: cel w Crash musi wynosić od 0.80x do 1,000x", ErrInvalidGameParam)
	}
	return nil
}

func ValidateMinesStart(mineCount int) error {
	if mineCount < 5 || mineCount > 24 {
		return fmt.Errorf("%w: liczba min musi wynosić od 5 do 24", ErrInvalidGameParam)
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

func ValidateChickenStart(difficulty string) error {
	return nil
}

func ValidateChickenStep(targetLane int, currentLane int) error {
	if targetLane != currentLane+1 {
		return fmt.Errorf("%w: można przejść tylko na kolejny pas (%d -> %d)", ErrInvalidMove, currentLane, currentLane+1)
	}
	if targetLane < 1 || targetLane > 17 {
		return fmt.Errorf("%w: pas poza zakresem (1-17): %d", ErrInvalidMove, targetLane)
	}
	return nil
}

func ValidateChickenCashout(currentLane int) error {
	if currentLane < 1 {
		return fmt.Errorf("%w: musisz pokonać przynajmniej jeden pas przed wypłatą", ErrInvalidMove)
	}
	return nil
}

// LogSecurityAlert logs suspicious or illegal operations to both stdout and bot log file.
func LogSecurityAlert(userID, action, details string) {
	LogSuspiciousActivity("SECURITY_ALERT", "unknown", userID, "", action, details)
}
