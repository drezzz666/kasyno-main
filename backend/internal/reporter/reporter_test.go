package reporter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
)

func TestReporter_ReportFrontendError(t *testing.T) {
	var receivedCount int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&receivedCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	rep := NewReporter(server.URL, "")

	report := &FrontendErrorReport{
		ErrorType:     "UNHANDLED_EXCEPTION",
		Message:       "TypeError: Cannot read property 'crash_point'",
		SourceFile:    "GameTableDialog.jsx:333",
		Context:       "Crash: start round",
		Game:          "crash",
		ActionPayload: map[string]interface{}{"bet": 100, "target_multiplier": 2.0},
		URL:           "https://kasyno.2fgt.pl/",
		UserAgent:     "Mozilla/5.0 Chrome/120.0",
		Screen:        "1920x1080",
		Timestamp:     time.Now().Format(time.RFC3339),
	}

	user := &auth.SessionUser{
		UserID: "usr_123",
		Nick:   "Tester",
		Email:  "tester@2fgt.pl",
	}

	rep.ReportFrontendError(report, user, "127.0.0.1")

	// Allow goroutine to execute
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected 1 webhook call, got %d", receivedCount)
	}

	// Immediate duplicate should be throttled
	rep.ReportFrontendError(report, user, "127.0.0.1")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected duplicate error to be throttled, got %d calls", receivedCount)
	}
}

func TestReporter_ReportPanic(t *testing.T) {
	var receivedCount int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&receivedCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	rep := NewReporter(server.URL, "")

	req, _ := http.NewRequestWithContext(context.Background(), "POST", "/api/casino", nil)
	req.RemoteAddr = "10.0.0.1"

	rep.ReportPanic(req, nil, "runtime error: invalid memory address", "goroutine 1 [running]:\nmain.main()")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected 1 panic webhook call, got %d", receivedCount)
	}
}

func TestReporter_ReportSecurityAlert(t *testing.T) {
	var receivedCount int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&receivedCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	rep := NewReporter("", server.URL)

	rep.ReportSecurityAlert("BOT_DETECTION", "192.168.1.100", "usr_999", "SpeedyBot", "POST /api/casino", "20 req/s (limit 4/s)")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected 1 security alert webhook call, got %d", receivedCount)
	}

	// Immediate duplicate should be throttled
	rep.ReportSecurityAlert("BOT_DETECTION", "192.168.1.100", "usr_999", "SpeedyBot", "POST /api/casino", "20 req/s (limit 4/s)")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected duplicate security alert to be throttled, got %d calls", receivedCount)
	}
}

func TestReporter_InsufficientFundsFiltered(t *testing.T) {
	var errorCount, securityCount int32
	errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&errorCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer errServer.Close()

	secServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&securityCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer secServer.Close()

	rep := NewReporter(errServer.URL, secServer.URL)

	report := &FrontendErrorReport{
		ErrorType:  "API_ERROR",
		Message:    "Niewystarczające saldo żetonów.",
		SourceFile: "api.js:124",
		Context:    "POST /api/casino (HTTP 400)",
	}

	rep.ReportFrontendError(report, nil, "127.0.0.1")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&errorCount) != 0 || atomic.LoadInt32(&securityCount) != 0 {
		t.Fatalf("expected 0 webhooks for insufficient funds, got error=%d sec=%d", errorCount, securityCount)
	}

	rep.ReportBackendError("INSUFFICIENT_FUNDS", "Niewystarczające saldo żetonów.", "", nil)
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&errorCount) != 0 || atomic.LoadInt32(&securityCount) != 0 {
		t.Fatalf("expected 0 backend webhooks for insufficient funds, got error=%d sec=%d", errorCount, securityCount)
	}
}

func TestReporter_RateLimitRoutedToSecurityWebhook(t *testing.T) {
	var errorCount, securityCount int32
	errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&errorCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer errServer.Close()

	secServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&securityCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer secServer.Close()

	rep := NewReporter(errServer.URL, secServer.URL)

	report := &FrontendErrorReport{
		ErrorType:  "RATE_LIMIT",
		Message:    "Zbyt wiele akcji naraz. Zwolnij tempo.",
		SourceFile: "api.js:124",
		Context:    "POST /api/casino (HTTP 429)",
		Game:       "mines",
	}

	user := &auth.SessionUser{
		UserID: "usr_spam1",
		Nick:   "Spammer",
	}

	rep.ReportFrontendError(report, user, "127.0.0.1")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&errorCount) != 0 {
		t.Fatalf("expected 0 error webhook calls for rate limit, got %d", errorCount)
	}
	if atomic.LoadInt32(&securityCount) != 1 {
		t.Fatalf("expected 1 security webhook call for rate limit, got %d", securityCount)
	}
}
