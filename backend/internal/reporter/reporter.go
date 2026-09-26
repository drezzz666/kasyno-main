package reporter

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
)

const (
	ColorCritical = 0xE11D48
	ColorWarning  = 0xF59E0B
	ColorFrontend = 0x38BDF8
	ColorReact    = 0xA855F7
)

type DiscordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type DiscordFooter struct {
	Text    string `json:"text"`
	IconURL string `json:"icon_url,omitempty"`
}

type DiscordEmbed struct {
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Color       int            `json:"color,omitempty"`
	Fields      []DiscordField `json:"fields,omitempty"`
	Footer      *DiscordFooter `json:"footer,omitempty"`
	Timestamp   string         `json:"timestamp,omitempty"`
}

type DiscordAllowedMentions struct {
	Parse []string `json:"parse"`
}

type DiscordWebhookPayload struct {
	Username        string                  `json:"username,omitempty"`
	AvatarURL       string                  `json:"avatar_url,omitempty"`
	Content         string                  `json:"content,omitempty"`
	AllowedMentions *DiscordAllowedMentions `json:"allowed_mentions,omitempty"`
	Embeds          []DiscordEmbed          `json:"embeds,omitempty"`
}

type FrontendErrorReport struct {
	ErrorType  string `json:"error_type"`
	Message    string `json:"message"`
	Stack      string `json:"stack"`
	SourceFile string `json:"source_file"`
	Context    string `json:"context"`
}

type Reporter struct {
	errorWebhookURL    string
	securityWebhookURL string
	httpClient         *http.Client
	mu                 sync.Mutex
	dedupCache         map[string]time.Time
}

func NewReporter(errorWebhookURL, securityWebhookURL string) *Reporter {
	errURL := strings.TrimSpace(errorWebhookURL)
	secURL := strings.TrimSpace(securityWebhookURL)
	if secURL == "" {
		secURL = errURL
	}
	return &Reporter{
		errorWebhookURL:    errURL,
		securityWebhookURL: secURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		dedupCache: make(map[string]time.Time),
	}
}

func (r *Reporter) shouldThrottle(fingerprint string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	for k, t := range r.dedupCache {
		if now.Sub(t) > 30*time.Second {
			delete(r.dedupCache, k)
		}
	}

	if last, exists := r.dedupCache[fingerprint]; exists && now.Sub(last) < 10*time.Second {
		return true
	}

	r.dedupCache[fingerprint] = now
	return false
}

func (r *Reporter) sendAsyncToURL(webhookURL string, payload DiscordWebhookPayload) {
	if r == nil || webhookURL == "" {
		return
	}

	payload.AllowedMentions = &DiscordAllowedMentions{Parse: []string{}}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		data, err := json.Marshal(payload)
		if err != nil {
			return
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(data))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := r.httpClient.Do(req)
		if err != nil {
			log.Printf("[Reporter] Webhook delivery failed: %v", err)
			return
		}
		_ = resp.Body.Close()
	}()
}

func isFilteredText(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "niewystarczające saldo") ||
		strings.Contains(lower, "brak wystarczających środków") ||
		strings.Contains(lower, "insufficient_balance") ||
		strings.Contains(lower, "insufficient_funds") ||
		strings.Contains(lower, "brak środków") ||
		strings.Contains(lower, "nieprawidłowy kod captcha") ||
		strings.Contains(lower, "captcha_invalid")
}

func isRateLimit(errType, message, context string) bool {
	if strings.EqualFold(errType, "RATE_LIMIT") || strings.EqualFold(errType, "RATE_LIMIT_EXCEEDED") {
		return true
	}
	combined := strings.ToLower(errType + " " + message + " " + context)
	return strings.Contains(combined, "rate limit") || strings.Contains(combined, "rate_limit") || strings.Contains(combined, "429")
}

func (r *Reporter) ReportFrontendError(report *FrontendErrorReport, sess *auth.SessionUser, ip string) {
	if report == nil || isFilteredText(report.Message) || isFilteredText(report.Context) {
		return
	}

	if isRateLimit(report.ErrorType, report.Message, report.Context) {
		userID, nick := "", ""
		if sess != nil {
			userID, nick = sess.UserID, sess.Nick
		}
		r.ReportSecurityAlert("RATE_LIMIT", ip, userID, nick, report.Context, report.Message)
		return
	}

	fingerprint := hash(fmt.Sprintf("%s:%s:%s", report.ErrorType, report.SourceFile, report.Message))
	if r.shouldThrottle(fingerprint) {
		return
	}

	color := ColorFrontend
	if report.ErrorType == "REACT_RENDER_ERROR" {
		color = ColorReact
	} else if report.ErrorType == "API_ERROR" || report.ErrorType == "GAME_ACTION_ERROR" {
		color = ColorWarning
	}

	userDesc := "Anonim"
	if sess != nil {
		userDesc = fmt.Sprintf("%s (%s)", sess.Nick, sess.UserID)
	}

	fields := []DiscordField{
		{Name: "👤 Użytkownik", Value: userDesc, Inline: true},
		{Name: "📍 Plik", Value: report.SourceFile, Inline: true},
	}
	if report.Context != "" {
		fields = append(fields, DiscordField{Name: "🎮 Kontekst", Value: report.Context, Inline: true})
	}
	if report.Message != "" {
		fields = append(fields, DiscordField{Name: "🛑 Błąd", Value: fmt.Sprintf("```\n%s\n```", truncate(report.Message, 900))})
	}
	if report.Stack != "" {
		fields = append(fields, DiscordField{Name: "📜 Stack", Value: fmt.Sprintf("```javascript\n%s\n```", truncate(report.Stack, 900))})
	}

	r.sendAsyncToURL(r.errorWebhookURL, DiscordWebhookPayload{
		Username: "Kasyno Error Watcher",
		Embeds: []DiscordEmbed{{
			Title:     truncate("🚨 [FRONTEND] "+report.Message, 250),
			Color:     color,
			Fields:    fields,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}},
	})
}

func (r *Reporter) ReportPanic(req *http.Request, sess *auth.SessionUser, panicVal interface{}, stack string) {
	errMsg := fmt.Sprintf("%v", panicVal)
	if r.shouldThrottle(hash("PANIC:" + errMsg)) {
		return
	}

	path := "/"
	if req != nil {
		path = req.Method + " " + req.URL.Path
	}

	fields := []DiscordField{
		{Name: "🌐 Endpoint", Value: path, Inline: true},
		{Name: "🛑 Panic", Value: fmt.Sprintf("```\n%s\n```", truncate(errMsg, 900))},
		{Name: "📜 Stack", Value: fmt.Sprintf("```go\n%s\n```", truncate(stack, 900))},
	}

	r.sendAsyncToURL(r.errorWebhookURL, DiscordWebhookPayload{
		Username: "Kasyno Error Watcher",
		Embeds: []DiscordEmbed{{
			Title:     truncate("🔥 [PANIC] "+errMsg, 250),
			Color:     ColorCritical,
			Fields:    fields,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}},
	})
}

func (r *Reporter) ReportBackendError(category, message, stack string, details map[string]interface{}) {
	if isFilteredText(category) || isFilteredText(message) {
		return
	}
	if isRateLimit(category, message, "") {
		r.ReportSecurityAlert("RATE_LIMIT", "", "", "", category, message)
		return
	}
	if r.shouldThrottle(hash(category + ":" + message)) {
		return
	}

	fields := []DiscordField{
		{Name: "📁 Kategoria", Value: category, Inline: true},
		{Name: "🛑 Błąd", Value: fmt.Sprintf("```\n%s\n```", truncate(message, 900))},
	}
	if stack != "" {
		fields = append(fields, DiscordField{Name: "📜 Stack", Value: fmt.Sprintf("```go\n%s\n```", truncate(stack, 900))})
	}

	r.sendAsyncToURL(r.errorWebhookURL, DiscordWebhookPayload{
		Username: "Kasyno Error Watcher",
		Embeds: []DiscordEmbed{{
			Title:     truncate("⚠️ [BACKEND] "+category+": "+message, 250),
			Color:     ColorCritical,
			Fields:    fields,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}},
	})
}

func (r *Reporter) ReportSecurityAlert(category, ip, userID, nick, action, details string) {
	if r == nil || !r.HasSecurityWebhook() || r.shouldThrottle(hash(category+":"+userID+":"+action)) {
		return
	}

	fields := []DiscordField{
		{Name: "👤 Gracz", Value: fmt.Sprintf("%s (%s)", nick, userID), Inline: true},
		{Name: "🎯 Akcja", Value: action, Inline: true},
		{Name: "🛑 Szczegóły", Value: fmt.Sprintf("```\n%s\n```", truncate(details, 900))},
	}

	r.sendAsyncToURL(r.securityWebhookURL, DiscordWebhookPayload{
		Username: "Kasyno Security Watcher",
		Embeds: []DiscordEmbed{{
			Title:     truncate("🛡️ [SECURITY] "+category, 250),
			Color:     ColorWarning,
			Fields:    fields,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}},
	})
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}
