package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const CookieName = "casino_session"
const SessionMaxAgeSec = 30 * 24 * 3600 // 30 days

type SessionUser struct {
	UserID    string  `json:"userId"`
	Email     string  `json:"email"`
	Nick      string  `json:"nick"`
	FullName  *string `json:"fullName,omitempty"`
	FirstName *string `json:"firstName,omitempty"`
	CreatedAt int64   `json:"createdAt"`
}

// SignSession produces Base64URL(JSON) + "." + Hex(HMAC-SHA256)
func SignSession(user SessionUser, secret string) (string, error) {
	if user.CreatedAt == 0 {
		user.CreatedAt = time.Now().UnixMilli()
	}

	data, err := json.Marshal(user)
	if err != nil {
		return "", err
	}

	b64Payload := base64.RawURLEncoding.EncodeToString(data)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(b64Payload))
	sigHex := hex.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", b64Payload, sigHex), nil
}

// VerifySession verifies HMAC signature and decodes session user
func VerifySession(token, secret string) (*SessionUser, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid token format")
	}

	b64Payload, sigHex := parts[0], parts[1]

	expectedSigBytes, err := hex.DecodeString(sigHex)
	if err != nil {
		return nil, fmt.Errorf("invalid hex signature")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(b64Payload))
	computedSig := mac.Sum(nil)

	if !hmac.Equal(computedSig, expectedSigBytes) {
		return nil, fmt.Errorf("session signature mismatch")
	}

	data, err := base64.RawURLEncoding.DecodeString(b64Payload)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 payload: %w", err)
	}

	var user SessionUser
	if err := json.Unmarshal(data, &user); err != nil {
		return nil, fmt.Errorf("invalid session json: %w", err)
	}

	// 30 days max lifetime
	if user.UserID == "" || user.CreatedAt == 0 || time.Now().UnixMilli()-user.CreatedAt > int64(SessionMaxAgeSec)*1000 {
		return nil, fmt.Errorf("session expired")
	}

	return &user, nil
}

func SetSessionCookie(w http.ResponseWriter, token string, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   SessionMaxAgeSec,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearSessionCookie(w http.ResponseWriter, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func GetSessionToken(r *http.Request) string {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}
