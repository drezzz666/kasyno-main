package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/discordbot"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

type AuthHandler struct {
	cfg    *config.Config
	ledger *ledger.Service
	oidc   *auth.OIDCClient
}

func NewAuthHandler(cfg *config.Config, ledgerService *ledger.Service, oidcClient *auth.OIDCClient) *AuthHandler {
	return &AuthHandler{
		cfg:    cfg,
		ledger: ledgerService,
		oidc:   oidcClient,
	}
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Login handles GET /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	state := randomHex(16)
	nonce := randomHex(16)

	redirectURI := fmt.Sprintf("%s/api/auth/callback", strings.TrimRight(h.cfg.AppURL, "/"))
	authURL, err := h.oidc.BuildAuthorizationURL(r.Context(), state, nonce, redirectURI)
	if err != nil {
		http.Error(w, fmt.Sprintf("Błąd budowania adresu autoryzacji: %v", err), http.StatusInternalServerError)
		return
	}

	// Set CSRF state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "casino_oidc_state",
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   strings.HasPrefix(h.cfg.AppURL, "https"),
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback handles GET /api/auth/callback
func (h *AuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	errParam := r.URL.Query().Get("error")
	if errParam != "" {
		errDesc := r.URL.Query().Get("error_description")
		http.Error(w, fmt.Sprintf("Błąd logowania Authentik: %s - %s", errParam, errDesc), http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Brak kodu autoryzacyjnego OIDC.", http.StatusBadRequest)
		return
	}

	state := r.URL.Query().Get("state")
	if stateCookie, err := r.Cookie("casino_oidc_state"); err == nil {
		if stateCookie.Value != "" && state != "" && stateCookie.Value != state {
			http.Error(w, "Nieprawidłowy parametr stanu OIDC (CSRF).", http.StatusForbidden)
			return
		}
	}

	redirectURI := fmt.Sprintf("%s/api/auth/callback", strings.TrimRight(h.cfg.AppURL, "/"))
	tokenResp, err := h.oidc.ExchangeCodeForTokens(r.Context(), code, redirectURI)
	if err != nil {
		log.Printf("[Auth Callback] Exchange error: %v", err)
		http.Error(w, fmt.Sprintf("Błąd wymiany tokenu: %v", err), http.StatusInternalServerError)
		return
	}

	userInfo, err := h.oidc.FetchUserInfo(r.Context(), tokenResp.AccessToken)
	if err != nil {
		log.Printf("[Auth Callback] Userinfo error: %v", err)
		http.Error(w, fmt.Sprintf("Błąd pobierania danych użytkownika: %v", err), http.StatusInternalServerError)
		return
	}

	userID := userInfo.Sub
	email := userInfo.Email
	if email == "" {
		email = fmt.Sprintf("%s@authentik.local", userID)
	}

	nick := userInfo.PreferredUsername
	if nick == "" {
		nick = userInfo.Nickname
	}
	if nick == "" {
		nick = strings.Split(email, "@")[0]
	}

	avatar := userInfo.GetAvatarURL(h.cfg.AuthentikIssuer)
	if avatar == "" && tokenResp.IDToken != "" {
		avatar = auth.ParseJWTPicture(tokenResp.IDToken)
		if avatar != "" && strings.HasPrefix(avatar, "/") {
			if parsed, err := url.Parse(h.cfg.AuthentikIssuer); err == nil && parsed.Scheme != "" && parsed.Host != "" {
				avatar = fmt.Sprintf("%s://%s%s", parsed.Scheme, parsed.Host, avatar)
			}
		}
	}

	// Upsert player in PostgreSQL
	player, err := h.ledger.GetOrCreatePlayer(r.Context(), userID, email, nick, avatar, h.cfg.DefaultBalance)
	if err != nil {
		log.Printf("[Auth Callback] Player upsert error: %v", err)
		http.Error(w, fmt.Sprintf("Błąd bazy danych gracza: %v", err), http.StatusInternalServerError)
		return
	}

	var avatarPtr *string
	if avatar != "" {
		avatarPtr = &avatar
	} else if player.Avatar != nil {
		avatarPtr = player.Avatar
	}

	// Create signed session cookie
	sessUser := auth.SessionUser{
		UserID:    player.UserID,
		Email:     player.Email,
		Nick:      player.Nick,
		FullName:  &userInfo.Name,
		FirstName: &userInfo.GivenName,
		Avatar:    avatarPtr,
	}

	signedToken, err := auth.SignSession(sessUser, h.cfg.SessionSecret)
	if err != nil {
		http.Error(w, "Błąd generowania sesji", http.StatusInternalServerError)
		return
	}

	isSecure := strings.HasPrefix(h.cfg.AppURL, "https")
	auth.SetSessionCookie(w, signedToken, isSecure)

	// Record login log
	ip := GetClientIP(r)
	userAgent := r.UserAgent()
	if h.ledger != nil {
		go func() {
			_, _ = h.ledger.RecordLogin(context.Background(), player.UserID, player.Nick, ip, userAgent)
		}()
	}

	// Trigger Discord Bot Telemetry & Login Thread Sync
	if bot := discordbot.GetGlobalBot(); bot != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			defer cancel()
			_ = bot.LogUserLogin(ctx, player.UserID, player.Nick, ip, userAgent)
			_ = bot.SyncUserTelemetry(ctx, &discordbot.UserTelemetryReport{
				UserID:    player.UserID,
				Nick:      player.Nick,
				Email:     player.Email,
				IP:        ip,
				UserAgent: userAgent,
			})
		}()
	}

	// Clear CSRF state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "casino_oidc_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/", http.StatusFound)
}

// Logout handles GET & POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	isSecure := strings.HasPrefix(h.cfg.AppURL, "https")
	auth.ClearSessionCookie(w, isSecure)

	if r.Method == http.MethodPost {
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	disc, _ := h.oidc.GetDiscovery(r.Context())
	redirectDestination := "/"
	if disc != nil && disc.EndSessionEndpoint != "" {
		redirectDestination = fmt.Sprintf("%s?post_logout_redirect_uri=%s", disc.EndSessionEndpoint, url.QueryEscape(h.cfg.AppURL))
	}

	http.Redirect(w, r, redirectDestination, http.StatusFound)
}

// Verify handles GET & HEAD /api/auth/verify (used by reverse proxy auth_request)
func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	token := auth.GetSessionToken(r)
	if token == "" {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	_, err := auth.VerifySession(token, h.cfg.SessionSecret)
	if err != nil {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
}

// Me handles GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	token := auth.GetSessionToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, map[string]interface{}{"authenticated": false, "user": nil})
		return
	}

	sess, err := auth.VerifySession(token, h.cfg.SessionSecret)
	if err != nil {
		JSON(w, http.StatusUnauthorized, map[string]interface{}{"authenticated": false, "user": nil})
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"authenticated": true,
		"user": map[string]interface{}{
			"userId":   sess.UserID,
			"email":    sess.Email,
			"nick":     sess.Nick,
			"fullName": sess.FullName,
			"avatar":   sess.Avatar,
		},
	})
}

// BackchannelLogout handles POST /api/auth/backchannel-logout (OIDC Back-Channel Logout 1.0)
func (h *AuthHandler) BackchannelLogout(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	logoutToken := r.FormValue("logout_token")

	if logoutToken == "" {
		var jsonBody struct {
			LogoutToken string `json:"logout_token"`
		}
		_ = json.NewDecoder(r.Body).Decode(&jsonBody)
		logoutToken = jsonBody.LogoutToken
	}

	if logoutToken == "" {
		http.Error(w, "Missing logout_token parameter", http.StatusBadRequest)
		return
	}

	sub, err := auth.ParseJWTSub(logoutToken)
	if err != nil || sub == "" {
		http.Error(w, "Invalid logout_token payload", http.StatusBadRequest)
		return
	}

	log.Printf("[OIDC Backchannel Logout] Terminated session for user sub=%s", sub)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

