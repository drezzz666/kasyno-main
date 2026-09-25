package upgrader

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

type Payload struct {
	RolledNumber     float64 `json:"rolled_number"`
	WinChance        float64 `json:"win_chance"`
	TargetMultiplier float64 `json:"target_multiplier"`
	RollType         string  `json:"roll_type"` // "under" or "over"
	Won              bool    `json:"won"`
	Multiplier       float64 `json:"multiplier"`
}

type Result struct {
	Won        bool    `json:"won"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result_text"`
	Payload    Payload `json:"payload"`
}

// CalculateWinChance returns win percentage (0.01% - 95.00%) for target multiplier with 96% RTP.
func CalculateWinChance(targetMultiplier float64) float64 {
	if targetMultiplier <= 1.01 {
		return 95.00
	}
	chance := 96.00 / targetMultiplier
	chance = math.Floor(chance*100) / 100
	if chance < 0.01 {
		chance = 0.01
	}
	if chance > 95.00 {
		chance = 95.00
	}
	return chance
}

// GenerateRollFloat computes a CSPRNG uniform float in [0.00, 100.00) with 2 decimals.
func GenerateRollFloat() float64 {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 50.00
	}
	val := binary.BigEndian.Uint64(buf[:]) >> 12
	u := float64(val) / float64(uint64(1)<<52)
	roll := math.Floor(u*10000.0) / 100.0
	if roll >= 100.00 {
		roll = 99.99
	}
	return roll
}

// GenerateRollProvablyFair computes the roll deterministically from provably fair seeds.
func GenerateRollProvablyFair(serverSeed, clientSeed string, nonce int64) float64 {
	u := provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)
	roll := math.Floor(u*10000.0) / 100.0
	if roll >= 100.00 {
		roll = 99.99
	}
	return roll
}

// PlayUpgrader executes a round of Upgrader game.
func PlayUpgrader(bet int64, targetMultiplier float64, rollType string) (*Result, error) {
	if targetMultiplier < 1.50 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik musi mieścić się w przedziale 1.50x - 10000x")
	}

	if rollType != "over" {
		rollType = "under"
	}

	winChance := CalculateWinChance(targetMultiplier)
	rolled := GenerateRollFloat()

	won := false
	if rollType == "under" {
		won = rolled < winChance
	} else {
		won = rolled >= (100.00 - winChance)
	}

	var payout int64
	var resultText string
	if won {
		payout = int64(math.Floor(float64(bet) * targetMultiplier))
		resultText = fmt.Sprintf("Upgrade udany! Wylosowano %.2f%% (Szansa: %.2f%%) - Wygrana ×%.2f!", rolled, winChance, targetMultiplier)
	} else {
		payout = 0
		resultText = fmt.Sprintf("Upgrade nieudany. Wylosowano %.2f%% (Szansa: %.2f%%)", rolled, winChance)
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			RolledNumber:     rolled,
			WinChance:        winChance,
			TargetMultiplier: targetMultiplier,
			RollType:         rollType,
			Won:              won,
			Multiplier:       targetMultiplier,
		},
	}, nil
}

// PlayUpgraderProvablyFair executes a deterministic provably fair round.
func PlayUpgraderProvablyFair(bet int64, targetMultiplier float64, rollType string, serverSeed, clientSeed string, nonce int64) (*Result, error) {
	if targetMultiplier < 1.50 || targetMultiplier > 10000.00 {
		return nil, fmt.Errorf("docelowy mnożnik musi mieścić się w przedziale 1.50x - 10000x")
	}

	if rollType != "over" {
		rollType = "under"
	}

	winChance := CalculateWinChance(targetMultiplier)
	rolled := GenerateRollProvablyFair(serverSeed, clientSeed, nonce)

	won := false
	if rollType == "under" {
		won = rolled < winChance
	} else {
		won = rolled >= (100.00 - winChance)
	}

	var payout int64
	var resultText string
	if won {
		payout = int64(math.Floor(float64(bet) * targetMultiplier))
		resultText = fmt.Sprintf("Upgrade udany! Wylosowano %.2f%% (Szansa: %.2f%%) - Wygrana ×%.2f!", rolled, winChance, targetMultiplier)
	} else {
		payout = 0
		resultText = fmt.Sprintf("Upgrade nieudany. Wylosowano %.2f%% (Szansa: %.2f%%)", rolled, winChance)
	}

	return &Result{
		Won:        won,
		Payout:     payout,
		ResultText: resultText,
		Payload: Payload{
			RolledNumber:     rolled,
			WinChance:        winChance,
			TargetMultiplier: targetMultiplier,
			RollType:         rollType,
			Won:              won,
			Multiplier:       targetMultiplier,
		},
	}, nil
}
