package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/api"
	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/ws"
)

func main() {
	log.Println("==================================================")
	log.Println("     2fgt Casino Core Server (Golang Edition)     ")
	log.Println("==================================================")

	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Connect to PostgreSQL
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[Server] Database connection error: %v", err)
	}
	defer database.Close()

	// 2. Run Database Migrations
	if err := database.Migrate(ctx); err != nil {
		log.Fatalf("[Server] Database migration error: %v", err)
	}

	// 3. Initialize Domain Services
	ledgerService := ledger.NewService(database)
	oidcClient := auth.NewOIDCClient(cfg)
	wsHub := ws.NewHub()
	go wsHub.Run()

	// 4. Setup Router
	router := api.NewRouter(cfg, ledgerService, oidcClient, wsHub)

	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	server := &http.Server{
		Addr:         serverAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 5. Graceful Shutdown listener
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[Server] Casino HTTP & WebSocket server listening on http://0.0.0.0:%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Server] Listen error: %v", err)
		}
	}()

	<-shutdownChan
	log.Println("[Server] Shutting down server gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[Server] Server forced to shutdown: %v", err)
	}

	log.Println("[Server] Server exited cleanly.")
}
