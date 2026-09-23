package anticheat

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrChallengeMissing           = errors.New("CHALLENGE_MISSING: Wymagana weryfikacja przeglądarki (brak nagłówka X-Browser-Proof)")
	ErrChallengeMalformed         = errors.New("CHALLENGE_MALFORMED: Nieprawidłowy format nagłówka weryfikacji")
	ErrChallengeExpired           = errors.New("CHALLENGE_EXPIRED: Sesja weryfikacji wygasła. Pobierz nowe wyzwanie.")
	ErrChallengeInvalidSignature = errors.New("CHALLENGE_FORGED: Nieprawidłowy podpis kryptograficzny wyzwania")
	ErrChallengeInvalidDifficulty= errors.New("CHALLENGE_INVALID_DIFF: Zbyt niski poziom trudności")
	ErrChallengeInvalidProof     = errors.New("CHALLENGE_FAILED: Błędne rozwiązanie Proof-of-Work")
	ErrChallengeReused           = errors.New("CHALLENGE_REUSED: To wyzwanie zostało już zużyte. Powtórzenie żądania (replay attack) zostało zablokowane.")
)

const (
	// Default PoW difficulty: 3 leading hex zeros (~4,096 iterations, ~1-3ms in browser JS)
	DefaultChallengeDifficulty = 3
	// Max age of a challenge proof: 5 minutes (300 seconds)
	ChallengeMaxAgeSeconds = 300
)

type BrowserChallenge struct {
	ID         string `json:"id"`
	Salt       string `json:"salt"`
	IssuedAt   int64  `json:"issued_at"`
	Difficulty int    `json:"difficulty"`
	Signature  string `json:"signature"`
}

var (
	challengeTelemetryMu sync.RWMutex
	challengeTelemetryCb func(event string)
)

// SetChallengeTelemetryCallback registers a callback to record PoW challenge telemetry.
func SetChallengeTelemetryCallback(cb func(event string)) {
	challengeTelemetryMu.Lock()
	defer challengeTelemetryMu.Unlock()
	challengeTelemetryCb = cb
}

func recordChallengeTelemetry(event string) {
	challengeTelemetryMu.RLock()
	cb := challengeTelemetryCb
	challengeTelemetryMu.RUnlock()
	if cb != nil {
		cb(event)
	}
}

// Replay attack prevention: in-memory store tracking consumed single-use challenge IDs
type challengeStore struct {
	mu       sync.Mutex
	consumed map[string]int64 // id -> expiresAt unix timestamp
}

var consumedChallenges = &challengeStore{
	consumed: make(map[string]int64),
}

func (s *challengeStore) MarkConsumed(id string, expiresAt int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.consumed[id]; exists {
		return false // Already used! Replay attack detected.
	}
	s.consumed[id] = expiresAt
	return true
}

func init() {
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			now := time.Now().Unix()
			consumedChallenges.mu.Lock()
			for id, exp := range consumedChallenges.consumed {
				if exp <= now {
					delete(consumedChallenges.consumed, id)
				}
			}
			consumedChallenges.mu.Unlock()
		}
	}()
}

// GenerateBrowserChallenge creates a cryptographically signed, single-use Proof-of-Work challenge for a user
func GenerateBrowserChallenge(userID, secret string) *BrowserChallenge {
	idBytes := make([]byte, 16)
	_, _ = rand.Read(idBytes)
	id := hex.EncodeToString(idBytes)

	saltBytes := make([]byte, 16)
	_, _ = rand.Read(saltBytes)
	salt := hex.EncodeToString(saltBytes)

	issuedAt := time.Now().Unix()
	difficulty := DefaultChallengeDifficulty

	sig := SignChallenge(id, salt, issuedAt, difficulty, userID, secret)

	recordChallengeTelemetry("generated")

	return &BrowserChallenge{
		ID:         id,
		Salt:       salt,
		IssuedAt:   issuedAt,
		Difficulty: difficulty,
		Signature:  sig,
	}
}

// SignChallenge creates an HMAC-SHA256 signature binding the challenge ID and parameters to the specific user
func SignChallenge(id, salt string, issuedAt int64, difficulty int, userID, secret string) string {
	msg := fmt.Sprintf("%s:%s:%d:%d:%s", id, salt, issuedAt, difficulty, userID)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyBrowserProof verifies the client-provided X-Browser-Proof header.
// Format: <id>:<salt>:<issuedAt>:<difficulty>:<signature>:<nonce>
func VerifyBrowserProof(userID, secret, proofHeader string) error {
	proofHeader = strings.TrimSpace(proofHeader)
	if proofHeader == "" {
		recordChallengeTelemetry("failed")
		return ErrChallengeMissing
	}

	parts := strings.Split(proofHeader, ":")
	if len(parts) != 6 {
		recordChallengeTelemetry("failed")
		return ErrChallengeMalformed
	}

	id := parts[0]
	salt := parts[1]
	issuedAtStr := parts[2]
	diffStr := parts[3]
	signature := parts[4]
	nonce := parts[5]

	if id == "" || salt == "" {
		recordChallengeTelemetry("failed")
		return ErrChallengeMalformed
	}

	issuedAt, err := strconv.ParseInt(issuedAtStr, 10, 64)
	if err != nil {
		recordChallengeTelemetry("failed")
		return ErrChallengeMalformed
	}

	difficulty, err := strconv.Atoi(diffStr)
	if err != nil {
		recordChallengeTelemetry("failed")
		return ErrChallengeMalformed
	}

	if difficulty < DefaultChallengeDifficulty {
		recordChallengeTelemetry("failed")
		return ErrChallengeInvalidDifficulty
	}

	// Timestamp validation (allow max 60s future clock drift, max 5min age)
	now := time.Now().Unix()
	if issuedAt > now+60 || (now-issuedAt) > ChallengeMaxAgeSeconds {
		recordChallengeTelemetry("expired")
		return ErrChallengeExpired
	}

	// HMAC Signature validation (constant-time comparison)
	expectedSig := SignChallenge(id, salt, issuedAt, difficulty, userID, secret)
	if !hmac.Equal([]byte(signature), []byte(expectedSig)) {
		recordChallengeTelemetry("failed")
		return ErrChallengeInvalidSignature
	}

	// Proof-of-Work check: SHA256(id + ":" + salt + ":" + nonce) must have <difficulty> leading zeros
	powInput := fmt.Sprintf("%s:%s:%s", id, salt, nonce)
	h := sha256.Sum256([]byte(powInput))
	hexHash := hex.EncodeToString(h[:])

	prefix := strings.Repeat("0", difficulty)
	if !strings.HasPrefix(hexHash, prefix) {
		recordChallengeTelemetry("failed")
		return ErrChallengeInvalidProof
	}

	// Single-Use / Anti-Replay Check: mark challenge ID as consumed
	if !consumedChallenges.MarkConsumed(id, issuedAt+ChallengeMaxAgeSeconds) {
		recordChallengeTelemetry("reused")
		return ErrChallengeReused
	}

	recordChallengeTelemetry("solved")
	return nil
}
