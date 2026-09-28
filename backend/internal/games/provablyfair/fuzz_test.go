package provablyfair

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"testing"
)

// TestProvablyFair_Determinism verifies that identical seeds and nonces always produce identical results.
func TestProvablyFair_Determinism(t *testing.T) {
	serverSeed := "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
	clientSeed := "custom-client-seed-123"

	for nonce := int64(0); nonce < 100; nonce++ {
		f1 := GenerateFloat(serverSeed, clientSeed, nonce)
		f2 := GenerateFloat(serverSeed, clientSeed, nonce)
		if f1 != f2 {
			t.Fatalf("Non-deterministic float at nonce %d: %v != %v", nonce, f1, f2)
		}

		i1 := GenerateInt(serverSeed, clientSeed, nonce, 37)
		i2 := GenerateInt(serverSeed, clientSeed, nonce, 37)
		if i1 != i2 {
			t.Fatalf("Non-deterministic int at nonce %d: %d != %d", nonce, i1, i2)
		}
	}
}

// TestProvablyFair_FloatRangeAndDistribution verifies that GenerateFloat strictly falls in [0, 1)
// and has proper uniformity across 10,000 iterations.
func TestProvablyFair_FloatRangeAndDistribution(t *testing.T) {
	serverSeed, err := GenerateServerSeed()
	if err != nil {
		t.Fatalf("Failed to generate server seed: %v", err)
	}
	clientSeed, err := GenerateClientSeed()
	if err != nil {
		t.Fatalf("Failed to generate client seed: %v", err)
	}

	total := 10000
	sum := 0.0
	minVal := 1.0
	maxVal := 0.0

	for nonce := int64(0); nonce < int64(total); nonce++ {
		f := GenerateFloat(serverSeed, clientSeed, nonce)
		if f < 0.0 || f >= 1.0 || math.IsNaN(f) || math.IsInf(f, 0) {
			t.Fatalf("GenerateFloat produced invalid value: %v (must be in [0.0, 1.0))", f)
		}
		if f < minVal {
			minVal = f
		}
		if f > maxVal {
			maxVal = f
		}
		sum += f
	}

	mean := sum / float64(total)
	// For uniform distribution in [0, 1), expected mean is 0.5. With 10,000 samples, mean should be between 0.48 and 0.52
	if mean < 0.48 || mean > 0.52 {
		t.Errorf("GenerateFloat mean %f deviates significantly from expected 0.5", mean)
	}
}

// TestProvablyFair_IntRange verifies that GenerateInt returns values strictly within [0, max).
func TestProvablyFair_IntRange(t *testing.T) {
	serverSeed := "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
	clientSeed := "my-seed"

	ranges := []int{2, 3, 6, 12, 25, 37, 100, 1000}
	for _, max := range ranges {
		t.Run(fmt.Sprintf("Range_%d", max), func(t *testing.T) {
			for nonce := int64(0); nonce < 1000; nonce++ {
				val := GenerateInt(serverSeed, clientSeed, nonce, max)
				if val < 0 || val >= max {
					t.Fatalf("GenerateInt(max=%d) produced %d (out of range [0, %d))", max, val, max)
				}
			}
		})
	}
}

// TestProvablyFair_EdgeCases tests extreme seed string values, empty strings, and special characters.
func TestProvablyFair_EdgeCases(t *testing.T) {
	serverSeed := "server-seed-test"
	specialSeeds := []string{
		"",
		" ",
		"🔥🎲🎰🚀💎",
		"<script>alert(1)</script>",
		"null",
		"undefined",
		"0x0000000000000000",
		"a-very-long-client-seed-that-has-hundreds-of-characters-and-symbols-!@#$%^&*()_+{}[]:;<>?,./~`",
	}

	for _, cs := range specialSeeds {
		t.Run("Seed_"+cs, func(t *testing.T) {
			f := GenerateFloat(serverSeed, cs, 0)
			if f < 0.0 || f >= 1.0 {
				t.Fatalf("GenerateFloat failed for seed %q, got %f", cs, f)
			}
			val := GenerateInt(serverSeed, cs, 0, 100)
			if val < 0 || val >= 100 {
				t.Fatalf("GenerateInt failed for seed %q, got %d", cs, val)
			}
		})
	}

	// Test max <= 0
	if val := GenerateInt(serverSeed, "test", 0, 0); val != 0 {
		t.Errorf("GenerateInt with max=0 should return 0, got %d", val)
	}
	if val := GenerateInt(serverSeed, "test", 0, -5); val != 0 {
		t.Errorf("GenerateInt with negative max should return 0, got %d", val)
	}
}

// TestProvablyFair_ServerSeedHashIntegrity verifies SHA-256 hash match.
func TestProvablyFair_ServerSeedHashIntegrity(t *testing.T) {
	serverSeed, err := GenerateServerSeed()
	if err != nil {
		t.Fatalf("GenerateServerSeed error: %v", err)
	}

	hashHex := HashServerSeed(serverSeed)
	expectedHash := sha256.Sum256([]byte(serverSeed))
	if hashHex != hex.EncodeToString(expectedHash[:]) {
		t.Fatalf("HashServerSeed mismatch: %s != %s", hashHex, hex.EncodeToString(expectedHash[:]))
	}
}
