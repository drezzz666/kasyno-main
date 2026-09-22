package rps

import (
	"testing"
)

func TestPlayRPSValidChoices(t *testing.T) {
	validChoices := []string{"rock", "paper", "scissors", "kamien", "papier", "nozyce"}
	for _, c := range validChoices {
		res, err := PlayRPS(100, c)
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", c, err)
		}
		if res.Outcome != "win" && res.Outcome != "tie" && res.Outcome != "loss" {
			t.Errorf("unexpected outcome %s", res.Outcome)
		}
		switch res.Outcome {
		case "win":
			if res.Payout != 198 {
				t.Errorf("expected win payout 198, got %d", res.Payout)
			}
		case "tie":
			if res.Payout != 100 {
				t.Errorf("expected tie payout 100, got %d", res.Payout)
			}
		case "loss":
			if res.Payout != 0 {
				t.Errorf("expected loss payout 0, got %d", res.Payout)
			}
		}
	}
}

func TestPlayRPSInvalid(t *testing.T) {
	_, err := PlayRPS(100, "fire")
	if err == nil {
		t.Errorf("expected error for invalid choice")
	}
}
