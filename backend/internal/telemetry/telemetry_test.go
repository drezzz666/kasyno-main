package telemetry

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTelemetryCollector_Basic(t *testing.T) {
	c := NewCollector()

	// 1. Record HTTP requests
	c.RecordHTTPRequest("GET", "/health", 200, 5*time.Millisecond)
	c.RecordHTTPRequest("POST", "/api/casino", 200, 15*time.Millisecond)
	c.RecordHTTPRequest("POST", "/api/casino", 400, 2*time.Millisecond)

	// 2. Record Games
	c.RecordGameRound("roulette", "play", 100, 200, "win", 2.0, 10*time.Millisecond)
	c.RecordGameRound("roulette", "play", 100, 0, "loss", 0.0, 8*time.Millisecond)
	c.RecordGameRound("crash", "cashout", 50, 150, "win", 3.0, 12*time.Millisecond)

	// 3. Record Security & Anticheat
	c.RecordChallengeEvent("generated")
	c.RecordChallengeEvent("solved")
	c.RecordChallengeEvent("failed")
	c.RecordSecurityAlert("BOT_DETECTION")
	c.RecordRateLimitHit()

	// 4. Record Errors
	c.RecordFrontendError("UNHANDLED_EXCEPTION")
	c.RecordBackendError("DB_TIMEOUT")
	c.RecordPanic()

	// 5. Test Snapshot
	snap := c.GetSnapshot()

	if snap.TotalRequests != 3 {
		t.Fatalf("expected 3 total requests, got %d", snap.TotalRequests)
	}

	if len(snap.Games) != 2 {
		t.Fatalf("expected 2 games tracked, got %d", len(snap.Games))
	}

	rStat, ok := snap.Games["roulette"]
	if !ok {
		t.Fatalf("expected roulette stats to exist")
	}
	if rStat.RoundsCount != 2 {
		t.Fatalf("expected 2 rounds of roulette, got %d", rStat.RoundsCount)
	}
	if rStat.TotalBet != 200 || rStat.TotalPayout != 200 {
		t.Fatalf("expected bet=200 payout=200, got bet=%d payout=%d", rStat.TotalBet, rStat.TotalPayout)
	}
	if rStat.RTPPercent != 100.0 {
		t.Fatalf("expected RTP=100.0%%, got %.2f%%", rStat.RTPPercent)
	}

	if snap.OverallCasino.TotalWagered != 250 || snap.OverallCasino.TotalPaidOut != 350 {
		t.Fatalf("expected total wagered=250 payout=350, got wagered=%d paid=%d",
			snap.OverallCasino.TotalWagered, snap.OverallCasino.TotalPaidOut)
	}

	// 6. Test Prometheus Output
	promText := c.ExportPrometheus()
	if !strings.Contains(promText, "casino_game_rounds_total{game=\"roulette\"} 2") {
		t.Fatalf("prometheus text missing roulette rounds: \n%s", promText)
	}
	if !strings.Contains(promText, "casino_anticheat_challenges_total{status=\"solved\"} 1") {
		t.Fatalf("prometheus text missing challenge solved: \n%s", promText)
	}
}

func TestTelemetryMiddleware(t *testing.T) {
	c := NewCollector()

	handler := HTTPMiddleware(c)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/test-error" {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))

	rec := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	rec2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/test-error", nil)
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", rec2.Code)
	}

	snap := c.GetSnapshot()
	if snap.TotalRequests != 2 {
		t.Fatalf("expected 2 total requests in telemetry, got %d", snap.TotalRequests)
	}
}

func TestTelemetryHandlers(t *testing.T) {
	c := NewCollector()
	c.RecordGameRound("mines", "play", 20, 40, "win", 2.0, 5*time.Millisecond)

	// Test Prometheus endpoint handler
	promHandler := PrometheusHandler(c)
	rec := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/metrics", nil)
	promHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on /metrics, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "casino_game_rounds_total{game=\"mines\"} 1") {
		t.Fatalf("expected mines in prometheus output, got: %s", rec.Body.String())
	}

	// Test JSON endpoint handler
	jsonHandler := JSONHandler(c)
	recJSON := httptest.NewRecorder()
	reqJSON, _ := http.NewRequest("GET", "/api/telemetry", nil)
	jsonHandler.ServeHTTP(recJSON, reqJSON)

	if recJSON.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on /api/telemetry, got %d", recJSON.Code)
	}

	var snap TelemetrySnapshot
	if err := json.Unmarshal(recJSON.Body.Bytes(), &snap); err != nil {
		t.Fatalf("failed to decode json snapshot: %v", err)
	}

	if snap.OverallCasino.TotalWagered != 20 {
		t.Fatalf("expected total wagered=20, got %d", snap.OverallCasino.TotalWagered)
	}
}
