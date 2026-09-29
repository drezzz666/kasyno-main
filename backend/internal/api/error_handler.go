package api

import (
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
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

	// 1. Client IP determination
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

	// 4. Read JSON payload (up to 64KB)
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 64*1024))
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
	report.SourceFile = sanitizeMentions(report.SourceFile)

	// 7. Asynchronous dispatch to Discord webhook (with deduplication & global throttling)
	if h.reporter != nil {
		h.reporter.ReportFrontendError(&report, sess, ip)
	}

	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
