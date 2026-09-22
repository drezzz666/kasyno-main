package slots

import (
	"testing"
)

func TestSlotsEvaluation(t *testing.T) {
	// 5 of a kind: ♛ on middle line
	reels5 := [][]string{
		{"2", "♛", "F"},
		{"F", "♛", "G"},
		{"T", "♛", "2"},
		{"◆", "♛", "F"},
		{"2", "♛", "T"},
	}
	res5 := EvaluateReels(reels5, 100)
	if !res5.Win || res5.Multiplier != 12 || res5.Payout != 1200 {
		t.Errorf("expected 5 of a kind 12x payout 1200, got mult %d payout %d", res5.Multiplier, res5.Payout)
	}

	// 4 of a kind: "F"
	reels4 := [][]string{
		{"2", "F", "F"},
		{"F", "F", "G"},
		{"T", "F", "2"},
		{"◆", "F", "F"},
		{"2", "2", "T"},
	}
	res4 := EvaluateReels(reels4, 50)
	if !res4.Win || res4.Multiplier != 6 || res4.Payout != 300 {
		t.Errorf("expected 4 of a kind 6x payout 300, got mult %d payout %d", res4.Multiplier, res4.Payout)
	}

	// 3 of a kind: "G"
	reels3 := [][]string{
		{"2", "G", "F"},
		{"F", "G", "G"},
		{"T", "G", "2"},
		{"◆", "2", "F"},
		{"2", "T", "T"},
	}
	res3 := EvaluateReels(reels3, 10)
	if !res3.Win || res3.Multiplier != 2 || res3.Payout != 20 {
		t.Errorf("expected 3 of a kind 2x payout 20, got mult %d payout %d", res3.Multiplier, res3.Payout)
	}

	// Loss: 2 of one, 2 of another, 1 other
	reelsLoss := [][]string{
		{"2", "2", "F"},
		{"F", "2", "G"},
		{"T", "G", "2"},
		{"◆", "G", "F"},
		{"2", "T", "T"},
	}
	resLoss := EvaluateReels(reelsLoss, 100)
	if resLoss.Win || resLoss.Payout != 0 {
		t.Errorf("expected loss for <3 matching, got win %v payout %d", resLoss.Win, resLoss.Payout)
	}
}
