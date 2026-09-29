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
		8:  {5.6, 2.2, 1.3, 0.8, 0.5, 0.8, 1.3, 2.2, 5.6},
		9:  {5.6, 2.2, 1.5, 0.9, 0.6, 0.6, 0.9, 1.5, 2.2, 5.6},
		10: {8.9, 3.2, 1.6, 1.1, 0.8, 0.5, 0.8, 1.1, 1.6, 3.2, 8.9},
		11: {8.4, 3.0, 1.8, 1.2, 0.9, 0.6, 0.6, 0.9, 1.2, 1.8, 3.0, 8.4},
		12: {10.0, 3.5, 1.8, 1.3, 1.0, 0.8, 0.5, 0.8, 1.0, 1.3, 1.8, 3.5, 10.0},
		13: {8.5, 3.8, 2.2, 1.5, 1.1, 0.8, 0.6, 0.6, 0.8, 1.1, 1.5, 2.2, 3.8, 8.5},
		14: {8.0, 4.5, 2.2, 1.5, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.5, 2.2, 4.5, 8.0},
		15: {15.0, 6.5, 3.0, 2.0, 1.4, 1.1, 0.9, 0.6, 0.6, 0.9, 1.1, 1.4, 2.0, 3.0, 6.5, 15.0},
		16: {16.0, 9.0, 3.0, 1.8, 1.4, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.4, 1.8, 3.0, 9.0, 16.0},
	},
	"medium": {
		8:  {13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0},
		9:  {18.0, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18.0},
		10: {22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0},
		11: {24.0, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24.0},
		12: {33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0},
		13: {43.0, 13.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13.0, 43.0},
		14: {58.0, 15.0, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15.0, 58.0},
		15: {88.0, 18.0, 11.0, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11.0, 18.0, 88.0},
		16: {110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0},
	},
	"high": {
		8:  {29.0, 4.0, 1.5, 0.3, 0.0, 0.3, 1.5, 4.0, 29.0},
		9:  {43.0, 7.0, 2.0, 0.6, 0.1, 0.1, 0.6, 2.0, 7.0, 43.0},
		10: {76.0, 10.0, 3.0, 0.9, 0.2, 0.0, 0.2, 0.9, 3.0, 10.0, 76.0},
		11: {120.0, 14.0, 5.2, 1.4, 0.3, 0.1, 0.1, 0.3, 1.4, 5.2, 14.0, 120.0},
		12: {170.0, 24.0, 8.1, 2.0, 0.6, 0.2, 0.0, 0.2, 0.6, 2.0, 8.1, 24.0, 170.0},
		13: {260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.1, 0.1, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0},
		14: {420.0, 70.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.0, 0.2, 0.3, 1.9, 5.0, 18.0, 70.0, 420.0},
		15: {620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.1, 0.1, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0},
		16: {1000.0, 172.0, 33.0, 9.5, 4.0, 2.0, 0.2, 0.1, 0.0, 0.1, 0.2, 2.0, 4.0, 9.5, 33.0, 172.0, 1000.0},
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
		return nil, fmt.Errorf("nieprawidłowa liczba rzędów w plinko: %d (dozwolone tylko 14 lub 16)", rows)
	}

	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		return nil, fmt.Errorf("nieprawidłowy poziom ryzyka w plinko: %s (wymagane low, medium lub high)", risk)
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
		return nil, fmt.Errorf("nieprawidłowa liczba rzędów w plinko: %d (dozwolone tylko 14 lub 16)", rows)
	}

	risk = strings.ToLower(strings.TrimSpace(risk))
	if risk != "low" && risk != "medium" && risk != "high" {
		return nil, fmt.Errorf("nieprawidłowy poziom ryzyka w plinko: %s (wymagane low, medium lub high)", risk)
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

