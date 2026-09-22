package slots

import (
	"fmt"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

var Symbols = []string{"2", "F", "G", "T", "◆", "♛"}

type Payload struct {
	Reels   [][]string `json:"reels"`
	Winning bool       `json:"winning"`
}

type SpinResult struct {
	Win        bool    `json:"win"`
	Payout     int64   `json:"payout"`
	Multiplier int     `json:"multiplier"`
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

	maxCount := 0
	for _, count := range counts {
		if count > maxCount {
			maxCount = count
		}
	}

	multiplier := 0
	if maxCount == 5 {
		multiplier = 12
	} else if maxCount == 4 {
		multiplier = 6
	} else if maxCount >= 3 {
		multiplier = 2
	}

	win := multiplier > 0
	payout := bet * int64(multiplier)

	resultText := "Brak wygranej"
	if win {
		resultText = fmt.Sprintf("Wygrana ×%d", multiplier)
	}

	return &SpinResult{
		Win:        win,
		Payout:     payout,
		Multiplier: multiplier,
		ResultText: resultText,
		Payload: Payload{
			Reels:   reels,
			Winning: win,
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
