package chicken

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

const TotalLanes = 10

type DifficultyConfig struct {
	Multipliers   []float64 `json:"multipliers"`
	SurvivalProbs []float64 `json:"survivalProbs"`
}

// Multiplier tables matching exact Stake Chicken game progression with 98% RTP
var DifficultyConfigs = map[string]DifficultyConfig{
	"easy": {
		Multipliers: []float64{1.03, 1.12, 1.25, 1.45, 1.75, 2.15, 2.70, 3.50, 4.60, 6.20},
		SurvivalProbs: []float64{
			0.951456, 0.919643, 0.896000, 0.862069, 0.828571,
			0.813953, 0.796296, 0.771429, 0.760870, 0.741935,
		},
	},
	"medium": {
		Multipliers: []float64{1.15, 1.37, 1.65, 2.00, 2.46, 3.05, 3.82, 4.85, 6.25, 8.15},
		SurvivalProbs: []float64{
			0.852174, 0.839416, 0.830303, 0.825000, 0.813008,
			0.806557, 0.798429, 0.787629, 0.776000, 0.766871,
		},
	},
	"hard": {
		Multipliers: []float64{1.31, 1.75, 2.40, 3.35, 4.80, 7.00, 10.50, 16.20, 26.00, 43.50},
		SurvivalProbs: []float64{
			0.748092, 0.748571, 0.729167, 0.716418, 0.697917,
			0.685714, 0.666667, 0.648148, 0.623077, 0.597701,
		},
	},
	"expert": {
		Multipliers: []float64{1.96, 3.90, 8.00, 16.50, 35.00, 75.00, 165.00, 380.00, 900.00, 2200.00},
		SurvivalProbs: []float64{
			0.500000, 0.502564, 0.487500, 0.484848, 0.471429,
			0.466667, 0.454545, 0.434211, 0.422222, 0.409091,
		},
	},
}

var Hazards = []string{"police_car", "car", "truck", "fire"}

type Payload struct {
	Difficulty  string    `json:"difficulty"`
	CurrentLane int       `json:"currentLane"` // 0 before first step, 1..10 after steps
	Multiplier  float64   `json:"multiplier"`  // current multiplier (1.00 at start)
	Multipliers []float64 `json:"multipliers"` // 10 multiplier values
	TotalLanes  int       `json:"totalLanes"`  // 10
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
	diff = strings.ToLower(strings.TrimSpace(diff))
	if _, ok := DifficultyConfigs[diff]; ok {
		return diff
	}
	return "medium"
}

// GetMultipliers returns the multiplier list for a given difficulty
func GetMultipliers(diff string) []float64 {
	diff = NormalizeDifficulty(diff)
	cfg := DifficultyConfigs[diff]
	res := make([]float64, len(cfg.Multipliers))
	copy(res, cfg.Multipliers)
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
