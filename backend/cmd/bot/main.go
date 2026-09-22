package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/discordbot"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

func connectDB(ctx context.Context, cfg *config.Config) (*db.DB, error) {
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err == nil {
		return database, nil
	}

	// Fallback for host execution if DATABASE_URL points to docker container host "postgres:5432"
	if strings.Contains(cfg.DatabaseURL, "@postgres:5432") || strings.Contains(cfg.DatabaseURL, "@postgres/") {
		hostURL := strings.Replace(cfg.DatabaseURL, "@postgres:5432", "@127.0.0.1:5434", 1)
		hostURL = strings.Replace(hostURL, "@postgres/", "@127.0.0.1:5434/", 1)
		dbHost, errHost := db.Connect(ctx, hostURL)
		if errHost == nil {
			return dbHost, nil
		}
	}

	return nil, err
}

func main() {
	log.Println("🚀 Uruchamianie bota Discord dla Kasyna 2FGT...")

	cfg := config.Load()
	if cfg.DiscordBotToken == "" {
		fmt.Println("❌ Błąd: Brak zmiennej środowiskowej DISCORD_BOT_TOKEN.")
		fmt.Println("   Ustaw DISCORD_BOT_TOKEN w pliku .env lub środowisku.")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	database, err := connectDB(ctx, cfg)
	if err != nil {
		log.Fatalf("❌ Błąd połączenia z bazą danych: %v", err)
	}
	defer database.Close()

	ledgerSvc := ledger.NewService(database)

	bot, err := discordbot.New(cfg, ledgerSvc)
	if err != nil {
		log.Fatalf("❌ Błąd inicjalizacji bota Discord: %v", err)
	}

	if err := bot.Start(); err != nil {
		log.Fatalf("❌ Błąd startu bota Discord: %v", err)
	}
	defer bot.Stop()

	log.Println("✅ Bot Discord dla Kasyna 2FGT działa i nasłuchuje komend (Wciśnij Ctrl+C aby zakończyć)")

	// Wait for termination signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM, os.Interrupt)
	<-stop

	log.Println("🛑 Zatrzymywanie bota...")
}
