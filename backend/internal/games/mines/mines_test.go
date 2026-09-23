package mines

import (
	"testing"
)

func TestMinesMultiplier(t *testing.T) {
	// 5 mines: 1 diamond (< 1.00x, no instant profit)
	m1 := CalculateMultiplier(1, 5)
	if m1 >= 1.00 {
		t.Errorf("expected multiplier < 1.00 for 1 diamond with 5 mines, got %f", m1)
	}

	// 5 mines: 2 diamonds (> 1.00x, profit)
	m2 := CalculateMultiplier(2, 5)
	if m2 <= 1.00 || m2 <= m1 {
		t.Errorf("multiplier should be > 1.00 and increase with more revealed diamonds: m1=%f, m2=%f", m1, m2)
	}

	// 2 mines: 1 diamond (< 1.00x), 2 diamonds (< 1.00x), 3 diamonds (1.15x < 1.30x), 4 diamonds (1.25x < 1.30x)
	m2_1 := CalculateMultiplier(1, 2)
	m2_2 := CalculateMultiplier(2, 2)
	m2_3 := CalculateMultiplier(3, 2)
	m2_4 := CalculateMultiplier(4, 2)
	if m2_1 >= 1.00 {
		t.Errorf("expected multiplier < 1.00 for 1 diamond with 2 mines, got %f", m2_1)
	}
	if m2_2 >= 1.00 {
		t.Errorf("expected multiplier < 1.00 for 2 diamonds with 2 mines, got %f", m2_2)
	}
	if m2_3 <= 1.00 || m2_3 >= 1.30 {
		t.Errorf("expected 1.00 < multiplier < 1.30 for 3 diamonds with 2 mines, got %f", m2_3)
	}
	if m2_4 >= 1.30 {
		t.Errorf("expected multiplier < 1.30 for 4 diamonds with 2 mines, got %f", m2_4)
	}

	// 5 mines: 2 diamonds reaches >= 1.30x
	if m2 < 1.30 {
		t.Errorf("expected multiplier >= 1.30 for 2 diamonds with 5 mines, got %f", m2)
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
		Multiplier: 0.80,
	}

	// Reveal safe tile 10 (1 diamond)
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

	// Reveal second safe tile 11 (2 diamonds -> profit)
	settled2, settleRes2, err := RevealTile(100, &p, 11)
	if err != nil {
		t.Fatalf("unexpected error revealing second safe tile: %v", err)
	}
	if settled2 || settleRes2 != nil {
		t.Errorf("game should not settle on second safe diamond")
	}

	// Cashout at 2 diamonds
	res, err := Cashout(100, p)
	if err != nil {
		t.Fatalf("unexpected error during cashout: %v", err)
	}
	if res.Payout <= 100 {
		t.Errorf("expected cashout payout > 100 for 2 diamonds, got %d", res.Payout)
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
