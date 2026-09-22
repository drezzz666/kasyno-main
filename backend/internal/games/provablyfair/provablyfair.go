package provablyfair

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math/big"
)

type SeedPair struct {
	ServerSeed string `json:"server_seed"`
	ServerHash string `json:"server_hash"`
	ClientSeed string `json:"client_seed"`
	Nonce      int64  `json:"nonce"`
}

// GenerateServerSeed generates a random 32-byte hex string
func GenerateServerSeed() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// GenerateClientSeed generates a random 16-byte hex string
func GenerateClientSeed() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// HashServerSeed computes SHA-256 hash of the server seed
func HashServerSeed(serverSeed string) string {
	hash := sha256.Sum256([]byte(serverSeed))
	return hex.EncodeToString(hash[:])
}

// GenerateFloat returns a deterministic float64 in [0, 1) using HMAC-SHA256
func GenerateFloat(serverSeed, clientSeed string, nonce int64) float64 {
	message := fmt.Sprintf("%s:%d", clientSeed, nonce)
	mac := hmac.New(sha256.New, []byte(serverSeed))
	mac.Write([]byte(message))
	hash := mac.Sum(nil)

	// Take first 8 bytes for 64-bit unsigned integer
	val := binary.BigEndian.Uint64(hash[:8])
	// Divide by 2^64 to get uniform float in [0, 1)
	return float64(val) / (1 << 64)
}

// GenerateInt returns a deterministic int in [0, max)
func GenerateInt(serverSeed, clientSeed string, nonce int64, max int) int {
	if max <= 0 {
		return 0
	}
	f := GenerateFloat(serverSeed, clientSeed, nonce)
	return int(f * float64(max))
}

// CryptoRandInt returns a cryptographically secure random int in [0, max)
func CryptoRandInt(max int) (int, error) {
	if max <= 0 {
		return 0, nil
	}
	nBig, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(nBig.Int64()), nil
}

// MustCryptoRandInt returns a crypto-random int, panicking only on OS RNG catastrophic failure
func MustCryptoRandInt(max int) int {
	val, err := CryptoRandInt(max)
	if err != nil {
		panic(fmt.Sprintf("crypto/rand failure: %v", err))
	}
	return val
}
