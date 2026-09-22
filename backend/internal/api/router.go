package api

import (
	"net/http"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/ws"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(cfg *config.Config, ledgerService *ledger.Service, oidcClient *auth.OIDCClient, wsHub *ws.Hub) *chi.Mux {
	r := chi.NewRouter()

	// Standard middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS configuration for frontend
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*", cfg.AppURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "Cookie"},
		ExposedHeaders:   []string{"Link", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	casinoHandler := NewCasinoHandler(ledgerService, wsHub)
	authHandler := NewAuthHandler(cfg, ledgerService, oidcClient)

	// Healthcheck
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "2fgt-casino-go"})
	}
	r.Get("/health", healthHandler)
	r.Head("/health", healthHandler)

	// Auth routes (public)
	r.Route("/api/auth", func(r chi.Router) {
		r.Get("/login", authHandler.Login)
		r.Get("/callback", authHandler.Callback)
		r.Get("/logout", authHandler.Logout)
		r.Post("/logout", authHandler.Logout)
		r.Get("/me", authHandler.Me)
		r.Post("/backchannel-logout", authHandler.BackchannelLogout)
		if cfg.DevAuthEnabled {
			r.Get("/dev-login", authHandler.DevLogin)
		}
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
		r.Use(auth.RequireAuth(ledgerService, cfg.SessionSecret))

		r.Route("/api/casino", func(r chi.Router) {
			r.Get("/", casinoHandler.GetState)
			r.Post("/", casinoHandler.PostAction)
			r.Get("/history", casinoHandler.GetHistory)
		})
	})

	return r
}
