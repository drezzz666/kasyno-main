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

func TestValidateChoice(t *testing.T) {
	cases := []struct {
		choice string
		valid  bool
		mult   int
	}{
		{"red", true, 2},
		{"black", true, 2},
		{"even", true, 2},
		{"odd", true, 2},
		{"low", true, 2},
		{"high", true, 2},
		{"dozen1", true, 3},
		{"dozen2", true, 3},
		{"dozen3", true, 3},
		{"0", true, 36},
		{"36", true, 36},
		{"37", false, 0},
		{"-1", false, 0},
		{"invalid", false, 0},
	}

	for _, c := range cases {
		valid, mult := ValidateChoice(c.choice)
		if valid != c.valid || mult != c.mult {
			t.Errorf("choice %s: expected (valid: %v, mult: %d), got (valid: %v, mult: %d)",
				c.choice, c.valid, c.mult, valid, mult)
		}
	}
}
