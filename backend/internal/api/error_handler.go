package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/discordbot"
	"github.com/drezzz666/kasyno/backend/internal/reporter"
	"github.com/drezzz666/kasyno/backend/internal/telemetry"
)

var (
	discordMentionRegex = regexp.MustCompile(`@(everyone|here|<@&?\d+>)`)
)

type clientLimitEntry struct {
	count     int
	resetTime time.Time
}

type ErrorHandler struct {
	reporter   *reporter.Reporter
	telemetry  *telemetry.Collector
	mu         sync.Mutex
	rateLimits map[string]*clientLimitEntry
}

func NewErrorHandler(rep *reporter.Reporter, tel ...*telemetry.Collector) *ErrorHandler {
	var collector *telemetry.Collector
	if len(tel) > 0 {
		collector = tel[0]
	}
	h := &ErrorHandler{
		reporter:   rep,
		telemetry:  collector,
		rateLimits: make(map[string]*clientLimitEntry),
	}
	// Periodic cleanup of rate limiter map
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			h.cleanupLimits()
		}
	}()
	return h
}

func (h *ErrorHandler) cleanupLimits() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	for k, v := range h.rateLimits {
		if now.After(v.resetTime) {
			delete(h.rateLimits, k)
		}
	}
}

// isRateLimited allows at most 5 error reports per 60 seconds per IP or User ID.
func (h *ErrorHandler) isRateLimited(key string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	entry, exists := h.rateLimits[key]
	if !exists || now.After(entry.resetTime) {
		h.rateLimits[key] = &clientLimitEntry{
			count:     1,
			resetTime: now.Add(60 * time.Second),
		}
		return false
	}

	if entry.count >= 5 {
		return true
	}

	entry.count++
	return false
}

// sanitizeMentions neutralizes any attempted Discord mass-mentions (@everyone, @here, roles) in error text.
func sanitizeMentions(s string) string {
	if s == "" {
		return ""
	}
	return discordMentionRegex.ReplaceAllString(s, "@\u200B$1")
}

func (h *ErrorHandler) ReportClientError(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// 1. Client IP determination (X-Remote-Ip, CF-Connecting-Ip, X-Forwarded-For, X-Real-IP)
	ip := GetClientIP(r)

	// 2. Extract Session User if logged in
	sess := auth.GetSessionFromContext(r.Context())

	// 3. Strict Rate Limiting: Check both IP and User ID
	ipKey := "ip:" + ip
	if h.isRateLimited(ipKey) {
		if h.telemetry != nil {
			h.telemetry.RecordRateLimitHit()
		}
		// Return 200 OK silently so spammers get no error hints / retry loops
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	if sess != nil {
		userKey := "user:" + sess.UserID
		if h.isRateLimited(userKey) {
			if h.telemetry != nil {
				h.telemetry.RecordRateLimitHit()
			}
			JSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
	}

	// 4. Strict Payload Size Limit: Max 32KB
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 32*1024))
	if err != nil || len(bodyBytes) == 0 {
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	var report reporter.FrontendErrorReport
	if err := json.Unmarshal(bodyBytes, &report); err != nil {
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// 5. Record error in telemetry
	if h.telemetry != nil {
		h.telemetry.RecordFrontendError(report.ErrorType)
	}

	// 6. Sanitize text fields against Discord mention injection
	report.Message = sanitizeMentions(report.Message)
	report.Stack = sanitizeMentions(report.Stack)
	report.Context = sanitizeMentions(report.Context)
	report.ComponentStack = sanitizeMentions(report.ComponentStack)
	report.SourceFile = sanitizeMentions(report.SourceFile)

	// 7. Asynchronous dispatch to Discord webhook (with deduplication & global throttling)
	if h.reporter != nil {
		h.reporter.ReportFrontendError(&report, sess, ip)
	}

	// 8. Synchronize player's telemetry channel on Discord in the "📊 telemetria" category
	if bot := discordbot.GetGlobalBot(); bot != nil && sess != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			lastAction := report.Context
			if report.Game != "" {
				lastAction = fmt.Sprintf("%s (%s)", report.Game, report.Context)
			}
			_ = bot.SyncUserTelemetry(ctx, &discordbot.UserTelemetryReport{
				UserID:             sess.UserID,
				Nick:               sess.Nick,
				Email:              sess.Email,
				IP:                 ip,
				UserAgent:          report.UserAgent,
				GPUInfo:            report.GPUInfo,
				CPUCores:           report.CPUCores,
				DeviceRAM:          report.DeviceRAM,
				ScreenDetails:      report.ScreenDetails,
				Orientation:        report.Orientation,
				TouchPoints:        report.TouchPoints,
				ColorScheme:        report.ColorScheme,
				Timezone:           report.Timezone,
				Language:           report.Language,
				Platform:           report.Platform,
				NetworkInfo:        report.NetworkInfo,
				MemoryMB:           report.MemoryMB,
				NavigationTiming:   report.NavigationTiming,
				LatencyMs:          report.LatencyMs,
				PageVisibility:     report.PageVisibility,
				Referrer:           report.Referrer,
				SessionDurationSec: report.SessionDurationSec,
				LastAction:         lastAction,
			})
		}()
	}

	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ReportClientTelemetry receives periodic or on-load hardware & client specs and updates Discord channel.
func (h *ErrorHandler) ReportClientTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	ip := GetClientIP(r)
	sess := auth.GetSessionFromContext(r.Context())

	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 32*1024))
	if err != nil || len(bodyBytes) == 0 {
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	var data discordbot.UserTelemetryReport
	if err := json.Unmarshal(bodyBytes, &data); err != nil {
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	if sess != nil {
		if data.UserID == "" {
			data.UserID = sess.UserID
		}
		if data.Nick == "" {
			data.Nick = sess.Nick
		}
		if data.Email == "" {
			data.Email = sess.Email
		}
	}
	if data.IP == "" {
		data.IP = ip
	}

	if bot := discordbot.GetGlobalBot(); bot != nil && (data.UserID != "" || data.Nick != "") {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := bot.SyncUserTelemetry(ctx, &data); err != nil {
				log.Printf("⚠️ [Discord Bot] Błąd SyncUserTelemetry dla gracza %s (%s): %v", data.Nick, data.UserID, err)
			}
		}()
	}

	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
