package mines

import (
	"encoding/json"
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

const TotalTiles = 25

type Payload struct {
	Mines      []int   `json:"mines"`
	Revealed   []int   `json:"revealed"`
	MineCount  int     `json:"mineCount"`
	Multiplier float64 `json:"multiplier"`
}

type SettleResult struct {
	State      string  `json:"state"`
	Bet        int64   `json:"bet"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result"`
	Payload    Payload `json:"payload"`
}

// CalculateMultiplier returns the multiplier for given revealed count and mine count (96% RTP).
// Anti-exploit rules:
// - On 1st diamond for low mine counts (<= 5), returns partial refund (< 1.00x) to prevent 1-click spam.
// - 2 mines: profit requires 3 diamonds (1.14x), 1.30x+ requires 5 diamonds (1.38x).
// - 3 mines: profit at 2 diamonds (1.12x), 1.30x+ at 4 diamonds (1.44x).
// - 5+ mines: 1.30x+ is unlocked immediately from 2 diamonds (1.51x).
func CalculateMultiplier(revealedCount int, mineCount int) float64 {
	if revealedCount <= 0 {
		return 0.80
	}

	chance := 1.0
	for i := 0; i < revealedCount; i++ {
		chance *= float64(TotalTiles-mineCount-i) / float64(TotalTiles-i)
	}
	raw := 0.96 / chance

	if revealedCount == 1 && mineCount <= 5 {
		raw = math.Min(0.92, 0.76+float64(mineCount)*0.032)
	} else if mineCount == 2 {
		if revealedCount == 2 {
			raw = 0.95
		} else if revealedCount == 3 {
			raw = 1.14
		} else if revealedCount == 4 {
			raw = 1.25
		}
	} else if mineCount == 3 {
		if revealedCount == 2 {
			raw = 1.12
		} else if revealedCount == 3 {
			raw = 1.26
		}
	} else if mineCount == 4 {
		if revealedCount == 2 {
			raw = 1.18
		} else if revealedCount == 3 {
			raw = 1.28
		}
	}

	mult := math.Floor(raw*100) / 100
	return math.Max(0.80, mult)
}

// GenerateMines randomly selects unique mine positions in [0, TotalTiles)
func GenerateMines(mineCount int) []int {
	if mineCount < 2 {
		mineCount = 2
	}
	if mineCount > TotalTiles-1 {
		mineCount = TotalTiles - 1
	}

	minesMap := make(map[int]bool)
	for len(minesMap) < mineCount {
		tile := provablyfair.MustCryptoRandInt(TotalTiles)
		minesMap[tile] = true
	}

	mines := make([]int, 0, mineCount)
	for m := range minesMap {
		mines = append(mines, m)
	}
	return mines
}

// InitialStart creates a new Mines game payload
func InitialStart(mineCount int) Payload {
	if mineCount < 2 {
		mineCount = 5
	}
	if mineCount > 24 {
		mineCount = 24
	}

	mines := GenerateMines(mineCount)
	return Payload{
		Mines:      mines,
		Revealed:   []int{},
		MineCount:  mineCount,
		Multiplier: 0.80,
	}
}

// MaskMines hides mine locations from client during active play
func MaskMines(p Payload) Payload {
	masked := p
	masked.Mines = []int{}
	return masked
}

// IsMine checks if a given tile contains a mine
func (p *Payload) IsMine(tile int) bool {
	for _, m := range p.Mines {
		if m == tile {
			return true
		}
	}
	return false
}

// IsRevealed checks if a given tile has already been revealed
func (p *Payload) IsRevealed(tile int) bool {
	for _, r := range p.Revealed {
		if r == tile {
			return true
		}
	}
	return false
}

// RevealTile attempts to reveal a tile, returning whether game is finished and the result if settled
func RevealTile(bet int64, p *Payload, tile int) (bool, *SettleResult, error) {
	if tile < 0 || tile >= TotalTiles {
		return false, nil, fmt.Errorf("nieprawidłowe pole miny: %d", tile)
	}
	if p.IsRevealed(tile) {
		return false, nil, fmt.Errorf("pole %d zostało już odkryte", tile)
	}

	if p.IsMine(tile) {
		// Hit a bomb -> BUST!
		settle := &SettleResult{
			State:      "settled",
			Bet:        bet,
			Payout:     0,
			ResultText: "Trafiona mina",
			Payload:    *p,
		}
		return true, settle, nil
	}

	// Safe diamond!
	p.Revealed = append(p.Revealed, tile)
	p.Multiplier = CalculateMultiplier(len(p.Revealed), p.MineCount)

	// Max safe tiles reached!
	if len(p.Revealed) == TotalTiles-p.MineCount {
		payout := int64(float64(bet) * p.Multiplier)
		settle := &SettleResult{
			State:      "settled",
			Bet:        bet,
			Payout:     payout,
			ResultText: fmt.Sprintf("Maksymalna wygrana ×%.2f", p.Multiplier),
			Payload:    *p,
		}
		return true, settle, nil
	}

	return false, nil, nil
}

// Cashout settles an active game at current multiplier
func Cashout(bet int64, p Payload) (*SettleResult, error) {
	if len(p.Revealed) == 0 {
		return nil, fmt.Errorf("odkryj przynajmniej jedno pole przed wypłatą")
	}

	payout := int64(float64(bet) * p.Multiplier)
	return &SettleResult{
		State:      "settled",
		Bet:        bet,
		Payout:     payout,
		ResultText: fmt.Sprintf("Cash-out ×%.2f", p.Multiplier),
		Payload:    p,
	}, nil
}

// ParsePayload deserializes JSON string into Payload
func ParsePayload(jsonStr string) (*Payload, error) {
	var p Payload
	if err := json.Unmarshal([]byte(jsonStr), &p); err != nil {
		return nil, fmt.Errorf("invalid mines payload: %w", err)
	}
	return &p, nil
}
