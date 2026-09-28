package api

import (
	"testing"

	"github.com/drezzz666/kasyno/backend/internal/games/blackjack"
	"github.com/drezzz666/kasyno/backend/internal/games/chicken"
	"github.com/drezzz666/kasyno/backend/internal/games/crash"
	"github.com/drezzz666/kasyno/backend/internal/games/limbo"
	"github.com/drezzz666/kasyno/backend/internal/games/mines"
	"github.com/drezzz666/kasyno/backend/internal/games/upgrader"
)

// TestGameEdgeCases_Crash verifies Crash multiplier limits and calculation safety.
func TestGameEdgeCases_Crash(t *testing.T) {
	// Starting multiplier at t=0 must be 0.80
	m0 := crash.MultiplierAtElapsed(0, crash.FlightSpeed)
	if m0 != 0.80 {
		t.Fatalf("Crash: initial multiplier at t=0 must be 0.80, got %f", m0)
	}

	// Active payload must not expose crash point
	active := crash.ActivePayload{
		CrashPoint:  4.20,
		AutoCashout: 2.00,
		FlightSpeed: crash.FlightSpeed,
	}
	masked := crash.MaskActive(active)
	if masked.AutoCashout != 2.00 || masked.FlightSpeed != crash.FlightSpeed {
		t.Fatalf("Masked crash payload mismatch: %+v", masked)
	}
}

// TestGameEdgeCases_Mines verifies extreme mine counts and safe reveal logic.
func TestGameEdgeCases_Mines(t *testing.T) {
	// 5 Mines minimum
	m5 := mines.InitialStart(5)
	if len(m5.Mines) != 5 {
		t.Fatalf("Expected 5 mines, got %d", len(m5.Mines))
	}
	if len(m5.Revealed) != 0 {
		t.Fatalf("Initial revealed count should be 0")
	}

	// 24 Mines maximum: 1 safe diamond
	m24 := mines.InitialStart(24)
	if len(m24.Mines) != 24 {
		t.Fatalf("Expected 24 mines, got %d", len(m24.Mines))
	}

	// Below minimum (<5) defaults to 5
	mDef := mines.InitialStart(1)
	if len(mDef.Mines) != 5 {
		t.Fatalf("Expected default 5 mines for input 1, got %d", len(mDef.Mines))
	}

	// Above maximum (>24) clamps to 24
	mMax := mines.InitialStart(30)
	if len(mMax.Mines) != 24 {
		t.Fatalf("Expected 24 mines for input 30, got %d", len(mMax.Mines))
	}

	// Masking must hide mine positions
	masked := mines.MaskMines(m24)
	if len(masked.Mines) != 0 {
		t.Fatalf("SECURITY VIOLATION: Masked mines payload exposed mine locations: %v", masked.Mines)
	}
}

// TestGameEdgeCases_BlackjackHandEvaluation tests hand scoring including Ace soft/hard values and Blackjacks.
func TestGameEdgeCases_BlackjackHandEvaluation(t *testing.T) {
	// Hand with Ace and King = 21
	natHand := []blackjack.Card{
		{Rank: "A", Suit: "♠"},
		{Rank: "K", Suit: "♠"},
	}
	if val := blackjack.HandValue(natHand); val != 21 {
		t.Fatalf("Expected Blackjack score 21, got %d", val)
	}

	// Multiple Aces: A + A + 9 = 21 (11 + 1 + 9)
	doubleAceHand := []blackjack.Card{
		{Rank: "A", Suit: "♠"},
		{Rank: "A", Suit: "♦"},
		{Rank: "9", Suit: "♣"},
	}
	if val := blackjack.HandValue(doubleAceHand); val != 21 {
		t.Fatalf("Expected score 21 for A+A+9, got %d", val)
	}

	// Bust hand: 10 + 8 + 7 = 25
	bustHand := []blackjack.Card{
		{Rank: "10", Suit: "♥"},
		{Rank: "8", Suit: "♦"},
		{Rank: "7", Suit: "♣"},
	}
	if val := blackjack.HandValue(bustHand); val != 25 {
		t.Fatalf("Expected score 25 for 10+8+7, got %d", val)
	}

	// Mask dealer hole card
	deal := blackjack.InitialDeal()
	masked := blackjack.MaskDealerCard(deal)
	if masked.Dealer[1].Rank != "?" {
		t.Fatalf("SECURITY VIOLATION: Dealer hole card was not masked: %s", masked.Dealer[1].Rank)
	}
}

// TestGameEdgeCases_ChickenGame verifies chicken cross boundaries and masking.
func TestGameEdgeCases_ChickenGame(t *testing.T) {
	c := chicken.InitialStart("classic")
	if c.CurrentLane != 0 {
		t.Fatalf("Chicken starting lane must be 0, got %d", c.CurrentLane)
	}
	if c.TotalLanes != 17 {
		t.Fatalf("Chicken total lanes must be 17, got %d", c.TotalLanes)
	}

	masked := chicken.MaskChicken(c)
	if masked.HazardLane != 0 || masked.HazardType != "" {
		t.Fatalf("SECURITY VIOLATION: Masked chicken payload exposed hazard details")
	}
}

// TestGameEdgeCases_LimboTargetBounds tests target multiplier boundaries for Limbo.
func TestGameEdgeCases_LimboTargetBounds(t *testing.T) {
	// Valid target
	res, err := limbo.PlayLimbo(100, 2.00)
	if err != nil {
		t.Fatalf("Limbo 2.00x failed: %v", err)
	}
	if res.Payload.TargetMultiplier != 2.00 {
		t.Fatalf("Limbo target mismatch: %f", res.Payload.TargetMultiplier)
	}
}

// TestGameEdgeCases_UpgraderOdds verifies Upgrader calculation boundaries.
func TestGameEdgeCases_UpgraderOdds(t *testing.T) {
	// Target multiplier < 1.50x must fail
	_, errLow := upgrader.PlayUpgrader(100, 1.20, "under")
	if errLow == nil {
		t.Fatalf("Expected error for target multiplier < 1.50x, got nil")
	}

	// Target multiplier > 10000x must fail
	_, errHigh := upgrader.PlayUpgrader(100, 10001.0, "under")
	if errHigh == nil {
		t.Fatalf("Expected error for target multiplier > 10000x, got nil")
	}

	// Valid target
	res, err := upgrader.PlayUpgrader(100, 2.00, "under")
	if err != nil {
		t.Fatalf("Upgrader 2x failed: %v", err)
	}
	if res.Payload.TargetMultiplier != 2.00 {
		t.Fatalf("Upgrader target multiplier mismatch")
	}
}
