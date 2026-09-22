package provablyfair

import (
	"testing"
)

func TestProvablyFairDeterminism(t *testing.T) {
	serverSeed := "a6c5b08492049d5c4be4ff2f9547169229b19dfb0c952b75f80753069c9bcf27"
	clientSeed := "8d4e9c1b3f2a1e0d"
	nonce := int64(1)

	f1 := GenerateFloat(serverSeed, clientSeed, nonce)
	f2 := GenerateFloat(serverSeed, clientSeed, nonce)

	if f1 != f2 {
		t.Errorf("expected deterministic float, got %f and %f", f1, f2)
	}

	if f1 < 0.0 || f1 >= 1.0 {
		t.Errorf("float out of bounds [0, 1): %f", f1)
	}

	n1 := GenerateInt(serverSeed, clientSeed, nonce, 37)
	n2 := GenerateInt(serverSeed, clientSeed, nonce, 37)

	if n1 != n2 {
		t.Errorf("expected deterministic int, got %d and %d", n1, n2)
	}

	if n1 < 0 || n1 >= 37 {
		t.Errorf("int out of bounds [0, 37): %d", n1)
	}
}

func TestServerSeedHashing(t *testing.T) {
	serverSeed, err := GenerateServerSeed()
	if err != nil {
		t.Fatalf("failed to generate server seed: %v", err)
	}
	hash := HashServerSeed(serverSeed)
	if len(hash) != 64 {
		t.Errorf("expected SHA-256 hex string of length 64, got %d", len(hash))
	}
}
