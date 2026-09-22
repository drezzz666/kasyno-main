package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

func printHelp() {
	fmt.Println("🎲 2FGT Casino CLI Tool - Zarządzanie Użytkownikami")
	fmt.Println("==================================================")
	fmt.Println("Dostępne polecenia:")
	fmt.Println()
	fmt.Println("  1. Tworzenie użytkownika:")
	fmt.Println("     casino user create <user_id> <nick> [email] [pocz_saldo]")
	fmt.Println("     casino user create <nick>   (automatyczne ID i email)")
	fmt.Println("     Przykład: casino user create kamil \"Kamil\" kamil@2fgt.pl 5000")
	fmt.Println()
	fmt.Println("  2. Zarządzanie środkami:")
	fmt.Println("     casino user <id_lub_nick> money add <kwota> [powód]")
	fmt.Println("     casino user <id_lub_nick> money remove <kwota> [powód]")
	fmt.Println("     casino user <id_lub_nick> money set <kwota> [powód]")
	fmt.Println("     Przykład: casino user Janek money add 1000 \"Bonus\"")
	fmt.Println("     Przykład: casino user Janek money set 25000")
	fmt.Println()
	fmt.Println("  3. Informacje o użytkowniku:")
	fmt.Println("     casino user <id_lub_nick> info")
	fmt.Println("     casino user info <id_lub_nick>")
	fmt.Println()
	fmt.Println("  4. Lista użytkowników:")
	fmt.Println("     casino user list [filtr_wyszukiwania]")
	fmt.Println("     casino users [filtr_wyszukiwania]")
	fmt.Println()
	fmt.Println("  5. Zmiana nicku:")
	fmt.Println("     casino user <id_lub_nick> set-nick <nowy_nick>")
	fmt.Println()
	fmt.Println("  6. Usuwanie użytkownika:")
	fmt.Println("     casino user <id_lub_nick> delete [--yes]")
	fmt.Println("==================================================")
}

func connectDB(ctx context.Context, cfg *config.Config) (*db.DB, error) {
	// First try default DATABASE_URL
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
	args := os.Args[1:]
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		printHelp()
		os.Exit(0)
	}

	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	database, err := connectDB(ctx, cfg)
	if err != nil {
		fmt.Printf("❌ Błąd połączenia z bazą danych: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	svc := ledger.NewService(database)

	// Route commands
	// Handle "users" / "user list"
	if args[0] == "users" || (args[0] == "user" && len(args) >= 2 && (args[1] == "list" || args[1] == "ls")) {
		search := ""
		if args[0] == "users" && len(args) >= 2 {
			search = args[1]
		} else if len(args) >= 3 {
			search = args[2]
		}
		handleList(ctx, svc, search)
		return
	}

	if args[0] == "user" {
		if len(args) < 2 {
			printHelp()
			os.Exit(1)
		}

		sub := args[1]

		// casino user create <id> <nick> [email] [initial_balance]
		// or casino user create <nick>
		if sub == "create" || sub == "add" && len(args) > 2 && args[2] != "money" {
			handleCreate(ctx, svc, args[2:])
			return
		}

		// casino user info <identifier>
		if sub == "info" && len(args) >= 3 {
			handleInfo(ctx, svc, args[2])
			return
		}

		// Pattern: casino user <identifier> <action> ...
		identifier := args[1]
		if len(args) < 3 {
			// default to info if only identifier is provided: e.g. "casino user Janek"
			handleInfo(ctx, svc, identifier)
			return
		}

		action := args[2]
		switch action {
		case "info":
			handleInfo(ctx, svc, identifier)

		case "money":
			if len(args) < 4 {
				fmt.Println("❌ Błąd: Podaj akcję dla money (add, remove/sub, set).")
				fmt.Println("   Przykład: casino user Janek money add 500")
				os.Exit(1)
			}
			moneyAction := args[3]
			moneyArgs := args[4:]
			handleMoney(ctx, svc, identifier, moneyAction, moneyArgs)

		case "set-nick", "nick":
			if len(args) < 4 {
				fmt.Println("❌ Błąd: Podaj nowy nick.")
				fmt.Println("   Przykład: casino user Janek set-nick NowyJanek")
				os.Exit(1)
			}
			handleSetNick(ctx, svc, identifier, args[3])

		case "delete", "rm":
			force := len(args) >= 4 && (args[3] == "--yes" || args[3] == "-y" || args[3] == "--force")
			handleDelete(ctx, svc, identifier, force)

		default:
			fmt.Printf("❌ Nieznana akcja: '%s'. Wpisz 'casino help', aby zobaczyć pomoc.\n", action)
			os.Exit(1)
		}
		return
	}

	printHelp()
}

func handleCreate(ctx context.Context, svc *ledger.Service, args []string) {
	if len(args) == 0 {
		fmt.Println("❌ Użycie: casino user create <user_id> <nick> [email] [saldo_początkowe]")
		fmt.Println("   Lub:    casino user create <nick>")
		os.Exit(1)
	}

	var userID, nick, email string
	var initialBal int64 = 1000

	if len(args) == 1 {
		nick = args[0]
		userID = "user_" + strings.ToLower(strings.ReplaceAll(nick, " ", "_"))
		email = strings.ToLower(nick) + "@casino.local"
	} else if len(args) == 2 {
		userID = args[0]
		nick = args[1]
		email = strings.ToLower(nick) + "@casino.local"
	} else if len(args) >= 3 {
		userID = args[0]
		nick = args[1]
		email = args[2]
		if len(args) >= 4 {
			b, err := strconv.ParseInt(args[3], 10, 64)
			if err == nil && b >= 0 {
				initialBal = b
			}
		}
	}

	player, err := svc.AdminCreateUser(ctx, userID, nick, email, initialBal)
	if err != nil {
		fmt.Printf("❌ Błąd tworzenia użytkownika: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("==================================================")
	fmt.Printf("✅ Utworzono nowego gracza:\n")
	fmt.Printf("   ID:        %s\n", player.UserID)
	fmt.Printf("   Nick:      %s\n", player.Nick)
	fmt.Printf("   Email:     %s\n", player.Email)
	fmt.Printf("   Saldo:     %d $FGT\n", player.Balance)
	fmt.Printf("   Poziom:    %d (XP: %d)\n", player.Level, player.XP)
	fmt.Println("==================================================")
}

func handleMoney(ctx context.Context, svc *ledger.Service, identifier, action string, args []string) {
	if len(args) == 0 {
		fmt.Printf("❌ Błąd: Podaj kwotę dla operacji '%s'.\n", action)
		os.Exit(1)
	}

	amount, err := strconv.ParseInt(args[0], 10, 64)
	if err != nil {
		fmt.Printf("❌ Błąd: Nieprawidłowa liczba '%s'.\n", args[0])
		os.Exit(1)
	}

	reason := ""
	if len(args) >= 2 {
		reason = strings.Join(args[1:], " ")
	}

	isAll := identifier == "*" || identifier == "all" || identifier == "wszyscy"

	switch action {
	case "add", "grant", "give":
		if amount <= 0 {
			fmt.Println("❌ Błąd: Kwota dodawana musi być większa od 0.")
			os.Exit(1)
		}
		if reason == "" {
			reason = "Doładowanie administratora (CLI)"
		}

		if isAll {
			count, total, err := svc.GrantBalanceAll(ctx, amount, reason)
			if err != nil {
				fmt.Printf("❌ Błąd: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("==================================================")
			fmt.Println("✅ [GLOBAL] Dodano środki dla WSZYSTKICH graczy (*):")
			fmt.Printf("   Kwota na gracza:        +%d $FGT\n", amount)
			fmt.Printf("   Powód:                  %s\n", reason)
			fmt.Printf("   Zaktualizowano kont:    %d graczy\n", count)
			fmt.Printf("   Łączny transfer:        +%d $FGT\n", total)
			fmt.Println("==================================================")
			return
		}

		nick, prevBal, newBal, err := svc.GrantBalance(ctx, identifier, amount, reason)
		if err != nil {
			fmt.Printf("❌ Błąd: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("==================================================")
		fmt.Printf("✅ Dodano środki dla gracza \"%s\":\n", nick)
		fmt.Printf("   Kwota:            +%d $FGT\n", amount)
		fmt.Printf("   Powód:            %s\n", reason)
		fmt.Printf("   Poprzednie saldo: %d $FGT\n", prevBal)
		fmt.Printf("   Nowe saldo:       %d $FGT\n", newBal)
		fmt.Println("==================================================")

	case "remove", "sub", "take":
		if amount <= 0 {
			fmt.Println("❌ Błąd: Kwota odejmowana musi być większa od 0.")
			os.Exit(1)
		}
		if reason == "" {
			reason = "Korekta salda (CLI)"
		}

		if isAll {
			count, total, err := svc.GrantBalanceAll(ctx, -amount, reason)
			if err != nil {
				fmt.Printf("❌ Błąd: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("==================================================")
			fmt.Println("✅ [GLOBAL] Odjęto środki od WSZYSTKICH graczy (*):")
			fmt.Printf("   Kwota na gracza:        -%d $FGT\n", amount)
			fmt.Printf("   Powód:                  %s\n", reason)
			fmt.Printf("   Zaktualizowano kont:    %d graczy\n", count)
			fmt.Printf("   Łączny transfer:        %d $FGT\n", total)
			fmt.Println("==================================================")
			return
		}

		nick, prevBal, newBal, err := svc.GrantBalance(ctx, identifier, -amount, reason)
		if err != nil {
			fmt.Printf("❌ Błąd: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("==================================================")
		fmt.Printf("✅ Odjęto środki graczowi \"%s\":\n", nick)
		fmt.Printf("   Kwota:            -%d $FGT\n", amount)
		fmt.Printf("   Powód:            %s\n", reason)
		fmt.Printf("   Poprzednie saldo: %d $FGT\n", prevBal)
		fmt.Printf("   Nowe saldo:       %d $FGT\n", newBal)
		fmt.Println("==================================================")

	case "set":
		if amount < 0 {
			fmt.Println("❌ Błąd: Saldo nie może być ujemne.")
			os.Exit(1)
		}
		if reason == "" {
			reason = "Ręczne ustawienie salda (CLI)"
		}

		if isAll {
			count, err := svc.AdminSetBalanceAll(ctx, amount, reason)
			if err != nil {
				fmt.Printf("❌ Błąd: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("==================================================")
			fmt.Println("✅ [GLOBAL] Ustawiono saldo dla WSZYSTKICH graczy (*):")
			fmt.Printf("   Nowe saldo:             %d $FGT\n", amount)
			fmt.Printf("   Powód:                  %s\n", reason)
			fmt.Printf("   Zaktualizowano kont:    %d graczy\n", count)
			fmt.Println("==================================================")
			return
		}

		nick, prevBal, newBal, err := svc.AdminSetBalance(ctx, identifier, amount, reason)
		if err != nil {
			fmt.Printf("❌ Błąd: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("==================================================")
		fmt.Printf("✅ Ustawiono saldo gracza \"%s\":\n", nick)
		fmt.Printf("   Powód:            %s\n", reason)
		fmt.Printf("   Poprzednie saldo: %d $FGT\n", prevBal)
		fmt.Printf("   Nowe saldo:       %d $FGT\n", newBal)
		fmt.Println("==================================================")

	default:
		fmt.Printf("❌ Nieznana operacja dla money: '%s' (dozwolone: add, remove, set).\n", action)
		os.Exit(1)
	}
}

func handleInfo(ctx context.Context, svc *ledger.Service, identifier string) {
	player, stats, activeRound, err := svc.AdminGetUser(ctx, identifier)
	if err != nil {
		fmt.Printf("❌ Błąd: %v\n", err)
		os.Exit(1)
	}

	createdTime := time.UnixMilli(player.CreatedAt).Format("2006-01-02 15:04:05")
	updatedTime := time.UnixMilli(player.UpdatedAt).Format("2006-01-02 15:04:05")

	fmt.Println("==================================================")
	fmt.Printf("👤 Profil Gracza: %s\n", player.Nick)
	fmt.Println("==================================================")
	fmt.Printf("  User ID:        %s\n", player.UserID)
	fmt.Printf("  Email:          %s\n", player.Email)
	fmt.Printf("  Saldo:          %d $FGT\n", player.Balance)
	fmt.Printf("  Poziom / XP:    Lvl %d (%d XP)\n", player.Level, player.XP)
	fmt.Printf("  Streak logowań: %d dni\n", player.Streak)
	fmt.Printf("  Data rejestr.:  %s\n", createdTime)
	fmt.Printf("  Ost. aktywność: %s\n", updatedTime)

	if stats != nil {
		fmt.Println("--------------------------------------------------")
		fmt.Printf("  Statystyki gier:\n")
		fmt.Printf("    Liczba rozegranych rund: %d\n", stats.TotalRounds)
		fmt.Printf("    Suma postawionych stawek:%d $FGT\n", stats.TotalWagered)
		fmt.Printf("    Największa wygrana:      %d $FGT\n", stats.BiggestWin)
		fmt.Printf("    Maksymalny mnożnik:      ×%.2f\n", stats.MaxMultiplier)
		fmt.Printf("    Ulubiona gra:            %s\n", stats.FavoriteGame)
	}

	if activeRound != nil {
		fmt.Println("--------------------------------------------------")
		fmt.Printf("  Aktywna runda w toku:\n")
		fmt.Printf("    ID:   %s\n", activeRound.ID)
		fmt.Printf("    Gra:  %s | Stawka: %d $FGT\n", activeRound.Game, activeRound.Bet)
	}
	fmt.Println("==================================================")
}

func handleList(ctx context.Context, svc *ledger.Service, search string) {
	players, total, err := svc.AdminListUsers(ctx, search, 100, 0)
	if err != nil {
		fmt.Printf("❌ Błąd pobierania listy: %v\n", err)
		os.Exit(1)
	}

	if len(players) == 0 {
		if search != "" {
			fmt.Printf("Brak graczy pasujących do wyszukiwania \"%s\".\n", search)
		} else {
			fmt.Println("Baza graczy jest pusta.")
		}
		return
	}

	fmt.Printf("Znaleziono %d graczy (wyświetlam %d):\n\n", total, len(players))

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "NICK\tUSER ID\tEMAIL\tSALDO ($FGT)\tLVL\tSTREAK\tDATA UTW.")
	fmt.Fprintln(w, "----\t-------\t-----\t-----------\t---\t------\t---------")

	for _, p := range players {
		created := time.UnixMilli(p.CreatedAt).Format("2006-01-02 15:04")
		fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\t%d\t%s\n",
			p.Nick,
			p.UserID,
			p.Email,
			p.Balance,
			p.Level,
			p.Streak,
			created,
		)
	}
	w.Flush()
	fmt.Println()
}

func handleSetNick(ctx context.Context, svc *ledger.Service, identifier, newNick string) {
	oldNick, updatedNick, err := svc.AdminSetNick(ctx, identifier, newNick)
	if err != nil {
		fmt.Printf("❌ Błąd: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ Pomyślnie zmieniono nick z \"%s\" na \"%s\".\n", oldNick, updatedNick)
}

func handleDelete(ctx context.Context, svc *ledger.Service, identifier string, force bool) {
	if !force {
		fmt.Printf("⚠️ Czy na pewno chcesz całkowicie usunąć gracza '%s' i całą jego historię gier? (wpisz 'tak' aby potwierdzić): ", identifier)
		var response string
		fmt.Scanln(&response)
		if strings.ToLower(strings.TrimSpace(response)) != "tak" && strings.ToLower(strings.TrimSpace(response)) != "yes" {
			fmt.Println("Anulowano usuwanie.")
			return
		}
	}

	nick, err := svc.AdminDeleteUser(ctx, identifier)
	if err != nil {
		fmt.Printf("❌ Błąd: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ Pomyślnie usunięto gracza \"%s\" i powiązane rekordy.\n", nick)
}

