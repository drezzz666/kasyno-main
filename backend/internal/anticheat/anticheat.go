package anticheat

import (
	"errors"
	"fmt"
	"log"
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
	// Background garbage collection for inactive user mutexes
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
	return func() {
		entry.mu.Unlock()
	}
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

// Token-bucket Rate Limiter per User (Zero False Positives: High Burst Allowance)
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*userBucket
}

type userBucket struct {
	tokens     float64
	lastUpdate time.Time
}

func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{
		buckets: make(map[string]*userBucket),
	}
	go rl.cleanupLoop()
	return rl
}

// Allow allows up to 15 actions/second sustained, with a generous burst of 30.
// This gives zero false positives for manual clicking or multi-ball Plinko drops,
// while blocking automated DDoS/packet flood exploits.
func (rl *RateLimiter) Allow(userID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	const maxTokens = 30.0
	const refillRate = 15.0 // 15 tokens per second

	now := time.Now()
	b, ok := rl.buckets[userID]
	if !ok {
		rl.buckets[userID] = &userBucket{
			tokens:     maxTokens - 1.0,
			lastUpdate: now,
		}
		return true
	}

	elapsed := now.Sub(b.lastUpdate).Seconds()
	b.tokens = b.tokens + elapsed*refillRate
	if b.tokens > maxTokens {
		b.tokens = maxTokens
	}
	b.lastUpdate = now

	if b.tokens >= 1.0 {
		b.tokens -= 1.0
		return true
	}

	log.Printf("[SECURITY/ANTICHEAT] Rate limit exceeded for user: %s (tokens: %.2f)", userID, b.tokens)
	return false
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-30 * time.Minute)
		for uid, b := range rl.buckets {
			if b.lastUpdate.Before(cutoff) {
				delete(rl.buckets, uid)
			}
		}
		rl.mu.Unlock()
	}
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

// LogSecurityAlert logs suspicious or illegal operations
func LogSecurityAlert(userID, action, details string) {
	log.Printf("[SECURITY/ANTICHEAT] User %s attempted invalid/exploit action '%s': %s", userID, action, details)
}
