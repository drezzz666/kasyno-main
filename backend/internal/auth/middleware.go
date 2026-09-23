package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/drezzz666/kasyno/backend/internal/ledger"
)


type contextKey string

const (
	PlayerContextKey  contextKey = "casino_player"
	SessionContextKey contextKey = "casino_session"
)

func RequireAuth(service *ledger.Service, sessionSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := GetSessionToken(r)
			if token == "" {
				http.Error(w, `{"error":"Zaloguj się przez Authentik, aby zagrać."}`, http.StatusUnauthorized)
				return
			}

			sess, err := VerifySession(token, sessionSecret)
			if err != nil {
				http.Error(w, `{"error":"Zaloguj się przez Authentik, aby zagrać."}`, http.StatusUnauthorized)
				return
			}

			avatarStr := ""
			if sess.Avatar != nil {
				avatarStr = *sess.Avatar
			}
			player, err := service.GetOrCreatePlayer(r.Context(), sess.UserID, sess.Email, sess.Nick, avatarStr, 1000)
			if err != nil {
				http.Error(w, `{"error":"Błąd pobierania profilu gracza"}`, http.StatusInternalServerError)
				return
			}

			ctx := context.WithValue(r.Context(), SessionContextKey, sess)
			ctx = context.WithValue(ctx, PlayerContextKey, player)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func OptionalAuth(service *ledger.Service, sessionSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := GetSessionToken(r)
			if token != "" {
				sess, err := VerifySession(token, sessionSecret)
				if err == nil {
					avatarStr := ""
					if sess.Avatar != nil {
						avatarStr = *sess.Avatar
					}
					player, err := service.GetOrCreatePlayer(r.Context(), sess.UserID, sess.Email, sess.Nick, avatarStr, 1000)
					if err == nil {
						ctx := context.WithValue(r.Context(), SessionContextKey, sess)
						ctx = context.WithValue(ctx, PlayerContextKey, player)
						r = r.WithContext(ctx)
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func GetPlayerFromContext(ctx context.Context) *ledger.Player {
	if val := ctx.Value(PlayerContextKey); val != nil {
		if p, ok := val.(*ledger.Player); ok {
			return p
		}
	}
	return nil
}

func WithPlayer(ctx context.Context, p *ledger.Player) context.Context {
	return context.WithValue(ctx, PlayerContextKey, p)
}

func GetSessionFromContext(ctx context.Context) *SessionUser {
	if val := ctx.Value(SessionContextKey); val != nil {
		if s, ok := val.(*SessionUser); ok {
			return s
		}
	}
	return nil
}

func WithSession(ctx context.Context, s *SessionUser) context.Context {
	return context.WithValue(ctx, SessionContextKey, s)
}

// RequireSafeOrigin validates Sec-Fetch-Site and Origin headers on state-changing requests (CSRF protection)
func RequireSafeOrigin(appURL string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodDelete {
				secFetchSite := r.Header.Get("Sec-Fetch-Site")
				if secFetchSite == "cross-site" {
					http.Error(w, `{"error":"SECURITY_VIOLATION: Niedozwolone żądanie cross-origin"}`, http.StatusForbidden)
					return
				}

				origin := r.Header.Get("Origin")
				if origin != "" && appURL != "" && appURL != "*" {
					if origin != appURL && !strings.HasPrefix(origin, "http://localhost") && !strings.HasPrefix(origin, "http://127.0.0.1") {
						http.Error(w, `{"error":"SECURITY_VIOLATION: Nieprawidłowe źródło żądania (Origin)"}`, http.StatusForbidden)
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

