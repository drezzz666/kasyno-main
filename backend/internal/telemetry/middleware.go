package telemetry

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// responseWriterInterceptor wraps http.ResponseWriter to capture status code.
type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriterInterceptor) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// HTTPMiddleware measures HTTP request durations and status codes, pushing telemetry into the Collector.
func HTTPMiddleware(c *Collector) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wrappedWriter := &responseWriterInterceptor{
				ResponseWriter: w,
				statusCode:     http.StatusOK, // Default status code if WriteHeader is not called explicitly
			}

			next.ServeHTTP(wrappedWriter, r)

			duration := time.Since(start)
			normalizedRoute := normalizePath(r.URL.Path)

			c.RecordHTTPRequest(r.Method, normalizedRoute, wrappedWriter.statusCode, duration)
		})
	}
}

// PrometheusHandler exposes standard Prometheus text format metrics at /metrics.
func PrometheusHandler(c *Collector) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		output := c.ExportPrometheus()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(output))
	}
}

// JSONHandler exposes structured JSON telemetry snapshot at /api/telemetry.
func JSONHandler(c *Collector) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshot := c.GetSnapshot()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(snapshot)
	}
}

// normalizePath maps parameterized or high-cardinality paths to grouped canonical routes.
func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" || path == "/" {
		return "/"
	}

	// Collapse trailing slash
	if len(path) > 1 && strings.HasSuffix(path, "/") {
		path = strings.TrimSuffix(path, "/")
	}

	switch {
	case path == "/health":
		return "/health"
	case path == "/metrics":
		return "/metrics"
	case strings.HasPrefix(path, "/api/telemetry"):
		return "/api/telemetry"
	case strings.HasPrefix(path, "/api/report-error"):
		return "/api/report-error"
	case strings.HasPrefix(path, "/api/auth/callback"):
		return "/api/auth/callback"
	case strings.HasPrefix(path, "/api/auth/login"):
		return "/api/auth/login"
	case strings.HasPrefix(path, "/api/auth/logout"):
		return "/api/auth/logout"
	case strings.HasPrefix(path, "/api/auth/me"):
		return "/api/auth/me"
	case strings.HasPrefix(path, "/api/auth/verify"):
		return "/api/auth/verify"
	case strings.HasPrefix(path, "/api/auth/dev-login"):
		return "/api/auth/dev-login"
	case strings.HasPrefix(path, "/api/auth"):
		return "/api/auth"
	case path == "/api/casino/challenge":
		return "/api/casino/challenge"
	case path == "/api/casino/history":
		return "/api/casino/history"
	case path == "/api/casino/provably-fair":
		return "/api/casino/provably-fair"
	case path == "/api/casino/provably-fair/rotate":
		return "/api/casino/provably-fair/rotate"
	case path == "/api/casino":
		return "/api/casino"
	case path == "/ws":
		return "/ws"
	default:
		return path
	}
}
