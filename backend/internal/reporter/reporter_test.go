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

	rep := NewReporter(server.URL)

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

	rep := NewReporter(server.URL)

	req, _ := http.NewRequestWithContext(context.Background(), "POST", "/api/casino", nil)
	req.RemoteAddr = "10.0.0.1"

	rep.ReportPanic(req, nil, "runtime error: invalid memory address", "goroutine 1 [running]:\nmain.main()")
	time.Sleep(100 * time.Millisecond)

	if atomic.LoadInt32(&receivedCount) != 1 {
		t.Fatalf("expected 1 panic webhook call, got %d", receivedCount)
	}
}
