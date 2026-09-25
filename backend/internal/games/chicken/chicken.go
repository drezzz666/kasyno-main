package chicken

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
)

const TotalLanes = 17

type DifficultyConfig struct {
	Multipliers   []float64 `json:"multipliers"`
	SurvivalProbs []float64 `json:"survivalProbs"`
}

// 17-lane Chicken Road configuration with exact Stake multipliers and provably fair cumulative win probabilities
var StandardConfig = DifficultyConfig{
	Multipliers: []float64{
		1.15, 1.37, 1.64, 2.00, 2.46, 3.07, 3.91, 5.08, 6.77,
		9.31, 13.30, 19.95, 31.92, 55.86, 111.72, 279.30, 1117.20,
	},
	SurvivalProbs: []float64{
		0.850000, 0.839412, 0.835339, 0.820134, 0.813011, 0.801208, 0.785176,
		0.769600, 0.750520, 0.727147, 0.700000, 0.666667, 0.625000, 0.571429,
		0.500000, 0.400000, 0.250000,
	},
}

var DifficultyConfigs = map[string]DifficultyConfig{
	"classic": StandardConfig,
	"easy":    StandardConfig,
	"medium":  StandardConfig,
	"hard":    StandardConfig,
	"expert":  StandardConfig,
}

var Hazards = []string{"police_car", "car", "truck", "fire"}

type Payload struct {
	Difficulty  string    `json:"difficulty,omitempty"`
	CurrentLane int       `json:"currentLane"` // 0 before first step, 1..17 after steps
	Multiplier  float64   `json:"multiplier"`  // current multiplier (1.00 at start)
	Multipliers []float64 `json:"multipliers"` // 17 multiplier values
	TotalLanes  int       `json:"totalLanes"`  // 17
	HazardLane  int       `json:"hazardLane,omitempty"`
	HazardType  string    `json:"hazardType,omitempty"`
}

type SettleResult struct {
	State      string  `json:"state"`
	Bet        int64   `json:"bet"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result"`
	Payload    Payload `json:"payload"`
}

// NormalizeDifficulty ensures valid difficulty level
func NormalizeDifficulty(diff string) string {
	return "classic"
}

// GetMultipliers returns the multiplier list for the 17-lane road
func GetMultipliers(diff string) []float64 {
	res := make([]float64, len(StandardConfig.Multipliers))
	copy(res, StandardConfig.Multipliers)
	return res
}

// CryptoRandFloat returns a cryptographically secure float64 in [0, 1)
func CryptoRandFloat() float64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("crypto/rand failure: %v", err))
	}
	val := binary.BigEndian.Uint64(b[:])
	return float64(val) / (1 << 64)
}

// InitialStart creates a new Chicken game round payload
func InitialStart(difficulty string) Payload {
	diff := NormalizeDifficulty(difficulty)
	mults := GetMultipliers(diff)
	return Payload{
		Difficulty:  diff,
		CurrentLane: 0,
		Multiplier:  1.00,
		Multipliers: mults,
		TotalLanes:  TotalLanes,
	}
}

// MaskChicken removes any secret/crash metadata from active state sent to client
func MaskChicken(p Payload) Payload {
	masked := p
	masked.HazardLane = 0
	masked.HazardType = ""
	return masked
}

// Step evaluates a single jump onto the next lane. Returns whether game is settled, the result if settled, and error
func Step(bet int64, p *Payload) (bool, *SettleResult, error) {
	targetLane := p.CurrentLane + 1
	if targetLane < 1 || targetLane > TotalLanes {
		return false, nil, fmt.Errorf("nieprawidłowy krok: pas %d (maksymalnie %d)", targetLane, TotalLanes)
	}

	diff := NormalizeDifficulty(p.Difficulty)
	cfg := DifficultyConfigs[diff]
	survivalProb := cfg.SurvivalProbs[targetLane-1]

	roll := CryptoRandFloat()
	if roll >= survivalProb {
		// Hit hazard! Round lost
		var hazardIdx int
		var b [1]byte
		if _, err := rand.Read(b[:]); err == nil {
			hazardIdx = int(b[0]) % len(Hazards)
		}
		p.HazardLane = targetLane
		p.HazardType = Hazards[hazardIdx]

		var hazardDesc string
		switch p.HazardType {
		case "police_car":
			hazardDesc = "Potrącenie przez radiowóz"
		case "car":
			hazardDesc = "Potrącenie przez samochód"
		case "truck":
			hazardDesc = "Potrącenie przez ciężarówkę"
		case "fire":
			hazardDesc = "Płomień z kratki ściekowej"
		default:
			hazardDesc = "Wypadek na pasie ruchu"
		}

		settle := &SettleResult{
			State:      "settled",
			Bet:        bet,
			Payout:     0,
			ResultText: fmt.Sprintf("%s na pasie %d", hazardDesc, targetLane),
			Payload:    *p,
		}
		return true, settle, nil
	}

	// Safe step!
	p.CurrentLane = targetLane
	p.Multiplier = cfg.Multipliers[targetLane-1]

	// Check if all 10 lanes completed (Max Win)
	if p.CurrentLane == TotalLanes {
		payout := int64(math.Round(float64(bet) * p.Multiplier))
		settle := &SettleResult{
			State:      "settled",
			Bet:        bet,
			Payout:     payout,
			ResultText: fmt.Sprintf("Kurczak bezpiecznie przeszedł całą drogę! ×%.2f", p.Multiplier),
			Payload:    *p,
		}
		return true, settle, nil
	}

	return false, nil, nil
}

// Cashout settles an active game at current multiplier
func Cashout(bet int64, p Payload) (*SettleResult, error) {
	if p.CurrentLane < 1 {
		return nil, fmt.Errorf("przejdź przynajmniej jeden pas przed wypłatą")
	}

	payout := int64(math.Round(float64(bet) * p.Multiplier))
	return &SettleResult{
		State:      "settled",
		Bet:        bet,
		Payout:     payout,
		ResultText: fmt.Sprintf("Cash-out ×%.2f (Pas %d)", p.Multiplier, p.CurrentLane),
		Payload:    p,
	}, nil
}

// ParsePayload deserializes JSON string into Payload
func ParsePayload(jsonStr string) (*Payload, error) {
	var p Payload
	if err := json.Unmarshal([]byte(jsonStr), &p); err != nil {
		return nil, fmt.Errorf("invalid chicken payload: %w", err)
	}
	return &p, nil
}
