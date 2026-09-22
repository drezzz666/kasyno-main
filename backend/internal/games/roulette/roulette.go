package roulette

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

var redNumbers = map[int]bool{
	1: true, 3: true, 5: true, 7: true, 9: true, 12: true,
	14: true, 16: true, 18: true, 19: true, 21: true, 23: true,
	25: true, 27: true, 30: true, 32: true, 34: true, 36: true,
}

// WheelOrder is the physical order of numbers on a European roulette wheel
var WheelOrder = []int{
	0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
	16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
}

type Payload struct {
	Number     int    `json:"number"`
	Color      string `json:"color"`
	Choice     string `json:"choice"`
	Multiplier int    `json:"multiplier"`
}

type SpinResult struct {
	Number     int     `json:"number"`
	Color      string  `json:"color"`
	Win        bool    `json:"win"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

func GetColor(n int) string {
	if n == 0 {
		return "green"
	}
	if redNumbers[n] {
		return "red"
	}
	return "black"
}

// ValidateChoice validates whether a choice string is acceptable
func ValidateChoice(choice string) (bool, int) {
	c := strings.ToLower(strings.TrimSpace(choice))
	if n, err := strconv.Atoi(c); err == nil {
		if n >= 0 && n <= 36 {
			return true, 36
		}
		return false, 0
	}

	switch c {
	case "red", "black", "even", "odd", "low", "high":
		return true, 2
	case "dozen1", "dozen2", "dozen3":
		return true, 3
	default:
		return false, 0
	}
}

// EvaluateSpin checks if a bet won and computes payout
func EvaluateSpin(number int, choice string, bet int64) (bool, int64, int) {
	c := strings.ToLower(strings.TrimSpace(choice))
	valid, multiplier := ValidateChoice(c)
	if !valid {
		return false, 0, 0
	}

	color := GetColor(number)
	win := false

	if targetNum, err := strconv.Atoi(c); err == nil {
		win = (number == targetNum)
	} else {
		switch c {
		case "red", "black":
			win = (color == c)
		case "even":
			win = (number > 0 && number%2 == 0)
		case "odd":
			win = (number > 0 && number%2 == 1)
		case "low":
			win = (number >= 1 && number <= 18)
		case "high":
			win = (number >= 19 && number <= 36)
		case "dozen1":
			win = (number >= 1 && number <= 12)
		case "dozen2":
			win = (number >= 13 && number <= 24)
		case "dozen3":
			win = (number >= 25 && number <= 36)
		}
	}

	if win {
		return true, bet * int64(multiplier), multiplier
	}
	return false, 0, multiplier
}

// PlayRoulette spins the wheel and evaluates the outcome
func PlayRoulette(bet int64, choice string) (*SpinResult, error) {
	c := strings.ToLower(strings.TrimSpace(choice))
	valid, _ := ValidateChoice(c)
	if !valid {
		return nil, fmt.Errorf("nieprawidłowy wybór zakładu w ruletce: %s", choice)
	}

	n := provablyfair.MustCryptoRandInt(37)
	color := GetColor(n)
	win, payout, multiplier := EvaluateSpin(n, c, bet)

	res := &SpinResult{
		Number:     n,
		Color:      color,
		Win:        win,
		Payout:     payout,
		ResultText: fmt.Sprintf("%d · %s", n, color),
		Payload: Payload{
			Number:     n,
			Color:      color,
			Choice:     c,
			Multiplier: multiplier,
		},
	}
	return res, nil
}

// PlayRouletteProvablyFair spins the wheel using deterministic seeds
func PlayRouletteProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, choice string) (*SpinResult, error) {
	c := strings.ToLower(strings.TrimSpace(choice))
	valid, _ := ValidateChoice(c)
	if !valid {
		return nil, fmt.Errorf("nieprawidłowy wybór zakładu w ruletce: %s", choice)
	}

	n := provablyfair.GenerateInt(serverSeed, clientSeed, nonce, 37)
	color := GetColor(n)
	win, payout, multiplier := EvaluateSpin(n, c, bet)

	res := &SpinResult{
		Number:     n,
		Color:      color,
		Win:        win,
		Payout:     payout,
		ResultText: fmt.Sprintf("%d · %s", n, color),
		Payload: Payload{
			Number:     n,
			Color:      color,
			Choice:     c,
			Multiplier: multiplier,
		},
	}
	return res, nil
}
