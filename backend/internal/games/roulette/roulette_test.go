package roulette

import (
	"testing"
)

func TestRouletteEvaluation(t *testing.T) {
	// Red 7
	win, payout, mult := EvaluateSpin(7, "red", 100)
	if !win || payout != 200 || mult != 2 {
		t.Errorf("expected 200 payout for red on 7, got %d", payout)
	}

	// Black 7 (should lose)
	win, payout, _ = EvaluateSpin(7, "black", 100)
	if win || payout != 0 {
		t.Errorf("expected loss for black on 7, got payout %d", payout)
	}

	// Straight number 17
	win, payout, mult = EvaluateSpin(17, "17", 50)
	if !win || payout != 50*36 || mult != 36 {
		t.Errorf("expected 1800 payout for straight 17, got %d", payout)
	}

	// Dozen 1 on 12 (win)
	win, payout, mult = EvaluateSpin(12, "dozen1", 100)
	if !win || payout != 300 || mult != 3 {
		t.Errorf("expected 300 payout for dozen1 on 12, got %d", payout)
	}

	// Column 1 on 4 (win)
	win, payout, mult = EvaluateSpin(4, "col1", 100)
	if !win || payout != 300 || mult != 3 {
		t.Errorf("expected 300 payout for col1 on 4, got %d", payout)
	}

	// Column 2 on 5 (win)
	win, payout, mult = EvaluateSpin(5, "col2", 100)
	if !win || payout != 300 || mult != 3 {
		t.Errorf("expected 300 payout for col2 on 5, got %d", payout)
	}

	// Column 3 on 6 (win)
	win, payout, mult = EvaluateSpin(6, "col3", 100)
	if !win || payout != 300 || mult != 3 {
		t.Errorf("expected 300 payout for col3 on 6, got %d", payout)
	}

	// Zero on even (should lose)
	win, payout, _ = EvaluateSpin(0, "even", 100)
	if win || payout != 0 {
		t.Errorf("expected 0 on even to lose, got %d", payout)
	}

	// Straight 0 (win)
	win, payout, mult = EvaluateSpin(0, "0", 100)
	if !win || payout != 3600 || mult != 36 {
		t.Errorf("expected 3600 on straight 0, got %d", payout)
	}
}

func TestCoveringAll37Numbers(t *testing.T) {
	// Covering all 37 numbers (0..36) with 10 $FGT each (total bet = 370 $FGT)
	bets := make(map[string]int64)
	for i := 0; i <= 36; i++ {
		bets[string(rune('0'+i))] = 10
	}
	// Correct string formatting for 0..36
	bets = make(map[string]int64)
	for i := 0; i <= 36; i++ {
		bets[string([]byte{byte('0' + i/10), byte('0' + i%10)})] = 10
	}
	// Let's populate cleanly
	bets = make(map[string]int64)
	for i := 0; i <= 36; i++ {
		bets[string(fmtSprint(i))] = 10
	}

	items, totalBet, totalPayout := EvaluateMultiBets(17, bets)
	if totalBet != 370 {
		t.Errorf("expected totalBet=370, got %d", totalBet)
	}
	if totalPayout != 360 {
		t.Errorf("expected totalPayout=360 (35:1 profit + bet = 360), got %d", totalPayout)
	}
	if len(items) != 37 {
		t.Errorf("expected 37 items, got %d", len(items))
	}
}

func fmtSprint(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}
