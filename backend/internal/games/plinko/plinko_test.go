package plinko

import (
	"testing"
)

func TestPlayPlinkoAllCombinations(t *testing.T) {
	risks := []string{"low", "medium", "high"}
	for _, risk := range risks {
		for _, rows := range []int{14, 16} {
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
			if res.Payload.Multiplier < 0 {
				t.Errorf("expected non-negative multiplier, got %f", res.Payload.Multiplier)
			}
			if res.Payout < 0 {
				t.Errorf("expected non-negative payout, got %d", res.Payout)
			}
		}
	}

	// Test fallback to 14 for invalid rows
	res, err := PlayPlinko(100, 8, "medium")
	if err != nil || res.Payload.Rows != 14 {
		t.Errorf("expected fallback to 14 rows, got %d (err: %v)", res.Payload.Rows, err)
	}
}

func binomialCoeff(n, k int) float64 {
	if k < 0 || k > n {
		return 0
	}
	if k == 0 || k == n {
		return 1
	}
	res := 1.0
	for i := 1; i <= k; i++ {
		res = res * float64(n-i+1) / float64(i)
	}
	return res
}

func TestPlinkoRTP(t *testing.T) {
	risks := []string{"low", "medium", "high"}
	for _, risk := range risks {
		for rows := 8; rows <= 16; rows++ {
			mults := Multipliers[risk][rows]
			totalPossible := 1.0
			for i := 0; i < rows; i++ {
				totalPossible *= 2.0
			}

			rtp := 0.0
			for slot, mult := range mults {
				prob := binomialCoeff(rows, slot) / totalPossible
				rtp += prob * mult
			}
			t.Logf("Risk: %-6s | Rows: %2d | RTP: %6.2f%% (House Edge: %5.2f%%)", risk, rows, rtp*100, (1.0-rtp)*100)
		}
	}
}
