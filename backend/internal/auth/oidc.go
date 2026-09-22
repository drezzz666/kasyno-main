package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/config"
)

type OpenIDConfiguration struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
	JwksURI               string `json:"jwks_uri"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

type UserInfo struct {
	Sub               string                 `json:"sub"`
	Email             string                 `json:"email"`
	PreferredUsername string                 `json:"preferred_username"`
	Name              string                 `json:"name"`
	Nickname          string                 `json:"nickname"`
	GivenName         string                 `json:"given_name"`
	Picture           string                 `json:"picture"`
	Avatar            string                 `json:"avatar"`
	Attributes        map[string]interface{} `json:"attributes,omitempty"`
}

func (u *UserInfo) GetAvatarURL(issuer string) string {
	pic := u.Picture
	if pic == "" {
		pic = u.Avatar
	}
	if pic == "" && u.Attributes != nil {
		if a, ok := u.Attributes["avatar"].(string); ok {
			pic = a
		}
	}
	if pic != "" && strings.HasPrefix(pic, "/") {
		if parsed, err := url.Parse(issuer); err == nil && parsed.Scheme != "" && parsed.Host != "" {
			pic = fmt.Sprintf("%s://%s%s", parsed.Scheme, parsed.Host, pic)
		} else {
			pic = fmt.Sprintf("%s%s", strings.TrimRight(issuer, "/"), pic)
		}
	}
	return pic
}

type OIDCClient struct {
	cfg          *config.Config
	httpClient   *http.Client
	discoveryMu  sync.RWMutex
	cachedDisc   *OpenIDConfiguration
	discExpireAt time.Time
}

func NewOIDCClient(cfg *config.Config) *OIDCClient {
	return &OIDCClient{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *OIDCClient) GetDiscovery(ctx context.Context) (*OpenIDConfiguration, error) {
	c.discoveryMu.RLock()
	if c.cachedDisc != nil && time.Now().Before(c.discExpireAt) {
		disc := c.cachedDisc
		c.discoveryMu.RUnlock()
		return disc, nil
	}
	c.discoveryMu.RUnlock()

	c.discoveryMu.Lock()
	defer c.discoveryMu.Unlock()

	if c.cachedDisc != nil && time.Now().Before(c.discExpireAt) {
		return c.cachedDisc, nil
	}

	issuer := strings.TrimRight(c.cfg.AuthentikIssuer, "/")
	discoveryURL := fmt.Sprintf("%s/.well-known/openid-configuration", issuer)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		// Fallback to manual endpoint config
		return &OpenIDConfiguration{
			Issuer:                issuer,
			AuthorizationEndpoint: c.cfg.AuthentikAuthURL,
			TokenEndpoint:         c.cfg.AuthentikTokenURL,
			UserinfoEndpoint:      c.cfg.AuthentikUserinfoURL,
			EndSessionEndpoint:    c.cfg.AuthentikEndSessionURL,
		}, nil
	}
	defer resp.Body.Close()

	var disc OpenIDConfiguration
	if err := json.NewDecoder(resp.Body).Decode(&disc); err != nil {
		return nil, fmt.Errorf("failed to decode openid configuration: %w", err)
	}

	c.cachedDisc = &disc
	c.discExpireAt = time.Now().Add(1 * time.Hour)
	return &disc, nil
}

func (c *OIDCClient) BuildAuthorizationURL(ctx context.Context, state, nonce, redirectURI string) (string, error) {
	disc, err := c.GetDiscovery(ctx)
	if err != nil {
		return "", err
	}

	authEndpoint := disc.AuthorizationEndpoint
	if authEndpoint == "" {
		authEndpoint = fmt.Sprintf("%s/authorize/", strings.TrimRight(c.cfg.AuthentikIssuer, "/"))
	}

	u, err := url.Parse(authEndpoint)
	if err != nil {
		return "", fmt.Errorf("invalid authorization endpoint url: %w", err)
	}

	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", c.cfg.AuthentikClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", "openid profile email")
	q.Set("state", state)
	q.Set("nonce", nonce)
	u.RawQuery = q.Encode()

	return u.String(), nil
}

func (c *OIDCClient) ExchangeCodeForTokens(ctx context.Context, code, redirectURI string) (*TokenResponse, error) {
	disc, err := c.GetDiscovery(ctx)
	if err != nil {
		return nil, err
	}

	tokenEndpoint := disc.TokenEndpoint
	if tokenEndpoint == "" {
		tokenEndpoint = fmt.Sprintf("%s/token/", strings.TrimRight(c.cfg.AuthentikIssuer, "/"))
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", c.cfg.AuthentikClientID)
	form.Set("client_secret", c.cfg.AuthentikClientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) 2fgt-casino/1.0")

	// Set HTTP Basic Auth for providers requiring client_secret_basic
	basicAuth := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", c.cfg.AuthentikClientID, c.cfg.AuthentikClientSecret)))
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", basicAuth))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange failed (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var tokenResp TokenResponse
	if err := json.Unmarshal(bodyBytes, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	return &tokenResp, nil
}

func (c *OIDCClient) FetchUserInfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	disc, err := c.GetDiscovery(ctx)
	if err != nil {
		return nil, err
	}

	userinfoEndpoint := disc.UserinfoEndpoint
	if userinfoEndpoint == "" {
		userinfoEndpoint = fmt.Sprintf("%s/userinfo/", strings.TrimRight(c.cfg.AuthentikIssuer, "/"))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userinfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) 2fgt-casino/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo fetch failed (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var userInfo UserInfo
	if err := json.Unmarshal(bodyBytes, &userInfo); err != nil {
		return nil, fmt.Errorf("failed to parse userinfo: %w", err)
	}

	return &userInfo, nil
}

func ParseJWTSub(jwtToken string) (string, error) {
	parts := strings.Split(jwtToken, ".")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid jwt format")
	}
	payloadSegment := parts[1]
	// Pad base64 if needed
	if pad := len(payloadSegment) % 4; pad != 0 {
		payloadSegment += strings.Repeat("=", 4-pad)
	}

	data, err := base64.URLEncoding.DecodeString(payloadSegment)
	if err != nil {
		return "", err
	}

	var payload struct {
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return "", err
	}
	return payload.Sub, nil
}

func ParseJWTPicture(jwtToken string) string {
	parts := strings.Split(jwtToken, ".")
	if len(parts) < 2 {
		return ""
	}
	payloadSegment := parts[1]
	if pad := len(payloadSegment) % 4; pad != 0 {
		payloadSegment += strings.Repeat("=", 4-pad)
	}
	data, err := base64.URLEncoding.DecodeString(payloadSegment)
	if err != nil {
		return ""
	}
	var payload struct {
		Picture string `json:"picture"`
		Avatar  string `json:"avatar"`
	}
	_ = json.Unmarshal(data, &payload)
	if payload.Picture != "" {
		return payload.Picture
	}
	return payload.Avatar
}
