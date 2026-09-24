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

// Multiplier tables with sub-1.0x warmup lanes (negative net gain on early cashout) and 95% overall RTP
var DifficultyConfigs = map[string]DifficultyConfig{
	"easy": {
		Multipliers: []float64{0.90, 1.10, 1.25, 1.45, 1.75, 2.15, 2.70, 3.50, 4.60, 6.20},
		SurvivalProbs: []float64{
			0.980000, 0.881267, 0.880000, 0.862069, 0.828571,
			0.813953, 0.796296, 0.771429, 0.760870, 0.741935,
		},
	},
	"medium": {
		Multipliers: []float64{0.75, 1.15, 1.50, 2.00, 2.65, 3.60, 5.00, 7.00, 10.00, 15.00},
		SurvivalProbs: []float64{
			0.980000, 0.842940, 0.766667, 0.750000, 0.754717,
			0.736111, 0.720000, 0.714286, 0.700000, 0.666667,
		},
	},
	"hard": {
		Multipliers: []float64{0.60, 1.10, 1.85, 3.10, 5.40, 9.80, 18.50, 36.00, 75.00, 160.00},
		SurvivalProbs: []float64{
			0.980000, 0.881267, 0.594595, 0.596774, 0.574074,
			0.551020, 0.529730, 0.513889, 0.480000, 0.468750,
		},
	},
	"expert": {
		Multipliers: []float64{0.50, 0.90, 1.80, 4.50, 12.00, 35.00, 110.00, 380.00, 1200.00, 4000.00},
		SurvivalProbs: []float64{
			0.980000, 0.999999, 0.538520, 0.400000, 0.375000,
			0.342857, 0.318182, 0.289474, 0.316667, 0.300000,
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
