package auth

import (
	"context"
	"net/http"

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

			player, err := service.GetOrCreatePlayer(r.Context(), sess.UserID, sess.Email, sess.Nick, 1000)
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
					player, err := service.GetOrCreatePlayer(r.Context(), sess.UserID, sess.Email, sess.Nick, 1000)
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

func GetSessionFromContext(ctx context.Context) *SessionUser {
	if val := ctx.Value(SessionContextKey); val != nil {
		if s, ok := val.(*SessionUser); ok {
			return s
		}
	}
	return nil
}
