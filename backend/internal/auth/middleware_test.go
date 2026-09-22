package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireSafeOrigin(t *testing.T) {
	appURL := "https://casino.2fgt.pl"
	mw := RequireSafeOrigin(appURL)

	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	h := mw(dummyHandler)

	// 1. GET requests should pass regardless of origin/cross-site
	req := httptest.NewRequest(http.MethodGet, "/api/casino", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected GET to pass, got %d", rec.Code)
	}

	// 2. Cross-site POST should be blocked
	req = httptest.NewRequest(http.MethodPost, "/api/casino", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected cross-site POST to be blocked, got %d", rec.Code)
	}

	// 3. Same-origin POST should pass
	req = httptest.NewRequest(http.MethodPost, "/api/casino", nil)
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("Origin", "https://casino.2fgt.pl")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected same-origin POST to pass, got %d", rec.Code)
	}

	// 4. Localhost POST should pass in dev
	req = httptest.NewRequest(http.MethodPost, "/api/casino", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected localhost POST to pass, got %d", rec.Code)
	}

	// 5. Hostile origin POST should be blocked
	req = httptest.NewRequest(http.MethodPost, "/api/casino", nil)
	req.Header.Set("Origin", "https://evil-attacker.com")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected hostile origin POST to be blocked, got %d", rec.Code)
	}
}
