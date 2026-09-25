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
