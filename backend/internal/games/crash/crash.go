package crash

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)


const FlightSpeed = 0.09

type ActivePayload struct {
	CrashPoint  float64 `json:"crash_point"`
	AutoCashout float64 `json:"auto_cashout"`
	StartedAt   int64   `json:"started_at"`
	FlightSpeed float64 `json:"flight_speed"`
}

type MaskedPayload struct {
	AutoCashout float64 `json:"auto_cashout"`
	StartedAt   int64   `json:"started_at"`
	FlightSpeed float64 `json:"flight_speed"`
}

func MaskActive(p ActivePayload) MaskedPayload {
	return MaskedPayload{
		AutoCashout: p.AutoCashout,
		StartedAt:   p.StartedAt,
		FlightSpeed: p.FlightSpeed,
	}
}

func ParsePayload(data string) (*ActivePayload, error) {
	var p ActivePayload
	if err := json.Unmarshal([]byte(data), &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// MultiplierAtElapsed returns the flight multiplier at given elapsed seconds starting from 1.00x.
func MultiplierAtElapsed(elapsedSec float64, flightSpeed float64) float64 {
	if elapsedSec <= 0 {
		return 1.00
	}
	if flightSpeed <= 0 {
		flightSpeed = FlightSpeed
	}
	m := 1.00 * math.Exp(flightSpeed * elapsedSec)
	return math.Floor(m*100.0) / 100.0
}

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

// GenerateCrashPoint generates a cryptographically secure crash multiplier with 99% RTP starting from 1.00x.
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
	if targetMultiplier < 1.00 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik wypłaty musi mieścić się w przedziale 1.00x - 10000x")
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

// GenerateCrashPointProvablyFair generates a deterministic crash point using provably fair seeds
func GenerateCrashPointProvablyFair(serverSeed, clientSeed string, nonce int64) float64 {
	u := provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)

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

// PlayCrashProvablyFair executes a deterministic single round of Crash
func PlayCrashProvablyFair(serverSeed, clientSeed string, nonce int64, bet int64, targetMultiplier float64) (*Result, error) {
	if targetMultiplier < 1.00 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik wypłaty musi mieścić się w przedziale 1.00x - 10000x")
	}

	crashPoint := GenerateCrashPointProvablyFair(serverSeed, clientSeed, nonce)
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

