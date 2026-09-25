package slots

import (
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

var Symbols = []string{"2", "F", "G", "T", "◆", "♛"}

type Payload struct {
	Reels      [][]string `json:"reels"`
	Winning    bool       `json:"winning"`
	Multiplier float64    `json:"multiplier"`
	Combo      string     `json:"combo,omitempty"`
}

type SpinResult struct {
	Win        bool    `json:"win"`
	Payout     int64   `json:"payout"`
	Multiplier float64 `json:"multiplier"`
	ResultText string  `json:"result"`
	Payload    Payload `json:"payload"`
}

// GenerateReels generates a 5x3 grid of symbols
func GenerateReels() [][]string {
	reels := make([][]string, 5)
	for i := 0; i < 5; i++ {
		reels[i] = make([]string, 3)
		for j := 0; j < 3; j++ {
			sIdx := provablyfair.MustCryptoRandInt(len(Symbols))
			reels[i][j] = Symbols[sIdx]
		}
	}
	return reels
}

// EvaluateReels checks the middle payline (index 1 of each reel)
func EvaluateReels(reels [][]string, bet int64) *SpinResult {
	if len(reels) != 5 {
		return &SpinResult{Payout: 0, ResultText: "Błąd bębnów"}
	}

	counts := make(map[string]int)
	for i := 0; i < 5; i++ {
		if len(reels[i]) > 1 {
			symbol := reels[i][1]
			counts[symbol]++
		}
	}

	var pairs []string
	var triples []string
	var quads []string
	var fivers []string

	for symbol, count := range counts {
		if count == 5 {
			fivers = append(fivers, symbol)
		} else if count == 4 {
			quads = append(quads, symbol)
		} else if count == 3 {
			triples = append(triples, symbol)
		} else if count == 2 {
			pairs = append(pairs, symbol)
		}
	}

	var multiplier float64
	var comboName string

	if len(fivers) > 0 {
		sym := fivers[0]
		if sym == "♛" {
			multiplier = 100.0 // Jackpot
			comboName = "5x Korona ♛ (JACKPOT)"
		} else if sym == "◆" {
			multiplier = 40.0
			comboName = "5x Diament ◆"
		} else {
			multiplier = 15.0
			comboName = fmt.Sprintf("5x Symbol %s", sym)
		}
	} else if len(quads) > 0 {
		sym := quads[0]
		if sym == "♛" {
			multiplier = 20.0
			comboName = "4x Korona ♛"
		} else if sym == "◆" {
			multiplier = 10.0
			comboName = "4x Diament ◆"
		} else {
			multiplier = 5.0
			comboName = fmt.Sprintf("4x Symbol %s", sym)
		}
	} else if len(triples) > 0 && len(pairs) > 0 {
		multiplier = 6.0
		comboName = fmt.Sprintf("Full House (%s & %s)", triples[0], pairs[0])
	} else if len(triples) > 0 {
		sym := triples[0]
		if sym == "♛" {
			multiplier = 4.0
			comboName = "3x Korona ♛"
		} else if sym == "◆" {
			multiplier = 2.5
			comboName = "3x Diament ◆"
		} else {
			multiplier = 1.5
			comboName = fmt.Sprintf("3x Symbol %s", sym)
		}
	}

	win := multiplier > 0
	payout := int64(math.Floor(float64(bet) * multiplier))

	resultText := "Brak wygranej"
	if win {
		resultText = fmt.Sprintf("%s — Wygrana ×%.2f", comboName, multiplier)
	}

	return &SpinResult{
		Win:        win,
		Payout:     payout,
		Multiplier: multiplier,
		ResultText: resultText,
		Payload: Payload{
			Reels:      reels,
			Winning:    win,
			Multiplier: multiplier,
			Combo:      comboName,
		},
	}
}

// PlaySlots executes a slot spin
func PlaySlots(bet int64) (*SpinResult, error) {
	if bet <= 0 {
		return nil, fmt.Errorf("stawka musi być większa od 0")
	}

	reels := GenerateReels()
	return EvaluateReels(reels, bet), nil
}

// GenerateReelsProvablyFair generates a 5x3 grid deterministically using provably fair seeds
func GenerateReelsProvablyFair(serverSeed, clientSeed string, nonce int64) [][]string {
	reels := make([][]string, 5)
	for i := 0; i < 5; i++ {
		reels[i] = make([]string, 3)
		for j := 0; j < 3; j++ {
			sIdx := provablyfair.GenerateInt(serverSeed, clientSeed, nonce*20+int64(i*3+j), len(Symbols))
			reels[i][j] = Symbols[sIdx]
		}
	}
	return reels
}

// PlaySlotsProvablyFair executes a deterministic slot spin
func PlaySlotsProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64) (*SpinResult, error) {
	if bet <= 0 {
		return nil, fmt.Errorf("stawka musi być większa od 0")
	}

	reels := GenerateReelsProvablyFair(serverSeed, clientSeed, nonce)
	return EvaluateReels(reels, bet), nil
}

