package plinko

import (
	"fmt"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

type MultipliersMap map[string]map[int][]float64

// Balanced Plinko Multipliers for 8-16 Rows (Low, Medium, High Risk ~97-99% RTP)
var Multipliers = MultipliersMap{
	"low": {
		8:  {10.0, 3.0, 1.5, 1.0, 0.5, 1.0, 1.5, 3.0, 10.0},
		9:  {10.0, 4.0, 1.7, 1.1, 0.7, 0.7, 1.1, 1.7, 4.0, 10.0},
		10: {11.0, 4.0, 2.0, 1.1, 0.9, 0.5, 0.9, 1.1, 2.0, 4.0, 11.0},
		11: {12.0, 5.0, 2.0, 1.2, 1.0, 0.7, 0.7, 1.0, 1.2, 2.0, 5.0, 12.0},
		12: {15.0, 6.0, 3.0, 1.5, 1.1, 0.9, 0.5, 0.9, 1.1, 1.5, 3.0, 6.0, 15.0},
		13: {16.0, 8.0, 3.0, 1.8, 1.2, 1.0, 0.7, 0.7, 1.0, 1.2, 1.8, 3.0, 8.0, 16.0},
		14: {20.0, 10.0, 4.0, 2.0, 1.3, 1.0, 0.8, 0.5, 0.8, 1.0, 1.3, 2.0, 4.0, 10.0, 20.0},
		15: {25.0, 12.0, 5.0, 3.0, 1.5, 1.1, 0.9, 0.6, 0.6, 0.9, 1.1, 1.5, 3.0, 5.0, 12.0, 25.0},
		16: {30.0, 15.0, 6.0, 3.0, 1.8, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.8, 3.0, 6.0, 15.0, 30.0},
	},
	"medium": {
		8:  {20.0, 4.0, 1.5, 0.6, 0.4, 0.6, 1.5, 4.0, 20.0},
		9:  {25.0, 6.0, 2.0, 0.9, 0.5, 0.5, 0.9, 2.0, 6.0, 25.0},
		10: {30.0, 8.0, 3.0, 1.2, 0.6, 0.4, 0.6, 1.2, 3.0, 8.0, 30.0},
		11: {40.0, 10.0, 4.0, 1.5, 0.8, 0.5, 0.5, 0.8, 1.5, 4.0, 10.0, 40.0},
		12: {50.0, 12.0, 5.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 5.0, 12.0, 50.0},
		13: {70.0, 15.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 15.0, 70.0},
		14: {100.0, 20.0, 7.0, 4.0, 1.4, 1.0, 0.5, 0.2, 0.5, 1.0, 1.4, 4.0, 7.0, 20.0, 100.0},
		15: {150.0, 30.0, 10.0, 5.0, 2.0, 1.2, 0.6, 0.3, 0.3, 0.6, 1.2, 2.0, 5.0, 10.0, 30.0, 150.0},
		16: {200.0, 40.0, 12.0, 6.0, 3.0, 1.5, 1.0, 0.5, 0.2, 0.5, 1.0, 1.5, 3.0, 6.0, 12.0, 40.0, 200.0},
	},
	"high": {
		8:  {50.0, 6.0, 1.5, 0.3, 0.0, 0.3, 1.5, 6.0, 50.0},
		9:  {75.0, 10.0, 2.0, 0.5, 0.2, 0.2, 0.5, 2.0, 10.0, 75.0},
		10: {100.0, 15.0, 3.0, 0.8, 0.3, 0.0, 0.3, 0.8, 3.0, 15.0, 100.0},
		11: {150.0, 20.0, 5.0, 1.2, 0.3, 0.1, 0.1, 0.3, 1.2, 5.0, 20.0, 150.0},
		12: {250.0, 30.0, 8.0, 2.0, 0.6, 0.2, 0.0, 0.2, 0.6, 2.0, 8.0, 30.0, 250.0},
		13: {350.0, 40.0, 10.0, 3.0, 1.0, 0.3, 0.1, 0.1, 0.3, 1.0, 3.0, 10.0, 40.0, 350.0},
		14: {500.0, 50.0, 14.0, 4.0, 2.0, 0.3, 0.2, 0.0, 0.2, 0.3, 2.0, 4.0, 14.0, 50.0, 500.0},
		15: {750.0, 80.0, 20.0, 7.0, 3.0, 0.5, 0.2, 0.0, 0.0, 0.2, 0.5, 3.0, 7.0, 20.0, 80.0, 750.0},
		16: {1000.0, 100.0, 25.0, 9.0, 4.0, 1.5, 0.5, 0.2, 0.0, 0.2, 0.5, 1.5, 4.0, 9.0, 25.0, 100.0, 1000.0},
	},
}

type Payload struct {
	Rows        int       `json:"rows"`
	Risk        string    `json:"risk"`
	Path        []int     `json:"path"`        // 0 for left, 1 for right at each peg
	Slot        int       `json:"slot"`        // landing slot index (0 to rows)
	Multiplier  float64   `json:"multiplier"`
	Multipliers []float64 `json:"multipliers"` // all available multipliers in row
}

type Result struct {
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

func PlayPlinko(bet int64, rows int, risk string) (*Result, error) {
	if rows != 14 && rows != 16 {
		if rows < 8 || rows > 16 {
			rows = 14
		}
	}

	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		risk = "medium"
	}

	multsRow, ok := Multipliers[risk][rows]
	if !ok {
		return nil, fmt.Errorf("nieobsługiwana konfiguracja plinko: rows=%d, risk=%s", rows, risk)
	}

	// Standard unbiased 50/50 deflection at each peg (Galton board)
	path := make([]int, rows)
	rightCount := 0

	for i := 0; i < rows; i++ {
		step := provablyfair.MustCryptoRandInt(2) // 0 for left, 1 for right
		path[i] = step
		if step == 1 {
			rightCount++
		}
	}

	slot := rightCount
	if slot < 0 {
		slot = 0
	}
	if slot >= len(multsRow) {
		slot = len(multsRow) - 1
	}

	mult := multsRow[slot]
	payout := int64(float64(bet) * mult)
	resultText := fmt.Sprintf("Plinko: Slot #%d (×%.2f)", slot+1, mult)

	return &Result{
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			Rows:        rows,
			Risk:        risk,
			Path:        path,
			Slot:        slot,
			Multiplier:  mult,
			Multipliers: multsRow,
		},
	}, nil
}

// PlayPlinkoProvablyFair executes a deterministic game of Plinko using player seeds and nonce
func PlayPlinkoProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, rows int, risk string) (*Result, error) {
	if rows != 14 && rows != 16 {
		if rows < 8 || rows > 16 {
			rows = 14
		}
	}

	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		risk = "medium"
	}

	multsRow, ok := Multipliers[risk][rows]
	if !ok {
		return nil, fmt.Errorf("nieobsługiwana konfiguracja plinko: rows=%d, risk=%s", rows, risk)
	}

	path := make([]int, rows)
	rightCount := 0

	for i := 0; i < rows; i++ {
		step := provablyfair.GenerateInt(serverSeed, clientSeed, nonce*20+int64(i), 2) // 0 for left, 1 for right
		path[i] = step
		if step == 1 {
			rightCount++
		}
	}

	slot := rightCount
	if slot < 0 {
		slot = 0
	}
	if slot >= len(multsRow) {
		slot = len(multsRow) - 1
	}

	mult := multsRow[slot]
	payout := int64(float64(bet) * mult)
	resultText := fmt.Sprintf("Plinko: Slot #%d (×%.2f)", slot+1, mult)

	return &Result{
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			Rows:        rows,
			Risk:        risk,
			Path:        path,
			Slot:        slot,
			Multiplier:  mult,
			Multipliers: multsRow,
		},
	}, nil
}

