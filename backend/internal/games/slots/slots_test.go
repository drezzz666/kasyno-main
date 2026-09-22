package slots

import (
	"testing"
)

func TestSlotsEvaluation(t *testing.T) {
	// 5 of a kind: ♛ on middle line (Jackpot 150x)
	reels5 := [][]string{
		{"2", "♛", "F"},
		{"F", "♛", "G"},
		{"T", "♛", "2"},
		{"◆", "♛", "F"},
		{"2", "♛", "T"},
	}
	res5 := EvaluateReels(reels5, 100)
	if !res5.Win || res5.Multiplier != 150.0 || res5.Payout != 15000 {
		t.Errorf("expected 5 of a kind 150x payout 15000, got mult %.2f payout %d", res5.Multiplier, res5.Payout)
	}

	// 4 of a kind: "F" (6x)
	reels4 := [][]string{
		{"2", "F", "F"},
		{"F", "F", "G"},
		{"T", "F", "2"},
		{"◆", "F", "F"},
		{"2", "2", "T"},
	}
	res4 := EvaluateReels(reels4, 50)
	if !res4.Win || res4.Multiplier != 6.0 || res4.Payout != 300 {
		t.Errorf("expected 4 of a kind 6x payout 300, got mult %.2f payout %d", res4.Multiplier, res4.Payout)
	}

	// 3 of a kind: "G" (1.4x)
	reels3 := [][]string{
		{"2", "G", "F"},
		{"F", "G", "G"},
		{"T", "G", "2"},
		{"◆", "2", "F"},
		{"2", "T", "T"},
	}
	res3 := EvaluateReels(reels3, 10)
	if !res3.Win || res3.Multiplier != 1.4 || res3.Payout != 14 {
		t.Errorf("expected 3 of a kind 1.4x payout 14, got mult %.2f payout %d", res3.Multiplier, res3.Payout)
	}

	// Loss: all different symbols on middle line
	reelsLoss := [][]string{
		{"2", "2", "F"},
		{"F", "F", "G"},
		{"T", "G", "2"},
		{"◆", "T", "F"},
		{"2", "◆", "T"},
	}
	resLoss := EvaluateReels(reelsLoss, 100)
	if resLoss.Win || resLoss.Payout != 0 {
		t.Errorf("expected loss for all different, got win %v payout %d", resLoss.Win, resLoss.Payout)
	}
}
