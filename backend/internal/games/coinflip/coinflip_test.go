package coinflip

import (
	"testing"
)

func TestPlayCoinflipValidChoices(t *testing.T) {
	validChoices := []string{"heads", "tails", "orzel", "reszka", "HEADS", " Tails "}
	for _, c := range validChoices {
		res, err := PlayCoinflip(100, c)
		if err != nil {
			t.Fatalf("unexpected error for choice %q: %v", c, err)
		}
		if res.Payload.Outcome != "heads" && res.Payload.Outcome != "tails" {
			t.Errorf("unexpected outcome %s", res.Payload.Outcome)
		}
		if res.Won {
			if res.Payout != 198 {
				t.Errorf("expected win payout 198, got %d", res.Payout)
			}
		} else {
			if res.Payout != 0 {
				t.Errorf("expected loss payout 0, got %d", res.Payout)
			}
		}
	}
}

func TestPlayCoinflipInvalidChoice(t *testing.T) {
	_, err := PlayCoinflip(100, "invalid")
	if err == nil {
		t.Errorf("expected error for invalid choice")
	}
}
