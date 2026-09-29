package api

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/games/coinflip"
	"github.com/drezzz666/kasyno/backend/internal/games/crash"
	"github.com/drezzz666/kasyno/backend/internal/games/limbo"
	"github.com/drezzz666/kasyno/backend/internal/games/mines"
	"github.com/drezzz666/kasyno/backend/internal/games/plinko"
	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
	"github.com/drezzz666/kasyno/backend/internal/games/roulette"
	"github.com/drezzz666/kasyno/backend/internal/games/rps"
	"github.com/drezzz666/kasyno/backend/internal/games/slots"
)

// TestConcurrency_StressGameEngines tests parallel execution of game logic across 200 concurrent goroutines.
func TestConcurrency_StressGameEngines(t *testing.T) {
	const workers = 200
	const iterations = 50

	var wg sync.WaitGroup
	wg.Add(workers)

	for w := 0; w < workers; w++ {
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				// Coinflip
				if _, err := coinflip.PlayCoinflip(100, "heads"); err != nil {
					t.Errorf("worker %d: coinflip error: %v", workerID, err)
					return
				}
				// RPS
				if _, err := rps.PlayRPS(100, "rock"); err != nil {
					t.Errorf("worker %d: rps error: %v", workerID, err)
					return
				}
				// Limbo
				if _, err := limbo.PlayLimbo(100, 2.0); err != nil {
					t.Errorf("worker %d: limbo error: %v", workerID, err)
					return
				}
				// Roulette
				if _, err := roulette.PlayRoulette(100, "red"); err != nil {
					t.Errorf("worker %d: roulette error: %v", workerID, err)
					return
				}
				// Slots
				if _, err := slots.PlaySlots(100); err != nil {
					t.Errorf("worker %d: slots error: %v", workerID, err)
					return
				}
				// Plinko
				if _, err := plinko.PlayPlinko(100, 14, "medium"); err != nil {
					t.Errorf("worker %d: plinko error: %v", workerID, err)
					return
				}
				// Mines
				m := mines.InitialStart(5)
				if len(m.Mines) != 5 {
					t.Errorf("worker %d: mines count error", workerID)
					return
				}
				// Crash calculation
				mElapsed := crash.MultiplierAtElapsed(1.5, crash.FlightSpeed)
				if mElapsed <= 0 {
					t.Errorf("worker %d: crash multiplier invalid", workerID)
					return
				}
			}
		}(w)
	}

	wg.Wait()
}

// BenchmarkGameEngines_Concurrent benchmarks multi-core parallel throughput of game logic.
func BenchmarkGameEngines_Concurrent(b *testing.B) {
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = coinflip.PlayCoinflip(100, "heads")
			_, _ = rps.PlayRPS(100, "rock")
			_, _ = limbo.PlayLimbo(100, 2.0)
			_, _ = roulette.PlayRoulette(100, "red")
		}
	})
}

// BenchmarkProvablyFair_Concurrent benchmarks HMAC-SHA256 outcome generation under parallel load.
func BenchmarkProvablyFair_Concurrent(b *testing.B) {
	serverSeed := "test-server-seed-abcdef123456"
	clientSeed := "client-seed-xyz"

	b.RunParallel(func(pb *testing.PB) {
		nonce := int64(0)
		for pb.Next() {
			nonce++
			_ = provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)
		}
	})
}

// BenchmarkHTTP_Layer7AuthVerify benchmarks HTTP Layer 7 parsing, cookie verification and JSON response generation.
func BenchmarkHTTP_Layer7AuthVerify(b *testing.B) {
	cfg := &config.Config{
		SessionSecret: "test-secret-32-chars-long-at-least-123456",
	}
	handler := NewAuthHandler(cfg, nil, nil)
	user := auth.SessionUser{
		UserID: "user_load_test",
		Email:  "load@example.com",
		Nick:   "LoadTester",
	}
	token, _ := auth.SignSession(user, cfg.SessionSecret)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest("GET", "/api/auth/verify", nil)
			req.AddCookie(&http.Cookie{
				Name:  auth.CookieName,
				Value: token,
			})
			rec := httptest.NewRecorder()
			handler.Verify(rec, req)
			if rec.Code != http.StatusOK {
				b.Fatalf("expected 200, got %d", rec.Code)
			}
		}
	})
}
