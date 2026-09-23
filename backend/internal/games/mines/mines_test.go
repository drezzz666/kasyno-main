package mines

import (
	"testing"
)

func TestMinesMultiplier(t *testing.T) {
	// 5 mines: 1 diamond
	m1 := CalculateMultiplier(1, 5)
	if m1 < 1.1 {
		t.Errorf("expected multiplier > 1.1 for 1 diamond with 5 mines, got %f", m1)
	}

	// 5 mines: 2 diamonds
	m2 := CalculateMultiplier(2, 5)
	if m2 <= m1 {
		t.Errorf("multiplier should increase with more revealed diamonds: m1=%f, m2=%f", m1, m2)
	}

	// 0 diamonds -> 0.80
	m0 := CalculateMultiplier(0, 5)
	if m0 != 0.80 {
		t.Errorf("expected 0.80 for 0 diamonds, got %f", m0)
	}
}

func TestMinesRevealAndCashout(t *testing.T) {
	p := Payload{
		Mines:      []int{0, 1, 2, 3, 4},
		Revealed:   []int{},
		MineCount:  5,
		Multiplier: 1.0,
	}

	// Reveal safe tile 10
	settled, settleRes, err := RevealTile(100, &p, 10)
	if err != nil {
		t.Fatalf("unexpected error revealing safe tile: %v", err)
	}
	if settled || settleRes != nil {
		t.Errorf("game should not settle on first safe diamond")
	}
	if len(p.Revealed) != 1 || p.Revealed[0] != 10 {
		t.Errorf("expected tile 10 in revealed list, got %v", p.Revealed)
	}

	// Cashout
	res, err := Cashout(100, p)
	if err != nil {
		t.Fatalf("unexpected error during cashout: %v", err)
	}
	if res.Payout <= 100 {
		t.Errorf("expected cashout payout > 100, got %d", res.Payout)
	}
}

func TestMinesHitMine(t *testing.T) {
	p := Payload{
		Mines:      []int{0, 1, 2, 3, 4},
		Revealed:   []int{},
		MineCount:  5,
		Multiplier: 1.0,
	}

	// Reveal bomb tile 0
	settled, settleRes, err := RevealTile(100, &p, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !settled || settleRes == nil {
		t.Fatalf("game must settle on bomb")
	}
	if settleRes.Payout != 0 {
		t.Errorf("expected 0 payout on bomb, got %d", settleRes.Payout)
	}
}
