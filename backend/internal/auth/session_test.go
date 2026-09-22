package auth

import (
	"testing"
	"time"
)

func TestSessionSigningAndVerification(t *testing.T) {
	secret := "test-secret-key-32-characters-long!!"
	user := SessionUser{
		UserID:    "user_12345",
		Email:     "gracz@2fgt.pl",
		Nick:      "LuckyPlayer",
		CreatedAt: time.Now().UnixMilli(),
	}

	token, err := SignSession(user, secret)
	if err != nil {
		t.Fatalf("failed to sign session: %v", err)
	}

	verified, err := VerifySession(token, secret)
	if err != nil {
		t.Fatalf("failed to verify valid session: %v", err)
	}

	if verified.UserID != user.UserID || verified.Nick != user.Nick || verified.Email != user.Email {
		t.Errorf("session user mismatch: expected %+v, got %+v", user, verified)
	}

	// Test tampering with wrong secret
	_, err = VerifySession(token, "wrong-secret-key-that-does-not-match")
	if err == nil {
		t.Errorf("expected error when verifying with wrong secret")
	}

	// Test expired session
	expiredUser := SessionUser{
		UserID:    "user_expired",
		Email:     "exp@2fgt.pl",
		Nick:      "OldPlayer",
		CreatedAt: time.Now().Add(-35 * 24 * time.Hour).UnixMilli(),
	}
	expiredToken, _ := SignSession(expiredUser, secret)
	_, err = VerifySession(expiredToken, secret)
	if err == nil {
		t.Errorf("expected error for expired session")
	}
}
