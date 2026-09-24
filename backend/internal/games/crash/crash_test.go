package crash

import (
	"testing"
)

func TestGenerateCrashPoint(t *testing.T) {
	for i := 0; i < 1000; i++ {
		cp := GenerateCrashPoint()
		if cp < 0.80 {
			t.Fatalf("crash point %.2f is less than minimum 0.80x", cp)
		}
		if cp > 10000.00 {
			t.Fatalf("crash point %.2f is greater than maximum 10000.00x", cp)
		}
	}
}

func TestPlayCrash(t *testing.T) {
	// 1. Invalid target multiplier (too low)
	_, err := PlayCrash(100, 0.79)
	if err == nil {
		t.Errorf("expected error for targetMultiplier < 0.80")
	}

	// 2. Invalid target multiplier (too high)
	_, err = PlayCrash(100, 10001.00)
	if err == nil {
		t.Errorf("expected error for targetMultiplier > 10000.00")
	}

	// 3. Valid target multiplier 2.0x
	res, err := PlayCrash(100, 2.00)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Won {
		if res.Payout != 200 {
			t.Errorf("expected payout 200, got %d", res.Payout)
		}
		if res.Payload.Multiplier != 2.00 {
			t.Errorf("expected payload multiplier 2.00, got %.2f", res.Payload.Multiplier)
		}
	} else {
		if res.Payout != 0 {
			t.Errorf("expected payout 0 for loss, got %d", res.Payout)
		}
	}
}
