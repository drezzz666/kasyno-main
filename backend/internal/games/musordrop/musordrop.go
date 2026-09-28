package musordrop

import (
	"crypto/rand"
	"errors"
	"math/big"
)

type BoxType string

const (
	BoxPlebs        BoxType = "plebs"
	BoxArystokracja BoxType = "arystokracja"
	BoxLepsza       BoxType = "lepsza"
)

type PrizeTier struct {
	Amount    int64
	WeightBps int // in Basis Points (1/100th of 1%, total sum = 10000)
	Name      string
	IsJackpot bool
}

type DropResult struct {
	BoxType   BoxType `json:"boxType"`
	Prize     int64   `json:"prize"`
	PrizeName string  `json:"prizeName"`
	IsJackpot bool    `json:"isJackpot"`
	RollBps   int     `json:"rollBps"`
}

var PlebsPrizes = []PrizeTier{
	{Amount: 0, WeightBps: 5500, Name: "Nic", IsJackpot: false},
	{Amount: 100, WeightBps: 2500, Name: "100 ₽", IsJackpot: false},
	{Amount: 500, WeightBps: 1200, Name: "500 ₽", IsJackpot: false},
	{Amount: 1500, WeightBps: 600, Name: "1 500 ₽", IsJackpot: false},
	{Amount: 5000, WeightBps: 200, Name: "5 000 ₽ (Jackpot)", IsJackpot: true},
}

var ArystokracjaPrizes = []PrizeTier{
	{Amount: 0, WeightBps: 4300, Name: "Nic", IsJackpot: false},
	{Amount: 250, WeightBps: 4400, Name: "250 ₽", IsJackpot: false},
	{Amount: 1000, WeightBps: 800, Name: "1 000 ₽", IsJackpot: false},
	{Amount: 3000, WeightBps: 400, Name: "3 000 ₽", IsJackpot: false},
	{Amount: 10000, WeightBps: 80, Name: "10 000 ₽", IsJackpot: false},
	{Amount: 50000, WeightBps: 20, Name: "50 000 ₽ (Główny Jackpot)", IsJackpot: true},
}

var LepszaPrizes = []PrizeTier{
	{Amount: 0, WeightBps: 5450, Name: "Nic", IsJackpot: false},
	{Amount: 1000, WeightBps: 2500, Name: "1 000 ₽", IsJackpot: false},
	{Amount: 5000, WeightBps: 1000, Name: "5 000 ₽", IsJackpot: false},
	{Amount: 10000, WeightBps: 500, Name: "10 000 ₽", IsJackpot: false},
	{Amount: 25000, WeightBps: 300, Name: "25 000 ₽", IsJackpot: false},
	{Amount: 50000, WeightBps: 200, Name: "50 000 ₽", IsJackpot: true},
	{Amount: 100000, WeightBps: 50, Name: "100 000 ₽ (Jackpot)", IsJackpot: true},
}

func RollBox(bType BoxType) (*DropResult, error) {
	var tiers []PrizeTier
	switch bType {
	case BoxPlebs:
		tiers = PlebsPrizes
	case BoxArystokracja:
		tiers = ArystokracjaPrizes
	case BoxLepsza:
		tiers = LepszaPrizes
	default:
		return nil, errors.New("nieprawidłowy typ skrzynki")
	}

	nBig, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		return nil, err
	}
	roll := int(nBig.Int64())

	cumulative := 0
	for _, tier := range tiers {
		cumulative += tier.WeightBps
		if roll < cumulative {
			return &DropResult{
				BoxType:   bType,
				Prize:     tier.Amount,
				PrizeName: tier.Name,
				IsJackpot: tier.IsJackpot || tier.Amount >= 10000,
				RollBps:   roll,
			}, nil
		}
	}

	// Fallback to last tier
	last := tiers[len(tiers)-1]
	return &DropResult{
		BoxType:   bType,
		Prize:     last.Amount,
		PrizeName: last.Name,
		IsJackpot: last.IsJackpot || last.Amount >= 10000,
		RollBps:   roll,
	}, nil
}
