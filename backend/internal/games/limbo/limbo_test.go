package limbo

import (
	"testing"
)

func TestGenerateLimboMultiplier(t *testing.T) {
	for i := 0; i < 500; i++ {
		m := GenerateLimboMultiplier()
		if m < 1.00 {
			t.Fatalf("multiplier %.2f is less than 1.00x", m)
		}
	}
}

func TestPlayLimbo(t *testing.T) {
	// 1. Invalid bounds
	_, err := PlayLimbo(100, 1.15)
	if err == nil {
		t.Errorf("expected error for targetMultiplier < 1.20")
	}

	_, err = PlayLimbo(100, 10001.00)
	if err == nil {
		t.Errorf("expected error for targetMultiplier > 10000.00")
	}

	// 2. Valid round
	res, err := PlayLimbo(100, 2.00)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Won {
		if res.Payout != 200 {
			t.Errorf("expected payout 200 on win, got %d", res.Payout)
		}
	} else {
		if res.Payout != 0 {
			t.Errorf("expected payout 0 on loss, got %d", res.Payout)
		}
	}
}
