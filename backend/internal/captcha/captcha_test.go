package captcha

import (
	"bytes"
	"encoding/json"
	"image/png"
	"strings"
	"testing"
	"time"
)

func TestCaptchaServerSideOnlyAndSecurity(t *testing.T) {
	userID := "user_test_security_1"
	secret := "ultra_secure_session_secret_key_999"

	// 1. Generate captcha
	c := Generate(userID, secret)
	if c.ID == "" || c.Signature == "" || len(c.Image) == 0 {
		t.Fatalf("expected valid captcha challenge with binary PNG image, got: %+v", c)
	}

	// 2. SECURITY TEST: Verify JSON serialization does NOT expose plaintext answer, display, or binary image
	jsonBytes, err := json.Marshal(c)
	if err != nil {
		t.Fatalf("failed to marshal captcha: %v", err)
	}
	jsonStr := string(jsonBytes)

	if strings.Contains(jsonStr, `"Answer"`) || strings.Contains(jsonStr, `"answer"`) || strings.Contains(jsonStr, `"display"`) {
		t.Fatalf("SECURITY VIOLATION: captcha JSON exposes secret answer/display: %s", jsonStr)
	}
	if strings.Contains(jsonStr, c.Answer) {
		t.Fatalf("SECURITY VIOLATION: captcha plaintext answer '%s' found in JSON payload: %s", c.Answer, jsonStr)
	}

	// 3. Verify Pure Binary PNG format (PNG signature \x89PNG\r\n\x1a\n)
	if len(c.Image) < 8 || !bytes.HasPrefix(c.Image, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		t.Fatalf("expected valid binary PNG signature in c.Image, got length=%d", len(c.Image))
	}
	img, err := png.Decode(bytes.NewReader(c.Image))
	if err != nil || img == nil {
		t.Fatalf("failed to decode binary PNG image bytes: %v", err)
	}
	if img.Bounds().Dx() != 280 || img.Bounds().Dy() != 75 {
		t.Fatalf("unexpected image dimensions: %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}

	// 4. Test Valid Solve
	err = Verify(userID, secret, c.ID, c.Answer, c.Signature, c.IssuedAt)
	if err != nil {
		t.Fatalf("expected valid captcha solution to pass, got: %v", err)
	}

	// 5. SECURITY TEST: Anti-Replay (single-use token cannot be re-used)
	err = Verify(userID, secret, c.ID, c.Answer, c.Signature, c.IssuedAt)
	if err == nil {
		t.Fatalf("SECURITY VIOLATION: replayed captcha ID was accepted a second time!")
	}
}

func TestCaptchaForgeryAndCrossUser(t *testing.T) {
	secret := "ultra_secure_session_secret_key_999"

	// 1. Signature Tampering & Forgery
	c2 := Generate("user_test_security_2", secret)
	err := Verify("user_test_security_2", secret, c2.ID, "WRONG_ANSWER", c2.Signature, c2.IssuedAt)
	if err == nil {
		t.Fatalf("SECURITY VIOLATION: invalid answer was accepted!")
	}

	// 2. Cross-User Attack (Player B cannot solve Player A's challenge)
	c3 := Generate("victim_user_3", secret)
	err = Verify("attacker_user_3", secret, c3.ID, c3.Answer, c3.Signature, c3.IssuedAt)
	if err == nil {
		t.Fatalf("SECURITY VIOLATION: attacker user solved victim's captcha challenge!")
	}

	// 3. Expired Challenge
	c4 := Generate("user_test_security_4", secret)
	c4.IssuedAt = time.Now().Unix() - 250 // 250s ago (>180s expiry)
	c4.Signature = sign("user_test_security_4", secret, c4.ID, c4.Answer, c4.IssuedAt)
	err = Verify("user_test_security_4", secret, c4.ID, c4.Answer, c4.Signature, c4.IssuedAt)
	if err == nil {
		t.Fatalf("SECURITY VIOLATION: expired captcha was accepted!")
	}
}

func TestCaptchaRateLimiting(t *testing.T) {
	secret := "ultra_secure_session_secret_key_999"
	user := "user_test_rate_limit"

	c1 := Generate(user, secret)
	err := Verify(user, secret, c1.ID, c1.Answer, c1.Signature, c1.IssuedAt)
	if err != nil {
		t.Fatalf("first solve should succeed: %v", err)
	}

	// Immediate second solve should hit rate limit cooldown
	c2 := Generate(user, secret)
	err = Verify(user, secret, c2.ID, c2.Answer, c2.Signature, c2.IssuedAt)
	if err == nil || err != ErrCaptchaRateLimit {
		t.Fatalf("expected rate limit error on immediate solve, got: %v", err)
	}
}
