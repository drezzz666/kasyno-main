package plinko

import (
	"testing"
)

func TestPlayPlinkoAllCombinations(t *testing.T) {
	risks := []string{"low", "medium", "high"}
	for _, risk := range risks {
		for rows := 8; rows <= 16; rows++ {
			res, err := PlayPlinko(100, rows, risk)
			if err != nil {
				t.Fatalf("unexpected error for rows=%d risk=%s: %v", rows, risk, err)
			}
			if res.Payload.Rows != rows {
				t.Errorf("expected rows %d, got %d", rows, res.Payload.Rows)
			}
			if len(res.Payload.Path) != rows {
				t.Errorf("expected path length %d, got %d", rows, len(res.Payload.Path))
			}
			if res.Payload.Slot < 0 || res.Payload.Slot > rows {
				t.Errorf("invalid slot %d for rows %d", res.Payload.Slot, rows)
			}
			if res.Payload.Multiplier <= 0 {
				t.Errorf("expected positive multiplier, got %f", res.Payload.Multiplier)
			}
			if res.Payout < 0 {
				t.Errorf("expected non-negative payout, got %d", res.Payout)
			}
		}
	}
}

func TestPlayPlinkoDefaults(t *testing.T) {
	// Invalid rows should normalize to 10
	res, err := PlayPlinko(50, 999, "invalid_risk")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Payload.Rows != 10 {
		t.Errorf("expected normalized rows 10, got %d", res.Payload.Rows)
	}
	if res.Payload.Risk != "medium" {
		t.Errorf("expected normalized risk medium, got %s", res.Payload.Risk)
	}
}
