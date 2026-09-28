package musordrop

import (
	"testing"
)

func TestRollBoxValid(t *testing.T) {
	boxes := []BoxType{BoxPlebs, BoxArystokracja, BoxLepsza}
	for _, b := range boxes {
		for i := 0; i < 100; i++ {
			res, err := RollBox(b)
			if err != nil {
				t.Fatalf("unexpected error rolling box %s: %v", b, err)
			}
			if res.BoxType != b {
				t.Fatalf("expected box type %s, got %s", b, res.BoxType)
			}
			if res.RollBps < 0 || res.RollBps >= 10000 {
				t.Fatalf("invalid rollBps: %d", res.RollBps)
			}
		}
	}
}

func TestTierWeightsSum(t *testing.T) {
	checkSum := func(name string, tiers []PrizeTier) {
		sum := 0
		for _, tier := range tiers {
			sum += tier.WeightBps
		}
		if sum != 10000 {
			t.Fatalf("%s weight sum is %d, expected 10000", name, sum)
		}
	}
	checkSum("Plebs", PlebsPrizes)
	checkSum("Arystokracja", ArystokracjaPrizes)
	checkSum("Lepsza", LepszaPrizes)
}

func TestRollBoxInvalid(t *testing.T) {
	_, err := RollBox(BoxType("nieznana"))
	if err == nil {
		t.Fatal("expected error for invalid box type, got nil")
	}
}

func TestArystokracjaRTP(t *testing.T) {
	var totalEV float64
	for _, tier := range ArystokracjaPrizes {
		prob := float64(tier.WeightBps) / 10000.0
		totalEV += float64(tier.Amount) * prob
	}
	const cost = 500.0
	rtp := totalEV / cost
	if rtp != 0.98 {
		t.Fatalf("expected Arystokracja RTP 0.98 (98%%), got %.4f (EV = %.2f)", rtp, totalEV)
	}
}
