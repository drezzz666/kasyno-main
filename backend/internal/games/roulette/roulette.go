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

type BetItem struct {
	Spot       string `json:"spot"`
	Amount     int64  `json:"amount"`
	Win        bool   `json:"win"`
	Multiplier int    `json:"multiplier"`
	Payout     int64  `json:"payout"`
}

type Payload struct {
	Number      int       `json:"number"`
	Color       string    `json:"color"`
	Choice      string    `json:"choice,omitempty"`
	Multiplier  float64   `json:"multiplier"`
	TotalBet    int64     `json:"total_bet"`
	TotalPayout int64     `json:"total_payout"`
	Bets        []BetItem `json:"bets,omitempty"`
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

// NormalizeSpot normalizes spot names for comparison
func NormalizeSpot(spot string) string {
	s := strings.ToLower(strings.TrimSpace(spot))
	switch s {
	case "1st12", "1st 12", "1-12":
		return "dozen1"
	case "2nd12", "2nd 12", "13-24":
		return "dozen2"
	case "3rd12", "3rd 12", "25-36":
		return "dozen3"
	case "1-18", "manque":
		return "low"
	case "19-36", "passe":
		return "high"
	case "pair", "even":
		return "even"
	case "impair", "odd":
		return "odd"
	case "rouge", "red":
		return "red"
	case "noir", "black":
		return "black"
	case "column1", "col1", "2to1_1", "col_1":
		return "col1"
	case "column2", "col2", "2to1_2", "col_2":
		return "col2"
	case "column3", "col3", "2to1_3", "col_3":
		return "col3"
	default:
		return s
	}
}

// ValidateChoice validates whether a choice string is acceptable and returns multiplier
func ValidateChoice(choice string) (bool, int) {
	c := NormalizeSpot(choice)
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
	case "col1", "col2", "col3":
		return true, 3
	default:
		return false, 0
	}
}

// EvaluateSpin checks if a bet won and computes payout
func EvaluateSpin(number int, choice string, bet int64) (bool, int64, int) {
	c := NormalizeSpot(choice)
	valid, multiplier := ValidateChoice(c)
	if !valid || bet <= 0 {
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
		case "col1":
			win = (number > 0 && (number-1)%3 == 0) // 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
		case "col2":
			win = (number > 0 && (number-2)%3 == 0) // 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
		case "col3":
			win = (number > 0 && number%3 == 0)     // 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
		}
	}

	if win {
		return true, bet * int64(multiplier), multiplier
	}
	return false, 0, multiplier
}

// EvaluateMultiBets evaluates a set of placed bets against a winning number
func EvaluateMultiBets(number int, bets map[string]int64) ([]BetItem, int64, int64) {
	var betItems []BetItem
	var totalBet int64
	var totalPayout int64

	for spot, amount := range bets {
		if amount <= 0 {
			continue
		}
		totalBet += amount
		won, payout, mult := EvaluateSpin(number, spot, amount)
		if won {
			totalPayout += payout
		}
		betItems = append(betItems, BetItem{
			Spot:       NormalizeSpot(spot),
			Amount:     amount,
			Win:        won,
			Multiplier: mult,
			Payout:     payout,
		})
	}

	return betItems, totalBet, totalPayout
}

// PlayRoulette spins the wheel and evaluates the outcome (single bet)
func PlayRoulette(bet int64, choice string) (*SpinResult, error) {
	return PlayRouletteMulti(map[string]int64{choice: bet})
}

// PlayRouletteMulti spins the wheel and evaluates multiple bets on the table
func PlayRouletteMulti(bets map[string]int64) (*SpinResult, error) {
	if len(bets) == 0 {
		return nil, fmt.Errorf("brak postawionych zakładów na stole ruletki")
	}

	for spot, amount := range bets {
		if amount <= 0 {
			return nil, fmt.Errorf("kwota zakładu na pole '%s' musi być większa od zera", spot)
		}
		valid, _ := ValidateChoice(spot)
		if !valid {
			return nil, fmt.Errorf("nieprawidłowy wybór zakładu w ruletce: %s", spot)
		}
	}

	n := provablyfair.MustCryptoRandInt(37)
	color := GetColor(n)

	items, totalBet, totalPayout := EvaluateMultiBets(n, bets)

	mult := 0.0
	if totalBet > 0 {
		mult = float64(totalPayout) / float64(totalBet)
	}

	primaryChoice := ""
	if len(bets) == 1 {
		for s := range bets {
			primaryChoice = NormalizeSpot(s)
		}
	} else {
		primaryChoice = fmt.Sprintf("Wielo-zakład (%d pól)", len(bets))
	}

	res := &SpinResult{
		Number:     n,
		Color:      color,
		Win:        totalPayout > 0,
		Payout:     totalPayout,
		ResultText: fmt.Sprintf("%d · %s", n, color),
		Payload: Payload{
			Number:      n,
			Color:       color,
			Choice:      primaryChoice,
			Multiplier:  mult,
			TotalBet:    totalBet,
			TotalPayout: totalPayout,
			Bets:        items,
		},
	}
	return res, nil
}

// PlayRouletteProvablyFair spins the wheel using deterministic seeds (single or multi)
func PlayRouletteProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, choice string) (*SpinResult, error) {
	return PlayRouletteMultiProvablyFair(serverSeed, clientSeed, nonce, map[string]int64{choice: bet})
}

// PlayRouletteMultiProvablyFair spins the wheel deterministically for multiple table bets
func PlayRouletteMultiProvablyFair(serverSeed, clientSeed string, nonce int64, bets map[string]int64) (*SpinResult, error) {
	if len(bets) == 0 {
		return nil, fmt.Errorf("brak postawionych zakładów na stole ruletki")
	}

	for spot, amount := range bets {
		if amount <= 0 {
			return nil, fmt.Errorf("kwota zakładu na pole '%s' musi być większa od zera", spot)
		}
		valid, _ := ValidateChoice(spot)
		if !valid {
			return nil, fmt.Errorf("nieprawidłowy wybór zakładu w ruletce: %s", spot)
		}
	}

	n := provablyfair.GenerateInt(serverSeed, clientSeed, nonce, 37)
	color := GetColor(n)

	items, totalBet, totalPayout := EvaluateMultiBets(n, bets)

	mult := 0.0
	if totalBet > 0 {
		mult = float64(totalPayout) / float64(totalBet)
	}

	primaryChoice := ""
	if len(bets) == 1 {
		for s := range bets {
			primaryChoice = NormalizeSpot(s)
		}
	} else {
		primaryChoice = fmt.Sprintf("Wielo-zakład (%d pól)", len(bets))
	}

	res := &SpinResult{
		Number:     n,
		Color:      color,
		Win:        totalPayout > 0,
		Payout:     totalPayout,
		ResultText: fmt.Sprintf("%d · %s", n, color),
		Payload: Payload{
			Number:      n,
			Color:       color,
			Choice:      primaryChoice,
			Multiplier:  mult,
			TotalBet:    totalBet,
			TotalPayout: totalPayout,
			Bets:        items,
		},
	}
	return res, nil
}
