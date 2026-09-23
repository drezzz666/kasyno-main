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

// Discord Webhook Colors
const (
	ColorCritical = 0xE11D48 // Red (Panics, 500s)
	ColorWarning  = 0xF59E0B // Amber/Orange (API, Fraud, Business errors)
	ColorFrontend = 0x38BDF8 // Sky Blue (Frontend JS Unhandled)
	ColorReact    = 0xA855F7 // Purple (React Component Render Error)
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
	Parse []string `json:"parse"` // Empty array strictly blocks all @everyone, @here, role and user pings
}

type DiscordWebhookPayload struct {
	Username        string                  `json:"username,omitempty"`
	AvatarURL       string                  `json:"avatar_url,omitempty"`
	Content         string                  `json:"content,omitempty"`
	AllowedMentions *DiscordAllowedMentions `json:"allowed_mentions,omitempty"`
	Embeds          []DiscordEmbed          `json:"embeds,omitempty"`
}

type Breadcrumb struct {
	Timestamp string      `json:"timestamp"`
	Category  string      `json:"category"` // navigation, game_action, bet_change, ws_event, api_call, ui
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
}

type FrontendErrorReport struct {
	ErrorType          string        `json:"error_type"`           // UNHANDLED_EXCEPTION, PROMISE_REJECTION, REACT_RENDER_ERROR, API_ERROR, GAME_ACTION_ERROR
	Message            string        `json:"message"`              // Error message
	Stack              string        `json:"stack"`                // Stack trace string
	ComponentStack     string        `json:"component_stack"`      // React component stack if any
	SourceFile         string        `json:"source_file"`          // File & line number (e.g. GameTableDialog.jsx:333)
	Context            string        `json:"context"`              // Description of user action (e.g. "Crash: start round")
	Game               string        `json:"game"`                 // Active game name (crash, limbo, slots, etc.)
	ActionPayload      interface{}   `json:"action_payload"`       // Bet amount, target multiplier, etc.
	Breadcrumbs        []Breadcrumb  `json:"breadcrumbs"`          // Ring buffer of last player actions before crash
	NetworkInfo        string        `json:"network_info"`         // Effective connection (e.g. 4g / 25Mbps / 40ms RTT)
	MemoryMB           string        `json:"memory_mb"`            // Client JS Heap memory
	NavigationTiming   string        `json:"navigation_timing"`    // Page load / TTFB diagnostics
	LatencyMs          float64       `json:"latency_ms"`           // Recent API action latency
	GPUInfo            string        `json:"gpu_info,omitempty"`   // WebGL GPU Renderer / Vendor
	CPUCores           string        `json:"cpu_cores,omitempty"`  // CPU logical cores
	DeviceRAM          string        `json:"device_ram,omitempty"` // Device RAM
	Timezone           string        `json:"timezone,omitempty"`   // User timezone & UTC offset
	Language           string        `json:"language,omitempty"`   // Browser languages
	Platform           string        `json:"platform,omitempty"`   // OS Platform
	ScreenDetails      string        `json:"screen_details,omitempty"`
	Orientation        string        `json:"orientation,omitempty"`
	TouchPoints        int           `json:"touch_points,omitempty"`
	ColorScheme        string        `json:"color_scheme,omitempty"`
	PageVisibility     string        `json:"page_visibility,omitempty"`
	Referrer           string        `json:"referrer,omitempty"`
	SessionDurationSec int           `json:"session_duration_sec,omitempty"`
	URL                string        `json:"url"`        // Full page URL
	UserAgent          string        `json:"user_agent"` // Client Browser / OS
	Screen             string        `json:"screen"`     // Screen resolution
	Timestamp          string        `json:"timestamp"`  // Client ISO timestamp
}

type Reporter struct {
	errorWebhookURL    string
	securityWebhookURL string
	httpClient         *http.Client
	mu                 sync.Mutex
	dedupCache         map[string]time.Time
	globalWindow       []time.Time
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
		dedupCache:   make(map[string]time.Time),
		globalWindow: make([]time.Time, 0, 30),
	}
}

func (r *Reporter) HasErrorWebhook() bool {
	return r != nil && r.errorWebhookURL != ""
}

func (r *Reporter) HasSecurityWebhook() bool {
	return r != nil && r.securityWebhookURL != ""
}

func (r *Reporter) HasWebhook() bool {
	return r != nil && (r.errorWebhookURL != "" || r.securityWebhookURL != "")
}

// shouldThrottle checks if an identical error was sent recently (dedup) OR if global outbound limit (20/min) is reached.
func (r *Reporter) shouldThrottle(fingerprint string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()

	// 1. Global rate limiter: Max 20 outbound webhook messages per 60 seconds
	cutoff := now.Add(-60 * time.Second)
	valid := r.globalWindow[:0]
	for _, t := range r.globalWindow {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	r.globalWindow = valid

	if len(r.globalWindow) >= 20 {
		return true // Exceeded safe Discord global budget
	}

	// 2. Deduplication Cache: Clean up old entries (> 60s)
	for k, t := range r.dedupCache {
		if now.Sub(t) > 60*time.Second {
			delete(r.dedupCache, k)
		}
	}

	// 3. Throttle identical errors within 15 seconds
	if last, exists := r.dedupCache[fingerprint]; exists {
		if now.Sub(last) < 15*time.Second {
			return true
		}
	}

	r.dedupCache[fingerprint] = now
	r.globalWindow = append(r.globalWindow, now)
	return false
}

func (r *Reporter) sendAsyncToURL(webhookURL string, payload DiscordWebhookPayload) {
	if r == nil || webhookURL == "" {
		return
	}

	// Explicitly disable any Discord ping parsing
	payload.AllowedMentions = &DiscordAllowedMentions{
		Parse: []string{},
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		data, err := json.Marshal(payload)
		if err != nil {
			log.Printf("[Reporter] Error marshaling Discord payload: %v", err)
			return
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(data))
		if err != nil {
			log.Printf("[Reporter] Error creating webhook request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := r.httpClient.Do(req)
		if err != nil {
			log.Printf("[Reporter] Failed to send Discord webhook: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("[Reporter] Discord webhook returned status %d", resp.StatusCode)
		}
	}()
}

func (r *Reporter) sendAsync(payload DiscordWebhookPayload) {
	if !r.HasErrorWebhook() {
		return
	}
	r.sendAsyncToURL(r.errorWebhookURL, payload)
}

func isInsufficientFundsText(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "niewystarczające saldo") ||
		strings.Contains(lower, "brak wystarczających środków") ||
		strings.Contains(lower, "insufficient_balance") ||
		strings.Contains(lower, "insufficient_funds") ||
		strings.Contains(lower, "niewystarczające środki") ||
		strings.Contains(lower, "brak środków") ||
		strings.Contains(lower, "brak aktywnej gry") ||
		strings.Contains(lower, "masz już aktywną grę")
}

func isRateLimitText(errType, message, context string) bool {
	if strings.EqualFold(errType, "RATE_LIMIT") || strings.EqualFold(errType, "RATE_LIMIT_EXCEEDED") {
		return true
	}
	combined := strings.ToLower(errType + " " + message + " " + context)
	return strings.Contains(combined, "rate limit") ||
		strings.Contains(combined, "rate_limit") ||
		strings.Contains(combined, "zbyt wiele akcji") ||
		strings.Contains(combined, "429")
}

// ReportFrontendError sends a comprehensive report of a frontend crash or client-side error to Discord.
func (r *Reporter) ReportFrontendError(report *FrontendErrorReport, sess *auth.SessionUser, ip string) {
	if report == nil {
		return
	}

	// 1. Never send webhooks for routine insufficient funds / balance notifications
	if isInsufficientFundsText(report.Message) || isInsufficientFundsText(report.Context) {
		return
	}

	// 2. Route Rate Limit violations ONLY to the anticheat/security webhook, never the general error webhook
	if isRateLimitText(report.ErrorType, report.Message, report.Context) {
		userID := ""
		nick := ""
		if sess != nil {
			userID = sess.UserID
			nick = sess.Nick
		}
		action := report.Context
		if report.Game != "" {
			action = fmt.Sprintf("%s (%s)", report.Game, report.Context)
		}
		r.ReportSecurityAlert("RATE_LIMIT", ip, userID, nick, action, report.Message)
		return
	}

	fingerprint := hashFingerprint(fmt.Sprintf("%s:%s:%s:%s", report.ErrorType, report.SourceFile, report.Message, report.Context))
	if r.shouldThrottle(fingerprint) {
		return
	}

	// Choose color and icon based on error type
	color := ColorFrontend
	titlePrefix := "🚨 [FRONTEND JS ERROR]"
	switch report.ErrorType {
	case "REACT_RENDER_ERROR":
		color = ColorReact
		titlePrefix = "⚛️ [REACT UI CRASH]"
	case "API_ERROR", "GAME_ACTION_ERROR":
		color = ColorWarning
		titlePrefix = "⚠️ [API / GAME ACTION ERROR]"
	case "PROMISE_REJECTION":
		titlePrefix = "💥 [UNHANDLED PROMISE REJECTION]"
	}

	title := truncate(fmt.Sprintf("%s %s", titlePrefix, report.Message), 250)

	// User description
	userInfo := "Anonim / Niezalogowany"
	if sess != nil {
		userInfo = fmt.Sprintf("**%s**\nID: `%s`\nEmail: `%s`", sess.Nick, sess.UserID, sess.Email)
	}
	if ip != "" {
		userInfo += fmt.Sprintf("\nIP: `%s`", ip)
	}

	fields := []DiscordField{
		{
			Name:   "👤 Gracz / Użytkownik",
			Value:  userInfo,
			Inline: true,
		},
	}

	// Game / Action Context
	gameContext := ""
	if report.Game != "" {
		gameContext += fmt.Sprintf("**Gra:** `%s`\n", report.Game)
	}
	if report.Context != "" {
		gameContext += fmt.Sprintf("**Akcja:** %s\n", report.Context)
	}
	if gameContext != "" {
		fields = append(fields, DiscordField{
			Name:   "🎮 Kontekst Gry / Akcji",
			Value:  strings.TrimSpace(gameContext),
			Inline: true,
		})
	}

	// Code location & URL
	locInfo := ""
	if report.SourceFile != "" {
		locInfo += fmt.Sprintf("**Plik / Linia:** `%s`\n", report.SourceFile)
	}
	if report.URL != "" {
		locInfo += fmt.Sprintf("**URL:** %s\n", report.URL)
	}
	if locInfo != "" {
		fields = append(fields, DiscordField{
			Name:   "📍 Lokalizacja w kodzie",
			Value:  strings.TrimSpace(locInfo),
			Inline: false,
		})
	}

	// Action Payload
	if report.ActionPayload != nil {
		if payloadBytes, err := json.MarshalIndent(report.ActionPayload, "", "  "); err == nil && len(payloadBytes) > 2 {
			fields = append(fields, DiscordField{
				Name:   "📦 Wysłany Payload (dla AI/Dev)",
				Value:  fmt.Sprintf("```json\n%s\n```", truncate(string(payloadBytes), 950)),
				Inline: false,
			})
		}
	}

	// Error Message
	if report.Message != "" {
		fields = append(fields, DiscordField{
			Name:   "🛑 Komunikat Błędu",
			Value:  fmt.Sprintf("```\n%s\n```", truncate(report.Message, 950)),
			Inline: false,
		})
	}

	// Stack Trace
	if report.Stack != "" {
		fields = append(fields, DiscordField{
			Name:   "📜 Stack Trace (JS)",
			Value:  fmt.Sprintf("```javascript\n%s\n```", truncate(report.Stack, 950)),
			Inline: false,
		})
	}

	// React Component Stack
	if report.ComponentStack != "" {
		fields = append(fields, DiscordField{
			Name:   "⚛️ React Component Stack",
			Value:  fmt.Sprintf("```\n%s\n```", truncate(report.ComponentStack, 950)),
			Inline: false,
		})
	}

	// Breadcrumbs trace (last player actions before error)
	if len(report.Breadcrumbs) > 0 {
		var bcLines []string
		for i, bc := range report.Breadcrumbs {
			ts := bc.Timestamp
			if len(ts) > 19 {
				ts = ts[11:19] // Keep HH:MM:SS
			}
			line := fmt.Sprintf("`%s` [%s] %s", ts, bc.Category, bc.Message)
			if bc.Data != nil {
				if dBytes, err := json.Marshal(bc.Data); err == nil && len(dBytes) > 2 && len(dBytes) < 80 {
					line += fmt.Sprintf(" %s", string(dBytes))
				}
			}
			bcLines = append(bcLines, line)
			if i >= 15 {
				break
			}
		}
		fields = append(fields, DiscordField{
			Name:   "👣 Ślad Akcji Gracza (Breadcrumbs)",
			Value:  truncate(strings.Join(bcLines, "\n"), 950),
			Inline: false,
		})
	}

	// Client Environment & Performance Telemetry
	envInfo := ""
	if report.UserAgent != "" {
		envInfo += fmt.Sprintf("**Przeglądarka / OS:** `%s`\n", truncate(report.UserAgent, 200))
	}
	if report.Screen != "" {
		envInfo += fmt.Sprintf("**Ekran:** `%s`\n", report.Screen)
	}
	if report.GPUInfo != "" {
		envInfo += fmt.Sprintf("**Karta graficzna (GPU):** `%s`\n", truncate(report.GPUInfo, 150))
	}
	hwParts := []string{}
	if report.CPUCores != "" {
		hwParts = append(hwParts, fmt.Sprintf("CPU: %s", report.CPUCores))
	}
	if report.DeviceRAM != "" {
		hwParts = append(hwParts, fmt.Sprintf("RAM: %s", report.DeviceRAM))
	}
	if report.TouchPoints > 0 {
		hwParts = append(hwParts, fmt.Sprintf("Touch: %d pkt", report.TouchPoints))
	}
	if len(hwParts) > 0 {
		envInfo += fmt.Sprintf("**Sprzęt:** `%s`\n", strings.Join(hwParts, " • "))
	}
	if report.Timezone != "" || report.Language != "" {
		tzLang := []string{}
		if report.Timezone != "" {
			tzLang = append(tzLang, fmt.Sprintf("Strefa: %s", report.Timezone))
		}
		if report.Language != "" {
			tzLang = append(tzLang, fmt.Sprintf("Język: %s", report.Language))
		}
		envInfo += fmt.Sprintf("**Lokalizacja:** `%s`\n", strings.Join(tzLang, " • "))
	}
	if report.NetworkInfo != "" {
		envInfo += fmt.Sprintf("**Sieć:** `%s`\n", report.NetworkInfo)
	}
	if report.MemoryMB != "" {
		envInfo += fmt.Sprintf("**Pamięć JS Heap:** `%s`\n", report.MemoryMB)
	}
	if report.NavigationTiming != "" {
		envInfo += fmt.Sprintf("**Czasy strony (TTFB/Load):** `%s`\n", report.NavigationTiming)
	}
	if report.LatencyMs > 0 {
		envInfo += fmt.Sprintf("**Ostatnie RTT / Opóźnienie API:** `%.1f ms`\n", report.LatencyMs)
	}
	if report.SessionDurationSec > 0 || report.ColorScheme != "" || report.Referrer != "" {
		sessParts := []string{}
		if report.SessionDurationSec > 0 {
			sessParts = append(sessParts, fmt.Sprintf("Czas sesji: %ds", report.SessionDurationSec))
		}
		if report.ColorScheme != "" {
			sessParts = append(sessParts, report.ColorScheme)
		}
		if report.PageVisibility != "" {
			sessParts = append(sessParts, fmt.Sprintf("Karta: %s", report.PageVisibility))
		}
		if report.Referrer != "" {
			sessParts = append(sessParts, fmt.Sprintf("Ref: %s", truncate(report.Referrer, 40)))
		}
		envInfo += fmt.Sprintf("**Stan sesji:** `%s`\n", strings.Join(sessParts, " • "))
	}
	if envInfo != "" {
		fields = append(fields, DiscordField{
			Name:   "💻 Telemetria, Sprzęt i Środowisko Klienta",
			Value:  strings.TrimSpace(envInfo),
			Inline: false,
		})
	}

	embed := DiscordEmbed{
		Title:       title,
		Description: "Szczegółowy raport błędu z aplikacji frontendowej wygenerowany dla AI / Developerów.",
		Color:       color,
		Fields:      fields,
		Footer: &DiscordFooter{
			Text: "2FGT Casino • Frontend Error Reporter",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	r.sendAsync(DiscordWebhookPayload{
		Username:  "Kasyno Error Watcher",
		AvatarURL: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/alert-circle.png",
		Embeds:    []DiscordEmbed{embed},
	})
}

// ReportPanic reports an unhandled panic in Go HTTP handlers to Discord.
func (r *Reporter) ReportPanic(req *http.Request, sess *auth.SessionUser, panicVal interface{}, stack string) {
	errMsg := fmt.Sprintf("%v", panicVal)
	fingerprint := hashFingerprint("PANIC:" + errMsg)
	if r.shouldThrottle(fingerprint) {
		return
	}

	userInfo := "Anonim / Niezalogowany"
	if sess != nil {
		userInfo = fmt.Sprintf("**%s**\nID: `%s`\nEmail: `%s`", sess.Nick, sess.UserID, sess.Email)
	}

	ip := ""
	if req != nil {
		ip = req.RemoteAddr
	}

	fields := []DiscordField{
		{
			Name:   "👤 Użytkownik",
			Value:  userInfo,
			Inline: true,
		},
		{
			Name:   "🌐 Żądanie HTTP",
			Value:  fmt.Sprintf("**%s** `%s`\nIP: `%s`", req.Method, req.URL.Path, ip),
			Inline: true,
		},
		{
			Name:   "🛑 Wartość Paniki (Panic Error)",
			Value:  fmt.Sprintf("```\n%s\n```", truncate(errMsg, 950)),
			Inline: false,
		},
		{
			Name:   "📜 Go Runtime Stack Trace (dla AI/Dev)",
			Value:  fmt.Sprintf("```go\n%s\n```", truncate(stack, 950)),
			Inline: false,
		},
	}

	embed := DiscordEmbed{
		Title:       truncate(fmt.Sprintf("🔥 [CRITICAL SERVER PANIC] %s %s: %s", req.Method, req.URL.Path, errMsg), 250),
		Description: "Serwer Go napotkał nieobsłużony błąd krytyczny (panic) w trakcie obsługi żądania HTTP.",
		Color:       ColorCritical,
		Fields:      fields,
		Footer: &DiscordFooter{
			Text: "2FGT Casino • Server Panic Watcher",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	r.sendAsync(DiscordWebhookPayload{
		Username:  "Kasyno Error Watcher",
		AvatarURL: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/flame.png",
		Embeds:    []DiscordEmbed{embed},
	})
}

// ReportBackendError reports a server-side business logic / database / transaction error.
func (r *Reporter) ReportBackendError(category, message, stack string, details map[string]interface{}) {
	// 1. Never send webhooks for routine insufficient funds / balance notifications
	if isInsufficientFundsText(category) || isInsufficientFundsText(message) {
		return
	}

	// 2. Route Rate Limit violations ONLY to security/anticheat webhook
	if isRateLimitText(category, message, "") {
		r.ReportSecurityAlert("RATE_LIMIT", "", "", "", category, message)
		return
	}

	fingerprint := hashFingerprint(fmt.Sprintf("%s:%s", category, message))
	if r.shouldThrottle(fingerprint) {
		return
	}

	fields := []DiscordField{
		{
			Name:   "📁 Kategoria",
			Value:  fmt.Sprintf("`%s`", category),
			Inline: true,
		},
		{
			Name:   "🛑 Komunikat Błędu",
			Value:  fmt.Sprintf("```\n%s\n```", truncate(message, 950)),
			Inline: false,
		},
	}

	if details != nil && len(details) > 0 {
		if data, err := json.MarshalIndent(details, "", "  "); err == nil {
			fields = append(fields, DiscordField{
				Name:   "📋 Szczegóły Kontekstu",
				Value:  fmt.Sprintf("```json\n%s\n```", truncate(string(data), 950)),
				Inline: false,
			})
		}
	}

	if stack != "" {
		fields = append(fields, DiscordField{
			Name:   "📜 Stack Trace",
			Value:  fmt.Sprintf("```go\n%s\n```", truncate(stack, 950)),
			Inline: false,
		})
	}

	embed := DiscordEmbed{
		Title:       truncate(fmt.Sprintf("⚠️ [SERVER ERROR] %s: %s", category, message), 250),
		Description: "Błąd operacji serwerowej w kasynie (baza danych / transakcja / ledger).",
		Color:       ColorCritical,
		Fields:      fields,
		Footer: &DiscordFooter{
			Text: "2FGT Casino • Backend Error Watcher",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	r.sendAsync(DiscordWebhookPayload{
		Username:  "Kasyno Error Watcher",
		AvatarURL: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/alert-octagon.png",
		Embeds:    []DiscordEmbed{embed},
	})
}

// ReportSecurityAlert reports an anticheat, bot detection, or security violation to the dedicated security webhook.
func (r *Reporter) ReportSecurityAlert(category, ip, userID, nick, action, details string) {
	if r == nil || !r.HasSecurityWebhook() {
		return
	}

	fingerprint := hashFingerprint(fmt.Sprintf("SEC:%s:%s:%s:%s", category, userID, action, details))
	if r.shouldThrottle(fingerprint) {
		return
	}

	titlePrefix := "🛡️ [ANTICHEAT / SECURITY ALERT]"
	color := ColorWarning
	switch category {
	case "BOT_DETECTION":
		titlePrefix = "🤖 [BOT DETECTION]"
		color = 0xEA580C // Dark Orange
	case "SECURITY_VIOLATION", "EXPLOIT_ATTEMPT", "PROOF_TAMPERING", "CHALLENGE_VERIFICATION_FAILED":
		titlePrefix = "🚨 [SECURITY VIOLATION]"
		color = ColorCritical
	case "RATE_LIMIT":
		titlePrefix = "⚡ [RATE LIMIT EXCEEDED]"
		color = ColorWarning
	}

	title := truncate(fmt.Sprintf("%s %s", titlePrefix, category), 250)

	userInfo := "Anonim / Niezalogowany"
	if nick != "" || userID != "" {
		userInfo = fmt.Sprintf("**%s**\nID: `%s`", nick, userID)
	}
	if ip != "" {
		userInfo += fmt.Sprintf("\nIP: `%s`", ip)
	}

	fields := []DiscordField{
		{
			Name:   "👤 Gracz",
			Value:  userInfo,
			Inline: true,
		},
	}

	if action != "" {
		fields = append(fields, DiscordField{
			Name:   "🎯 Wywołana Akcja / Gra",
			Value:  fmt.Sprintf("`%s`", action),
			Inline: true,
		})
	}

	if details != "" {
		fields = append(fields, DiscordField{
			Name:   "🛑 Szczegóły Naruszenia",
			Value:  fmt.Sprintf("```\n%s\n```", truncate(details, 950)),
			Inline: false,
		})
	}

	embed := DiscordEmbed{
		Title:       title,
		Description: "Wykryto podejrzaną aktywność lub naruszenie reguł gry przez system Anticheat.",
		Color:       color,
		Fields:      fields,
		Footer: &DiscordFooter{
			Text: "2FGT Casino • Anticheat & Security Watcher",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	r.sendAsyncToURL(r.securityWebhookURL, DiscordWebhookPayload{
		Username:  "Kasyno Anticheat Watcher",
		AvatarURL: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-alert.png",
		Embeds:    []DiscordEmbed{embed},
	})
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func hashFingerprint(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}
