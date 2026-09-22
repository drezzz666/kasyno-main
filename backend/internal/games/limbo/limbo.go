package limbo

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)


type Payload struct {
	ResultMultiplier float64 `json:"result_multiplier"`
	TargetMultiplier float64 `json:"target_multiplier"`
	Won              bool    `json:"won"`
	Multiplier       float64 `json:"multiplier"`
}

type Result struct {
	Won        bool    `json:"won"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

// GenerateLimboMultiplier computes a cryptographically secure random multiplier with 99% RTP.
// Standard crypto casino formula: M = floor((0.99 / (1 - U)) * 100) / 100
func GenerateLimboMultiplier() float64 {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 1.00
	}
	// 52-bit uniform fraction
	val := binary.BigEndian.Uint64(buf[:]) >> 12
	u := float64(val) / float64(uint64(1)<<52)

	// Avoid division by zero
	if u >= 0.9999999999 {
		u = 0.9999999999
	}

	raw := 0.99 / (1.0 - u)
	mult := math.Floor(raw*100.0) / 100.0
	if mult < 1.00 {
		mult = 1.00
	}
	if mult > 1000000.00 {
		mult = 1000000.00
	}
	return mult
}

// PlayLimbo executes a round of Limbo with the given bet and target multiplier.
func PlayLimbo(bet int64, targetMultiplier float64) (*Result, error) {
	if targetMultiplier < 1.01 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik musi mieścić się w przedziale 1.01x - 10000x")
	}

	resultMult := GenerateLimboMultiplier()
	won := resultMult >= targetMultiplier

	var payout int64
	var resultText string

	if won {
		payout = int64(math.Floor(float64(bet) * targetMultiplier))
		resultText = fmt.Sprintf("Wylosowano %.2fx (Cel: %.2fx) - Wygrana ×%.2f!", resultMult, targetMultiplier, targetMultiplier)
	} else {
		payout = 0
		resultText = fmt.Sprintf("Wylosowano %.2fx (Cel: %.2fx) - Przegrana", resultMult, targetMultiplier)
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			ResultMultiplier: resultMult,
			TargetMultiplier: targetMultiplier,
			Won:              won,
			Multiplier:       targetMultiplier,
		},
	}, nil
}

// GenerateLimboMultiplierProvablyFair computes the multiplier deterministically using provably fair seeds
func GenerateLimboMultiplierProvablyFair(serverSeed, clientSeed string, nonce int64) float64 {
	u := provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)
	if u >= 0.9999999999 {
		u = 0.9999999999
	}
	raw := 0.99 / (1.0 - u)
	mult := math.Floor(raw*100.0) / 100.0
	if mult < 1.00 {
		mult = 1.00
	}
	if mult > 1000000.00 {
		mult = 1000000.00
	}
	return mult
}

// PlayLimboProvablyFair executes a deterministic round of Limbo
func PlayLimboProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, targetMultiplier float64) (*Result, error) {
	if targetMultiplier < 1.01 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik musi mieścić się w przedziale 1.01x - 10000x")
	}

	resultMult := GenerateLimboMultiplierProvablyFair(serverSeed, clientSeed, nonce)
	won := resultMult >= targetMultiplier

	var payout int64
	var resultText string

	if won {
		payout = int64(math.Floor(float64(bet) * targetMultiplier))
		resultText = fmt.Sprintf("Wylosowano %.2fx (Cel: %.2fx) - Wygrana ×%.2f!", resultMult, targetMultiplier, targetMultiplier)
	} else {
		payout = 0
		resultText = fmt.Sprintf("Wylosowano %.2fx (Cel: %.2fx) - Przegrana", resultMult, targetMultiplier)
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			ResultMultiplier: resultMult,
			TargetMultiplier: targetMultiplier,
			Won:              won,
			Multiplier:       targetMultiplier,
		},
	}, nil
}

