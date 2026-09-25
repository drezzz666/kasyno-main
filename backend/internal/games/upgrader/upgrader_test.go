package upgrader

import (
	"testing"
)

func TestPlayUpgrader(t *testing.T) {
	res, err := PlayUpgrader(100, 2.0, "under")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Payload.WinChance != 48.00 {
		t.Errorf("expected 48.00 win chance for 2.0x, got %f", res.Payload.WinChance)
	}

	resPF, err := PlayUpgraderProvablyFair(100, 5.0, "over", "test_server_seed", "test_client_seed", 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resPF.Payload.TargetMultiplier != 5.0 {
		t.Errorf("expected target 5.0, got %f", resPF.Payload.TargetMultiplier)
	}
}
