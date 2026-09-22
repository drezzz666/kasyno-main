package coinflip

import (
	"fmt"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

type Payload struct {
	Choice     string `json:"choice"`
	Outcome    string `json:"outcome"`
	Won        bool   `json:"won"`
	Multiplier float64 `json:"multiplier"`
}

type Result struct {
	Won        bool    `json:"won"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

func PlayCoinflip(bet int64, choice string) (*Result, error) {
	c := strings.ToLower(strings.TrimSpace(choice))
	if c != "heads" && c != "tails" && c != "orzel" && c != "reszka" {
		return nil, fmt.Errorf("nieprawidłowy wybór: %s (wybierz 'heads' lub 'tails')", choice)
	}

	// Normalize to "heads" or "tails"
	if c == "orzel" {
		c = "heads"
	} else if c == "reszka" {
		c = "tails"
	}

	// 0 = heads, 1 = tails
	flip := provablyfair.MustCryptoRandInt(2)
	outcome := "heads"
	if flip == 1 {
		outcome = "tails"
	}

	won := (c == outcome)
	var payout int64
	var resultText string
	mult := 1.98 // 99% RTP coin flip

	if won {
		payout = int64(float64(bet) * mult)
		if outcome == "heads" {
			resultText = fmt.Sprintf("Wypadł Orzeł (Heads) - Wygrana ×%.2f!", mult)
		} else {
			resultText = fmt.Sprintf("Wypadła Reszka (Tails) - Wygrana ×%.2f!", mult)
		}
	} else {
		payout = 0
		if outcome == "heads" {
			resultText = "Wypadł Orzeł (Heads) - Przegrana"
		} else {
			resultText = "Wypadła Reszka (Tails) - Przegrana"
		}
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			Choice:     c,
			Outcome:    outcome,
			Won:        won,
			Multiplier: mult,
		},
	}, nil
}

// PlayCoinflipProvablyFair executes a round of Coinflip using Provably Fair seeds
func PlayCoinflipProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, choice string) (*Result, error) {
	c := strings.ToLower(strings.TrimSpace(choice))
	if c != "heads" && c != "tails" && c != "orzel" && c != "reszka" {
		return nil, fmt.Errorf("nieprawidłowy wybór: %s (wybierz 'heads' lub 'tails')", choice)
	}

	if c == "orzel" {
		c = "heads"
	} else if c == "reszka" {
		c = "tails"
	}

	flip := provablyfair.GenerateInt(serverSeed, clientSeed, nonce, 2)
	outcome := "heads"
	if flip == 1 {
		outcome = "tails"
	}

	won := (c == outcome)
	var payout int64
	var resultText string
	mult := 1.98

	if won {
		payout = int64(float64(bet) * mult)
		if outcome == "heads" {
			resultText = fmt.Sprintf("Wypadł Orzeł (Heads) - Wygrana ×%.2f!", mult)
		} else {
			resultText = fmt.Sprintf("Wypadła Reszka (Tails) - Wygrana ×%.2f!", mult)
		}
	} else {
		payout = 0
		if outcome == "heads" {
			resultText = "Wypadł Orzeł (Heads) - Przegrana"
		} else {
			resultText = "Wypadła Reszka (Tails) - Przegrana"
		}
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			Choice:     c,
			Outcome:    outcome,
			Won:        won,
			Multiplier: mult,
		},
	}, nil
}
