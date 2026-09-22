package anticheat

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestBrowserChallengeGenerationAndVerification(t *testing.T) {
	secret := "test-secret-key-12345"
	userID := "user_test_999"

	// 1. Generate challenge
	c := GenerateBrowserChallenge(userID, secret)
	if c.ID == "" || c.Salt == "" || c.Signature == "" || c.Difficulty != DefaultChallengeDifficulty {
		t.Fatalf("invalid generated challenge: %+v", c)
	}

	// 2. Solve challenge (PoW solver simulation: sha256(id + ":" + salt + ":" + nonce))
	var solvedNonce string
	prefix := strings.Repeat("0", c.Difficulty)
	for i := 0; ; i++ {
		nonceCandidate := strconv.Itoa(i)
		h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s", c.ID, c.Salt, nonceCandidate)))
		if strings.HasPrefix(hex.EncodeToString(h[:]), prefix) {
			solvedNonce = nonceCandidate
			break
		}
	}

	// 3. Build valid proof header: id:salt:issuedAt:difficulty:signature:nonce
	validProof := fmt.Sprintf("%s:%s:%d:%d:%s:%s", c.ID, c.Salt, c.IssuedAt, c.Difficulty, c.Signature, solvedNonce)

	// 4. Verify valid proof (first time -> SUCCESS)
	if err := VerifyBrowserProof(userID, secret, validProof); err != nil {
		t.Errorf("expected valid proof to pass first time, got err: %v", err)
	}

	// 5. Anti-Replay test: verify SAME proof second time -> must FAIL with ErrChallengeReused
	if err := VerifyBrowserProof(userID, secret, validProof); err != ErrChallengeReused {
		t.Errorf("expected ErrChallengeReused on replay attempt, got %v", err)
	}

	// 6. Test missing proof header
	if err := VerifyBrowserProof(userID, secret, ""); err != ErrChallengeMissing {
		t.Errorf("expected ErrChallengeMissing, got %v", err)
	}

	// 7. Fresh challenge for another user to test wrong user ID
	c2 := GenerateBrowserChallenge("other_user", secret)
	for i := 0; ; i++ {
		nonceCandidate := strconv.Itoa(i)
		h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s", c2.ID, c2.Salt, nonceCandidate)))
		if strings.HasPrefix(hex.EncodeToString(h[:]), prefix) {
			solvedNonce = nonceCandidate
			break
		}
	}
	validProofUser2 := fmt.Sprintf("%s:%s:%d:%d:%s:%s", c2.ID, c2.Salt, c2.IssuedAt, c2.Difficulty, c2.Signature, solvedNonce)
	if err := VerifyBrowserProof("attacker_user", secret, validProofUser2); err != ErrChallengeInvalidSignature {
		t.Errorf("expected ErrChallengeInvalidSignature for wrong user, got %v", err)
	}

	// 8. Test tampered signature
	c3 := GenerateBrowserChallenge(userID, secret)
	tamperedSigProof := fmt.Sprintf("%s:%s:%d:%d:%s:%s", c3.ID, c3.Salt, c3.IssuedAt, c3.Difficulty, "bad_signature_here", "0")
	if err := VerifyBrowserProof(userID, secret, tamperedSigProof); err != ErrChallengeInvalidSignature {
		t.Errorf("expected ErrChallengeInvalidSignature for tampered sig, got %v", err)
	}

	// 9. Test invalid PoW nonce
	c4 := GenerateBrowserChallenge(userID, secret)
	invalidNonceProof := fmt.Sprintf("%s:%s:%d:%d:%s:%s", c4.ID, c4.Salt, c4.IssuedAt, c4.Difficulty, c4.Signature, "wrong_nonce_999999")
	if err := VerifyBrowserProof(userID, secret, invalidNonceProof); err != ErrChallengeInvalidProof {
		t.Errorf("expected ErrChallengeInvalidProof for wrong nonce, got %v", err)
	}

	// 10. Test expired timestamp
	c5 := GenerateBrowserChallenge(userID, secret)
	oldTime := time.Now().Unix() - 1000
	oldSig := SignChallenge(c5.ID, c5.Salt, oldTime, c5.Difficulty, userID, secret)
	expiredProof := fmt.Sprintf("%s:%s:%d:%d:%s:%s", c5.ID, c5.Salt, oldTime, c5.Difficulty, oldSig, "0")
	if err := VerifyBrowserProof(userID, secret, expiredProof); err != ErrChallengeExpired {
		t.Errorf("expected ErrChallengeExpired, got %v", err)
	}
}
