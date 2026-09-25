package anticheat

import (
	"sync"
	"testing"
	"time"
)

func TestValidateBet(t *testing.T) {
	// Valid bets (zero false positives)
	if err := ValidateBet(1, 100); err != nil {
		t.Errorf("expected bet 1 to be valid, got %v", err)
	}
	if err := ValidateBet(50, 50); err != nil {
		t.Errorf("expected bet 50 with balance 50 to be valid, got %v", err)
	}
	if err := ValidateBet(10_000_000, 20_000_000); err != nil {
		t.Errorf("expected bet 10M to be valid, got %v", err)
	}

	// Invalid / exploit attempts
	if err := ValidateBet(0, 100); err == nil {
		t.Errorf("expected bet 0 to fail")
	}
	if err := ValidateBet(-500, 100); err == nil {
		t.Errorf("expected negative bet to fail")
	}
	if err := ValidateBet(100, 50); err == nil {
		t.Errorf("expected bet exceeding balance to fail")
	}
}

func TestValidateRouletteChoice(t *testing.T) {
	validChoices := []string{"red", "black", "even", "odd", "1-18", "19-36", "1st12", "2nd12", "3rd12", "0", "17", "36"}
	for _, c := range validChoices {
		if err := ValidateRouletteChoice(c); err != nil {
			t.Errorf("expected valid choice %s, got %v", c, err)
		}
	}

	invalidChoices := []string{"", "invalid", "37", "-1", "999", "green"}
	for _, c := range invalidChoices {
		if err := ValidateRouletteChoice(c); err == nil {
			t.Errorf("expected invalid choice %s to fail", c)
		}
	}
}

func TestValidateCoinflipAndRPS(t *testing.T) {
	if err := ValidateCoinflipChoice("heads"); err != nil {
		t.Errorf("expected heads to be valid")
	}
	if err := ValidateCoinflipChoice("tails"); err != nil {
		t.Errorf("expected tails to be valid")
	}
	if err := ValidateCoinflipChoice("edge"); err == nil {
		t.Errorf("expected edge to fail")
	}

	if err := ValidateRPSChoice("rock"); err != nil {
		t.Errorf("expected rock to be valid")
	}
	if err := ValidateRPSChoice("gun"); err == nil {
		t.Errorf("expected gun to fail")
	}
}

func TestValidateMines(t *testing.T) {
	if err := ValidateMinesStart(5); err != nil {
		t.Errorf("expected 5 mines to be valid")
	}
	if err := ValidateMinesStart(1); err == nil {
		t.Errorf("expected 1 mine to fail")
	}
	if err := ValidateMinesStart(25); err == nil {
		t.Errorf("expected 25 mines to fail")
	}

	revealed := []int{0, 1, 2}
	if err := ValidateMinesReveal(3, revealed); err != nil {
		t.Errorf("expected unrevealed tile 3 to pass")
	}
	if err := ValidateMinesReveal(1, revealed); err == nil {
		t.Errorf("expected already revealed tile 1 to fail")
	}
	if err := ValidateMinesReveal(25, revealed); err == nil {
		t.Errorf("expected out-of-bound tile 25 to fail")
	}
}

func TestUserLockManager(t *testing.T) {
	m := NewUserLockManager()
	var counter int
	var wg sync.WaitGroup

	// Run 50 concurrent operations on same user ID
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			unlock := m.LockUser("user_test_123")
			defer unlock()
			current := counter
			time.Sleep(1 * time.Millisecond)
			counter = current + 1
		}()
	}

	wg.Wait()
	if counter != 50 {
		t.Errorf("expected counter to be 50 without race condition, got %d", counter)
	}
}

func TestRateLimiter(t *testing.T) {
	rl := NewRateLimiter()
	uid := "user_burst_test"

	// 1. First 10 rapid game actions should pass (gameActionMaxPerSec = 10)
	for i := 0; i < 10; i++ {
		if !rl.Allow(uid) {
			t.Errorf("request %d within allowed limit should pass", i)
		}
	}

	// 2. 11th rapid request should be blocked
	if rl.Allow(uid) {
		t.Errorf("11th immediate request should exceed rate limit")
	}

	// 3. Test Plinko and Mines rate limiter (supports 25 CPS)
	plinkoUID := "user_plinko_spam_test"
	for i := 0; i < 25; i++ {
		if !rl.AllowGameAction(plinkoUID, "play", "plinko") {
			t.Errorf("plinko request %d within 25 CPS limit should pass", i+1)
		}
	}
	// 26th request within the same second should be blocked
	if rl.AllowGameAction(plinkoUID, "play", "plinko") {
		t.Errorf("26th plinko request within 1s should be rate limited")
	}

	minesUID := "user_mines_rapid_test"
	for i := 0; i < 25; i++ {
		if !rl.AllowGameAction(minesUID, "mines", "mines") {
			t.Errorf("mines rapid move %d within 25 CPS limit should pass", i+1)
		}
	}
	if rl.AllowGameAction(minesUID, "mines", "mines") {
		t.Errorf("26th mines move within 1s should be rate limited")
	}

	// 4. Test state read rate limiter (max 30/sec)
	readUID := "user_read_test"
	for i := 0; i < 30; i++ {
		if !rl.AllowStateRead(readUID) {
			t.Errorf("state read %d should be allowed", i)
		}
	}
	if rl.AllowStateRead(readUID) {
		t.Errorf("31st immediate state read should be blocked")
	}

	// 5. Test bot detection flag after threshold violations
	botUID := "user_bot_candidate"
	rl.SetIdentity(botUID, "BotPlayer", "127.0.0.1")
	// Exceed limit multiple times to trigger bot flag
	for i := 0; i < 15; i++ {
		rl.Allow(botUID)
	}
	flagged, _ := rl.IsFlaggedBot(botUID)
	if !flagged {
		t.Errorf("expected user to be flagged as bot after repeated violations")
	}
}

func TestPlinkoTracker(t *testing.T) {
	tracker := NewPlinkoTracker()
	uid := "user_plinko_test"

	// 1. Initial drop with 14 rows, medium risk -> OK
	if err := tracker.ValidateAndRecordDrop(uid, 14, "medium"); err != nil {
		t.Fatalf("first drop should succeed: %v", err)
	}

	// 2. Immediate rapid drop with SAME configuration (14, medium) -> OK (multi-ball drop)
	if err := tracker.ValidateAndRecordDrop(uid, 14, "medium"); err != nil {
		t.Fatalf("subsequent drop with same configuration should succeed: %v", err)
	}

	// 3. Immediate drop attempting to change rows (14 -> 16) while balls in flight -> MUST FAIL
	if err := tracker.ValidateAndRecordDrop(uid, 16, "medium"); err == nil {
		t.Errorf("expected error when changing rows mid-flight, got nil")
	}

	// 4. Immediate drop attempting to change risk (medium -> high) while balls in flight -> MUST FAIL
	if err := tracker.ValidateAndRecordDrop(uid, 14, "high"); err == nil {
		t.Errorf("expected error when changing risk mid-flight, got nil")
	}
}

