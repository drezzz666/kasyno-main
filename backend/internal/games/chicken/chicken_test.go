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
	easyMults := GetMultipliers("easy")
	if easyMults[0] != 0.90 || easyMults[TotalLanes-1] != 6.20 {
		t.Errorf("easy multipliers mismatch: start %f, end %f", easyMults[0], easyMults[TotalLanes-1])
	}

	mediumMults := GetMultipliers("medium")
	if mediumMults[0] != 0.75 || mediumMults[1] != 1.15 {
		t.Errorf("medium multipliers mismatch: start %f, second %f", mediumMults[0], mediumMults[1])
	}

	expertMults := GetMultipliers("expert")
	if expertMults[0] != 0.50 || expertMults[1] != 0.90 || expertMults[TotalLanes-1] != 4000.00 {
		t.Errorf("expert multipliers mismatch: start %f, second %f, end %f", expertMults[0], expertMults[1], expertMults[TotalLanes-1])
	}
}

func TestCashoutValidation(t *testing.T) {
	p := InitialStart("medium")
	_, err := Cashout(100, p)
	if err == nil {
		t.Errorf("expected error cashing out at lane 0")
	}

	p.CurrentLane = 1
	p.Multiplier = 0.75
	res, err := Cashout(100, p)
	if err != nil {
		t.Fatalf("unexpected error cashing out at lane 1: %v", err)
	}
	if res.Payout != 75 {
		t.Errorf("expected payout 75, got %d", res.Payout)
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
