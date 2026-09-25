package slots

import (
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

var Symbols = []string{"7", "💎", "⭐", "🔔", "🍒", "🍋"}

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

// GenerateReels generates a 3x3 grid of symbols
func GenerateReels() [][]string {
	reels := make([][]string, 3)
	for i := 0; i < 3; i++ {
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
	if len(reels) != 3 {
		return &SpinResult{Payout: 0, ResultText: "Błąd bębnów"}
	}

	counts := make(map[string]int)
	for i := 0; i < 3; i++ {
		if len(reels[i]) > 1 {
			symbol := reels[i][1]
			counts[symbol]++
		}
	}

	var triples []string
	var pairs []string

	for symbol, count := range counts {
		if count == 3 {
			triples = append(triples, symbol)
		} else if count == 2 {
			pairs = append(pairs, symbol)
		}
	}

	var multiplier float64
	var comboName string

	if len(triples) > 0 {
		sym := triples[0]
		switch sym {
		case "7":
			multiplier = 50.0 // Jackpot
			comboName = "3x Szczęśliwa 7 7️⃣ (JACKPOT)"
		case "💎":
			multiplier = 25.0
			comboName = "3x Diament 💎"
		case "⭐":
			multiplier = 15.0
			comboName = "3x Gwiazda ⭐"
		case "🔔":
			multiplier = 10.0
			comboName = "3x Dzwonek 🔔"
		case "🍒":
			multiplier = 7.0
			comboName = "3x Wiśnie 🍒"
		case "🍋":
			multiplier = 5.0
			comboName = "3x Cytryna 🍋"
		default:
			multiplier = 5.0
			comboName = fmt.Sprintf("3x Symbol %s", sym)
		}
	} else if len(pairs) > 0 {
		sym := pairs[0]
		switch sym {
		case "7":
			multiplier = 2.0
			comboName = "Para 77 (2x 7)"
		case "💎":
			multiplier = 1.8
			comboName = "Para Diamentów (2x 💎)"
		case "⭐":
			multiplier = 1.5
			comboName = "Para Gwiazd (2x ⭐)"
		case "🔔":
			multiplier = 1.2
			comboName = "Para Dzwonków (2x 🔔)"
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

// GenerateReelsProvablyFair generates a 3x3 grid deterministically using provably fair seeds
func GenerateReelsProvablyFair(serverSeed, clientSeed string, nonce int64) [][]string {
	reels := make([][]string, 3)
	for i := 0; i < 3; i++ {
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

