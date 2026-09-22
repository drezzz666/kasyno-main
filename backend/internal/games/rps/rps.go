package rps

import (
	"fmt"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

type Payload struct {
	PlayerChoice string  `json:"player_choice"`
	HouseChoice  string  `json:"house_choice"`
	Outcome      string  `json:"outcome"` // "win", "tie", "loss"
	Multiplier   float64 `json:"multiplier"`
}

type Result struct {
	Outcome    string  `json:"outcome"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

var choices = []string{"rock", "paper", "scissors"}

func PlayRPS(bet int64, playerChoice string) (*Result, error) {
	c := strings.ToLower(strings.TrimSpace(playerChoice))
	switch c {
	case "rock", "kamien", "kamień":
		c = "rock"
	case "paper", "papier":
		c = "paper"
	case "scissors", "nozyce", "nożyce":
		c = "scissors"
	default:
		return nil, fmt.Errorf("nieprawidłowy wybór: %s (wybierz 'rock', 'paper' lub 'scissors')", playerChoice)
	}

	houseIdx := provablyfair.MustCryptoRandInt(3)
	houseChoice := choices[houseIdx]

	var outcome string
	var payout int64
	var mult float64
	var resultText string

	choiceNamePl := map[string]string{
		"rock":     "Kamień",
		"paper":    "Papier",
		"scissors": "Nożyce",
	}

	if c == houseChoice {
		outcome = "tie"
		mult = 1.0
		payout = bet
		resultText = fmt.Sprintf("Remis! Krupier również wybrał %s. Zwrot stawki.", choiceNamePl[houseChoice])
	} else if (c == "rock" && houseChoice == "scissors") ||
		(c == "paper" && houseChoice == "rock") ||
		(c == "scissors" && houseChoice == "paper") {
		outcome = "win"
		mult = 1.98
		payout = int64(float64(bet) * mult)
		resultText = fmt.Sprintf("Wygrana! Twój %s pokonał %s krupiera (×%.2f)!", choiceNamePl[c], choiceNamePl[houseChoice], mult)
	} else {
		outcome = "loss"
		mult = 0.0
		payout = 0
		resultText = fmt.Sprintf("Przegrana! %s krupiera pokonał Twój %s.", choiceNamePl[houseChoice], choiceNamePl[c])
	}

	return &Result{
		Outcome:    outcome,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			PlayerChoice: c,
			HouseChoice:  houseChoice,
			Outcome:      outcome,
			Multiplier:   mult,
		},
	}, nil
}
