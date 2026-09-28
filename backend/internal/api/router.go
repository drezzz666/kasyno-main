package api

import (
	"encoding/json"
	"log"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/anticheat"
	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/reporter"
	"github.com/drezzz666/kasyno/backend/internal/telemetry"
	"github.com/drezzz666/kasyno/backend/internal/ws"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(cfg *config.Config, ledgerService *ledger.Service, oidcClient *auth.OIDCClient, wsHub *ws.Hub) *chi.Mux {
	r := chi.NewRouter()

	// Initialize Telemetry Collector
	tel := telemetry.NewCollector()

	// Initialize Discord Error & Security Reporter
	rep := reporter.NewReporter(cfg.DiscordErrorWebhookURL, cfg.DiscordSecurityWebhookURL)
	anticheat.SetSecurityAlertHandler(func(category, ip, userID, nick, action, details string) {
		tel.RecordSecurityAlert(category)
		if rep != nil {
			rep.ReportSecurityAlert(category, ip, userID, nick, action, details)
		}
	})

	// WebSocket telemetry hooks
	ws.SetWSTelemetryCallbacks(tel.RecordWSConnect, tel.RecordWSDisconnect, tel.RecordWSEvent)

	// Standard middlewares
	r.Use(middleware.RequestID)
	r.Use(RealIPMiddleware)
	r.Use(telemetry.HTTPMiddleware(tel))
	r.Use(middleware.Logger)

	// Custom Panic Recoverer with Discord Webhook and Telemetry reporting
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			defer func() {
				if rvr := recover(); rvr != nil {
					if rvr == http.ErrAbortHandler {
						panic(rvr)
					}
					tel.RecordPanic()
					stack := string(debug.Stack())
					log.Printf("[PANIC RECOVER] %v\n%s", rvr, stack)
					sess := auth.GetSessionFromContext(req.Context())
					if rep != nil {
						rep.ReportPanic(req, sess, rvr, stack)
					}
					http.Error(w, `{"error":"Wystąpił nieoczekiwany błąd serwera."}`, http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, req)
		})
	})

	r.Use(middleware.Timeout(30 * time.Second))

	// CORS configuration for frontend
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*", cfg.AppURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "Cookie", "X-Browser-Proof"},
		ExposedHeaders:   []string{"Link", "Set-Cookie", "X-Captcha-ID", "X-Captcha-Signature", "X-Captcha-Issued-At", "X-Captcha-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	telCrypto, _ := telemetry.NewCryptoManager(cfg.SessionSecret)
	casinoHandler := NewCasinoHandler(ledgerService, wsHub, rep, cfg.SessionSecret, tel)
	wsHub.SetMessageHandler(casinoHandler.HandleWSMessage)
	wsHub.SetOnUserDisconnect(casinoHandler.HandleUserDisconnect)
	authHandler := NewAuthHandler(cfg, ledgerService, oidcClient)
	errorHandler := NewErrorHandler(rep, telCrypto, tel)

	// Healthcheck & Metrics Telemetry
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "2fgt-casino-go"})
	}
	r.Get("/health", healthHandler)
	r.Head("/health", healthHandler)

	// Prometheus, JSON Telemetry and Encryption Key Endpoints
	r.Get("/metrics", telemetry.PrometheusHandler(tel))
	r.Get("/api/telemetry", telemetry.JSONHandler(tel))
	r.Get("/api/telemetry/key", errorHandler.GetPublicKey)

	// Client Error Reporting endpoint
	r.With(auth.OptionalAuth(ledgerService, cfg.SessionSecret)).Post("/api/report-error", errorHandler.ReportClientError)

	// Internal Event Dispatcher (for Discord Bot or external trigger)
	r.Post("/api/internal/events", func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		expected := "Bearer " + cfg.SessionSecret
		if cfg.SessionSecret == "" || authHeader != expected {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req struct {
			Event      string  `json:"event"`
			Action     string  `json:"action"`
			Duration   int     `json:"duration"`
			Multiplier float64 `json:"multiplier"`
			StartedBy  string  `json:"started_by"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
			return
		}

		mult := req.Multiplier
		if mult <= 1.0 {
			mult = 1.25 // Default +25% bonus (1.25x) during Money Rain
		}

		evType := ws.EventMoneyRain
		if req.Action == "stop" {
			evType = ws.EventStopMoneyRain
			ledgerService.ClearActiveEvent()
		} else {
			dur := time.Duration(req.Duration) * time.Second
			if req.Duration <= 0 {
				dur = 60 * time.Second
			}
			now := time.Now()
			endsAt := now.Add(dur)
			ev := &ledger.LiveEventInfo{
				Name:       req.Event,
				Multiplier: mult,
				StartedAt:  now,
				EndsAt:     endsAt,
				StartedBy:  req.StartedBy,
			}
			ledgerService.SetActiveEvent(ev)
			time.AfterFunc(dur, func() {
				cur := ledgerService.GetActiveEvent()
				if cur != nil && cur.EndsAt.Equal(endsAt) {
					ledgerService.ClearActiveEvent()
					if wsHub != nil {
						wsHub.Broadcast(ws.Event{
							Type: ws.EventStopMoneyRain,
							Payload: map[string]interface{}{
								"event":  req.Event,
								"action": "stop",
							},
						})
					}
				}
			})
		}

		wsHub.Broadcast(ws.Event{
			Type: evType,
			Payload: map[string]interface{}{
				"event":      req.Event,
				"action":     req.Action,
				"duration":   req.Duration,
				"multiplier": mult,
				"started_by": req.StartedBy,
			},
		})

		JSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "event": req.Event, "action": req.Action, "multiplier": mult})
	})

	// Auth routes (public)
	r.Route("/api/auth", func(r chi.Router) {
		r.Get("/login", authHandler.Login)
		r.Get("/callback", authHandler.Callback)
		r.Get("/logout", authHandler.Logout)
		r.Post("/logout", authHandler.Logout)
		r.Get("/me", authHandler.Me)
		r.Get("/verify", authHandler.Verify)
		r.Head("/verify", authHandler.Verify)
		r.Post("/backchannel-logout", authHandler.BackchannelLogout)
	})

	// WebSocket endpoint
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		userID := ""
		token := auth.GetSessionToken(r)
		if token != "" {
			if sess, err := auth.VerifySession(token, cfg.SessionSecret); err == nil {
				userID = sess.UserID
			}
		}
		ws.ServeWS(wsHub, w, r, userID)
	})

	// Authenticated Casino routes
	r.Group(func(r chi.Router) {
		r.Use(auth.RequireSafeOrigin(cfg.AppURL))
		r.Use(auth.RequireAuth(ledgerService, cfg.SessionSecret))

		r.Route("/api/casino", func(r chi.Router) {
			r.Get("/captcha", casinoHandler.GetCaptcha)
			r.Post("/captcha", casinoHandler.SolveCaptcha)
			r.Get("/", casinoHandler.GetState)
			r.Post("/", casinoHandler.PostAction)
			r.Get("/history", casinoHandler.GetHistory)
			r.Get("/provably-fair", casinoHandler.GetProvablyFairSeed)
			r.Post("/provably-fair/rotate", casinoHandler.RotateProvablyFairSeed)
		})
	})

	return r
}
