package ledger

import (
	"math"
	"sync"
	"sync/atomic"
	"testing"
)

// TestCalculateXPGain_BoundaryFuzzing tests all boundary cases and extreme inputs for XP calculation.
func TestCalculateXPGain_BoundaryFuzzing(t *testing.T) {
	testCases := []struct {
		name     string
		bet      int64
		expected int
	}{
		{"Negative Bet", -100, 0},
		{"Zero Bet", 0, 0},
		{"Micro Bet 1", 1, 0},
		{"Micro Bet 9 (below threshold)", 9, 0},
		{"Threshold Bet 10 (floor(sqrt(10)/4) = 0 -> clamped to min 1)", 10, 1},
		{"Bet 16 (floor(4/4) = 1)", 16, 1},
		{"Bet 64 (floor(8/4) = 2)", 64, 2},
		{"Bet 100 (floor(10/4) = 2)", 100, 2},
		{"Bet 10000 (floor(100/4) = 25 -> clamped to max 15)", 10000, 15},
		{"Huge Bet 100_000_000", 100000000, 15},
		{"Max Int64 Bet", math.MaxInt64, 15},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateXPGain(tc.bet)
			if got != tc.expected {
				t.Errorf("CalculateXPGain(%d) = %d; want %d", tc.bet, got, tc.expected)
			}
			if got < 0 || got > 15 {
				t.Errorf("CalculateXPGain(%d) returned out-of-range XP: %d (must be in [0, 15])", tc.bet, got)
			}
		})
	}
}

// TestDailyBonus_Fuzzing verifies streak calculations, cap enforcement, and monotonic non-decreasing behavior.
func TestDailyBonus_Fuzzing(t *testing.T) {
	prevBonus := int64(0)
	for streak := 0; streak <= 1000; streak++ {
		bonus := DailyBonusAmount(streak)
		if bonus < 200 {
			t.Fatalf("DailyBonusAmount(%d) = %d is below minimum bonus 200", streak, bonus)
		}
		if bonus > 2000 {
			t.Fatalf("DailyBonusAmount(%d) = %d exceeded max bonus cap 2000", streak, bonus)
		}
		if bonus < prevBonus {
			t.Fatalf("DailyBonusAmount(%d) = %d decreased compared to previous streak bonus %d", streak, bonus, prevBonus)
		}
		prevBonus = bonus
	}
}

// TestSimulatedAtomicBalanceInvariants simulates high-concurrency race condition scenarios
// to verify that atomic checks prevent balance going below zero.
func TestSimulatedAtomicBalanceInvariants(t *testing.T) {
	initialBalance := int64(1000)
	var currentBalance atomic.Int64
	currentBalance.Store(initialBalance)

	betAmount := int64(100)
	numGoroutines := 50
	var wg sync.WaitGroup
	var successfulBets atomic.Int64
	var rejectedBets atomic.Int64

	// Concurrently attempt to debit 50 * 100 = 5000 from an account with only 1000 balance
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				bal := currentBalance.Load()
				if bal < betAmount {
					rejectedBets.Add(1)
					return
				}
				if currentBalance.CompareAndSwap(bal, bal-betAmount) {
					successfulBets.Add(1)
					return
				}
			}
		}()
	}

	wg.Wait()

	finalBalance := currentBalance.Load()
	if finalBalance < 0 {
		t.Fatalf("CRITICAL INVARIANT VIOLATION: Balance fell below zero: %d", finalBalance)
	}

	expectedSuccessful := initialBalance / betAmount
	if successfulBets.Load() != expectedSuccessful {
		t.Errorf("Expected exactly %d successful bets, got %d", expectedSuccessful, successfulBets.Load())
	}

	if rejectedBets.Load() != int64(numGoroutines)-expectedSuccessful {
		t.Errorf("Expected %d rejected bets, got %d", int64(numGoroutines)-expectedSuccessful, rejectedBets.Load())
	}

	if finalBalance != 0 {
		t.Errorf("Expected final balance 0, got %d", finalBalance)
	}
}
