package crash

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"
)

type Payload struct {
	CrashPoint float64 `json:"crash_point"`
	CashedAt   float64 `json:"cashed_at"`
	Won        bool    `json:"won"`
	Multiplier float64 `json:"multiplier"`
}

type Result struct {
	Won        bool    `json:"won"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

// GenerateCrashPoint generates a cryptographically secure crash multiplier with 99% RTP (1% instant 1.00x house edge).
func GenerateCrashPoint() float64 {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 1.00
	}
	val := binary.BigEndian.Uint64(buf[:]) >> 12
	u := float64(val) / float64(uint64(1)<<52)

	// 1 in 100 rounds instant crash at 1.00x
	if u < 0.01 {
		return 1.00
	}

	if u >= 0.9999999999 {
		u = 0.9999999999
	}

	raw := 0.99 / (1.0 - u)
	mult := math.Floor(raw*100.0) / 100.0
	if mult < 1.00 {
		mult = 1.00
	}
	if mult > 10000.00 {
		mult = 10000.00
	}
	return mult
}

// PlayCrash executes a single round of Crash.
// targetMultiplier is the player's cashout point (manual or auto-cashout).
func PlayCrash(bet int64, targetMultiplier float64) (*Result, error) {
	if targetMultiplier < 1.01 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik wypłaty musi mieścić się w przedziale 1.01x - 10000x")
	}

	crashPoint := GenerateCrashPoint()
	won := targetMultiplier <= crashPoint

	var payout int64
	var resultText string
	var actualMult float64

	if won {
		actualMult = targetMultiplier
		payout = int64(math.Floor(float64(bet) * actualMult))
		resultText = fmt.Sprintf("Wypłacono przy %.2fx (Rozbicie: %.2fx) - Wygrana ×%.2f!", actualMult, crashPoint, actualMult)
	} else {
		actualMult = 0
		payout = 0
		resultText = fmt.Sprintf("Rakieta rozbiła się przy %.2fx (Próba: %.2fx) - Przegrana", crashPoint, targetMultiplier)
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			CrashPoint: crashPoint,
			CashedAt:   targetMultiplier,
			Won:        won,
			Multiplier: actualMult,
		},
	}, nil
}
