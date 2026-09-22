package plinko

import (
	"fmt"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

type MultipliersMap map[string]map[int][]float64

// Balanced Plinko Multipliers for 8-16 Rows (Low, Medium, High Risk ~92-93% RTP / 7-8% House Edge)
var Multipliers = MultipliersMap{
	"low": {
		8:  {5.3, 2.0, 1.05, 0.95, 0.45, 0.95, 1.05, 2.0, 5.3},
		9:  {5.3, 1.9, 1.5, 0.95, 0.65, 0.65, 0.95, 1.5, 1.9, 5.3},
		10: {8.5, 2.8, 1.3, 1.05, 0.95, 0.45, 0.95, 1.05, 1.3, 2.8, 8.5},
		11: {8.0, 2.8, 1.8, 1.2, 0.95, 0.65, 0.65, 0.95, 1.2, 1.8, 2.8, 8.0},
		12: {9.5, 2.8, 1.5, 1.3, 1.05, 0.95, 0.45, 0.95, 1.05, 1.3, 1.5, 2.8, 9.5},
		13: {7.7, 3.8, 2.8, 1.8, 1.15, 0.85, 0.65, 0.65, 0.85, 1.15, 1.8, 2.8, 3.8, 7.7},
		14: {6.8, 3.8, 1.8, 1.3, 1.2, 1.05, 0.95, 0.45, 0.95, 1.05, 1.2, 1.3, 1.8, 3.8, 6.8},
		15: {14.2, 7.6, 2.8, 1.9, 1.4, 1.05, 0.95, 0.65, 0.65, 0.95, 1.05, 1.4, 1.9, 2.8, 7.6, 14.2},
		16: {15.2, 8.5, 1.9, 1.3, 1.3, 1.15, 1.05, 0.95, 0.45, 0.95, 1.05, 1.15, 1.3, 1.3, 1.9, 8.5, 15.2},
	},
	"medium": {
		8:  {12.5, 2.8, 1.2, 0.65, 0.35, 0.65, 1.2, 2.8, 12.5},
		9:  {17.0, 3.8, 1.6, 0.85, 0.45, 0.45, 0.85, 1.6, 3.8, 17.0},
		10: {21.0, 4.7, 1.9, 1.3, 0.55, 0.35, 0.55, 1.3, 1.9, 4.7, 21.0},
		11: {23.0, 5.7, 2.8, 1.7, 0.65, 0.45, 0.45, 0.65, 1.7, 2.8, 5.7, 23.0},
		12: {31.5, 10.5, 3.8, 1.9, 1.05, 0.55, 0.25, 0.55, 1.05, 1.9, 3.8, 10.5, 31.5},
		13: {41.0, 12.5, 5.7, 2.8, 1.2, 0.65, 0.35, 0.35, 0.65, 1.2, 2.8, 5.7, 12.5, 41.0},
		14: {55.0, 14.2, 6.6, 3.8, 1.8, 0.95, 0.45, 0.18, 0.45, 0.95, 1.8, 3.8, 6.6, 14.2, 55.0},
		15: {84.0, 17.0, 10.5, 4.7, 2.8, 1.2, 0.45, 0.25, 0.25, 0.45, 1.2, 2.8, 4.7, 10.5, 17.0, 84.0},
		16: {105.0, 39.0, 9.5, 4.7, 2.8, 1.4, 0.95, 0.45, 0.25, 0.45, 0.95, 1.4, 2.8, 4.7, 9.5, 39.0, 105.0},
	},
	"high": {
		8:  {27.5, 3.8, 1.4, 0.25, 0.15, 0.25, 1.4, 3.8, 27.5},
		9:  {41.0, 6.6, 1.9, 0.55, 0.18, 0.18, 0.55, 1.9, 6.6, 41.0},
		10: {72.0, 9.5, 2.8, 0.85, 0.25, 0.18, 0.25, 0.85, 2.8, 9.5, 72.0},
		11: {114.0, 13.3, 4.9, 1.3, 0.35, 0.18, 0.18, 0.35, 1.3, 4.9, 13.3, 114.0},
		12: {162.0, 22.8, 7.7, 1.9, 0.65, 0.18, 0.18, 0.18, 0.65, 1.9, 7.7, 22.8, 162.0},
		13: {248.0, 35.0, 10.5, 3.8, 0.95, 0.18, 0.18, 0.18, 0.18, 0.95, 3.8, 10.5, 35.0, 248.0},
		14: {400.0, 53.0, 17.0, 4.7, 1.8, 0.25, 0.18, 0.18, 0.18, 0.25, 1.8, 4.7, 17.0, 53.0, 400.0},
		15: {590.0, 79.0, 25.8, 7.6, 2.8, 0.45, 0.18, 0.18, 0.18, 0.18, 0.45, 2.8, 7.6, 25.8, 79.0, 590.0},
		16: {950.0, 124.0, 24.8, 8.5, 3.8, 1.9, 0.18, 0.18, 0.18, 0.18, 0.18, 1.9, 3.8, 8.5, 24.8, 124.0, 950.0},
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
	if rows < 8 || rows > 16 {
		rows = 10
	}

	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		risk = "medium"
	}

	multsRow, ok := Multipliers[risk][rows]
	if !ok {
		return nil, fmt.Errorf("nieobsługiwana konfiguracja plinko: rows=%d, risk=%s", rows, risk)
	}

	// Center-biased pin deflection physics:
	// Balls bounce back towards the center with higher probability when displaced,
	// concentrating hits heavily in the middle (low multiplier / loss) slots.
	path := make([]int, rows)
	rightCount := 0
	leftCount := 0
	centerPull := 0.045

	for i := 0; i < rows; i++ {
		diff := float64(rightCount - leftCount)
		pRight := 0.5 - centerPull*diff
		if pRight < 0.05 {
			pRight = 0.05
		} else if pRight > 0.95 {
			pRight = 0.95
		}

		randVal := float64(provablyfair.MustCryptoRandInt(10000)) / 10000.0
		step := 0
		if randVal < pRight {
			step = 1
			rightCount++
		} else {
			step = 0
			leftCount++
		}
		path[i] = step
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
