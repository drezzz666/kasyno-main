package chicken

import (
	"testing"
)

func TestInitialStart(t *testing.T) {
	diffs := []string{"easy", "medium", "hard", "expert", "invalid_diff"}
	for _, d := range diffs {
		p := InitialStart(d)
		if p.CurrentLane != 0 {
			t.Errorf("expected CurrentLane 0, got %d", p.CurrentLane)
		}
		if p.Multiplier != 1.00 {
			t.Errorf("expected Multiplier 1.00, got %f", p.Multiplier)
		}
		if len(p.Multipliers) != TotalLanes {
			t.Errorf("expected %d multipliers, got %d", TotalLanes, len(p.Multipliers))
		}
		masked := MaskChicken(p)
		if masked.HazardLane != 0 || masked.HazardType != "" {
			t.Errorf("masked payload leaked hazard information")
		}
	}
}

func TestDifficultyMultipliers(t *testing.T) {
	mults := GetMultipliers("classic")
	if mults[0] != 1.15 || mults[TotalLanes-1] != 1117.20 {
		t.Errorf("multipliers mismatch: start %f, end %f", mults[0], mults[TotalLanes-1])
	}
}

func TestCashoutValidation(t *testing.T) {
	p := InitialStart("classic")
	_, err := Cashout(100, p)
	if err == nil {
		t.Errorf("expected error cashing out at lane 0")
	}

	p.CurrentLane = 1
	p.Multiplier = 1.15
	res, err := Cashout(100, p)
	if err != nil {
		t.Fatalf("unexpected error cashing out at lane 1: %v", err)
	}
	if res.Payout != 115 {
		t.Errorf("expected payout 115, got %d", res.Payout)
	}
}

func TestStepSimulation(t *testing.T) {
	p := InitialStart("medium")
	var bet int64 = 100

	for lane := 1; lane <= TotalLanes; lane++ {
		settled, res, err := Step(bet, &p)
		if err != nil {
			t.Fatalf("unexpected step error: %v", err)
		}
		if settled {
			if res.Payout == 0 {
				if res.Payload.HazardLane != lane {
					t.Errorf("expected hazard lane %d, got %d", lane, res.Payload.HazardLane)
				}
			} else {
				if lane != TotalLanes {
					t.Errorf("settled with win before total lanes: lane %d", lane)
				}
			}
			break
		} else {
			if p.CurrentLane != lane {
				t.Errorf("expected current lane %d, got %d", lane, p.CurrentLane)
			}
		}
	}
}
