package slots

import (
	"testing"
)

func TestSlotsEvaluation(t *testing.T) {
	// 3 of a kind: 777 on middle line (Jackpot 50x)
	reels7 := [][]string{
		{"🍒", "7", "💎"},
		{"⭐", "7", "🔔"},
		{"🍋", "7", "🍒"},
	}
	res7 := EvaluateReels(reels7, 100)
	if !res7.Win || res7.Multiplier != 50.0 || res7.Payout != 5000 {
		t.Errorf("expected 3x 7 50x payout 5000, got mult %.2f payout %d", res7.Multiplier, res7.Payout)
	}

	// 3 of a kind: Diamonds (25x)
	reelsDiam := [][]string{
		{"7", "💎", "⭐"},
		{"🍒", "💎", "🔔"},
		{"🍋", "💎", "7"},
	}
	resDiam := EvaluateReels(reelsDiam, 100)
	if !resDiam.Win || resDiam.Multiplier != 25.0 || resDiam.Payout != 2500 {
		t.Errorf("expected 3x 💎 25x payout 2500, got mult %.2f payout %d", resDiam.Multiplier, resDiam.Payout)
	}

	// Pair of 7s (2.0x)
	reelsPair7 := [][]string{
		{"🍒", "7", "💎"},
		{"⭐", "7", "🔔"},
		{"🍋", "🍒", "7"},
	}
	resPair7 := EvaluateReels(reelsPair7, 10)
	if !resPair7.Win || resPair7.Multiplier != 2.0 || resPair7.Payout != 20 {
		t.Errorf("expected pair of 7s 2.0x payout 20, got mult %.2f payout %d", resPair7.Multiplier, resPair7.Payout)
	}

	// Loss: all different symbols on middle line
	reelsLoss := [][]string{
		{"7", "🍒", "💎"},
		{"⭐", "🍋", "🔔"},
		{"🍋", "🔔", "7"},
	}
	resLoss := EvaluateReels(reelsLoss, 100)
	if resLoss.Win || resLoss.Payout != 0 {
		t.Errorf("expected loss for all different, got win %v payout %d", resLoss.Win, resLoss.Payout)
	}
}

func TestSlotsRTP(t *testing.T) {
	var totalPayout float64
	var totalSpins float64

	for i0 := 0; i0 < len(Symbols); i0++ {
		for i1 := 0; i1 < len(Symbols); i1++ {
			for i2 := 0; i2 < len(Symbols); i2++ {
				reels := [][]string{
					{"X", Symbols[i0], "X"},
					{"X", Symbols[i1], "X"},
					{"X", Symbols[i2], "X"},
				}
				res := EvaluateReels(reels, 100)
				totalPayout += float64(res.Payout)
				totalSpins++
			}
		}
	}

	rtp := totalPayout / (totalSpins * 100.0)
	if rtp < 0.95 || rtp > 0.98 {
		t.Errorf("expected balanced RTP between 95%% and 98%%, got %.4f (%.2f%%)", rtp, rtp*100)
	}
}
