package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("Użycie: go run cmd/grant/main.go <user_id_lub_nick_lub_email> <kwota> [powód]")
		fmt.Println("Przykład: go run cmd/grant/main.go Janek 500 'Nagroda turniejowa'")
		os.Exit(1)
	}

	identifier := os.Args[1]
	amountStr := os.Args[2]
	reason := "Doładowanie od administratora"
	if len(os.Args) >= 4 {
		reason = os.Args[3]
	}

	amount, err := strconv.ParseInt(amountStr, 10, 64)
	if err != nil || amount == 0 {
		fmt.Printf("Błąd: Nieprawidłowa kwota '%s' (musi być liczbą różną od 0).\n", amountStr)
		os.Exit(1)
	}

	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Printf("Błąd połączenia z bazą danych: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	ledgerService := ledger.NewService(database)

	sign := ""
	if amount > 0 {
		sign = "+"
	}

	if identifier == "*" || identifier == "all" || identifier == "wszyscy" {
		count, total, err := ledgerService.GrantBalanceAll(ctx, amount, reason)
		if err != nil {
			fmt.Printf("Błąd: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("==================================================")
		fmt.Println("✓ Pomyślnie zrealizowano GLOBALNE przyznanie środków (*):")
		fmt.Printf("  Powód:                  %s\n", reason)
		fmt.Printf("  Kwota na gracza:        %s%d $FGT\n", sign, amount)
		fmt.Printf("  Zaktualizowano kont:    %d graczy\n", count)
		fmt.Printf("  Łączny transfer:        %s%d $FGT\n", sign, total)
		fmt.Println("==================================================")
		return
	}

	nick, prevBal, newBal, err := ledgerService.GrantBalance(ctx, identifier, amount, reason)
	if err != nil {
		fmt.Printf("Błąd: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("==================================================")
	fmt.Printf("✓ Pomyślnie zrealizowano przyznanie środków dla gracza \"%s\":\n", nick)
	fmt.Printf("  Powód:            %s\n", reason)
	fmt.Printf("  Kwota:            %s%d $FGT\n", sign, amount)
	fmt.Printf("  Poprzednie saldo: %d $FGT\n", prevBal)
	fmt.Printf("  Nowe saldo:       %d $FGT\n", newBal)
	fmt.Println("==================================================")
}
