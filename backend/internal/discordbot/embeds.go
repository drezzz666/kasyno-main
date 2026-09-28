package discordbot

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/scheduler"
)

func (b *Bot) buildLeaderboardEmbed(ctx context.Context, category string) *discordgo.MessageEmbed {
	if category == "level" {
		leaders, err := b.ledger.GetLevelLeaderboard(ctx, 10)
		if err != nil || len(leaders) == 0 {
			return &discordgo.MessageEmbed{
				Color:       ColorGold,
				Title:       "⭐ Ranking Poziomów (Top 10)",
				Description: "Brak danych w tabeli liderów.",
			}
		}

		var sb strings.Builder
		for idx, l := range leaders {
			medals := []string{"🥇", "🥈", "🥉"}
			rankIcon := fmt.Sprintf("`#%d`", idx+1)
			if idx < len(medals) {
				rankIcon = medals[idx]
			}
			sb.WriteString(fmt.Sprintf("%s **%s** — LVL **%d** *(%d XP)* • %s\n",
				rankIcon, l.Nick, l.Level, l.XP, formatFGT(l.Balance)))
		}

		return &discordgo.MessageEmbed{
			Color:       ColorSky,
			Title:       "⭐ Tabela Liderów: Poziom i Doświadczenie (XP)",
			Description: sb.String(),
			Footer: &discordgo.MessageEmbedFooter{
				Text: "Top 10 graczy o najwyższym poziomie w Kasynie 2FGT",
			},
			Timestamp: time.Now().Format(time.RFC3339),
		}
	}

	// Balance leaderboard
	leaders, err := b.ledger.GetLeaderboard(ctx, 10)
	if err != nil || len(leaders) == 0 {
		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "🏆 Ranking Bogactwa (Top 10)",
			Description: "Brak danych w tabeli liderów.",
		}
	}

	var sb strings.Builder
	for idx, l := range leaders {
		medals := []string{"🥇", "🥈", "🥉"}
		rankIcon := fmt.Sprintf("`#%d`", idx+1)
		if idx < len(medals) {
			rankIcon = medals[idx]
		}
		sb.WriteString(fmt.Sprintf("%s **%s** — **%s** *(Poziom %d)*\n",
			rankIcon, l.Nick, formatFGT(l.Balance), l.Level))
	}

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       "🏆 Tabela Liderów: Najbogatsi Gracze ($FGT)",
		Description: sb.String(),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Top 10 graczy z największym saldem w Kasynie 2FGT",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) buildPlayerProfileEmbed(ctx context.Context, identifier string) *discordgo.MessageEmbed {
	player, stats, activeRound, err := b.ledger.AdminGetUser(ctx, identifier)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd wyszukiwania gracza",
			Description: fmt.Sprintf("Nie znaleziono gracza o identyfikatorze: `%s`", identifier),
		}
	}

	avatarURL := b.getValidAvatarURL(player.Avatar)

	createdTime := time.UnixMilli(player.CreatedAt).Format("02.01.2006 15:04")
	lastActive := time.UnixMilli(player.UpdatedAt).Format("02.01.2006 15:04")

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "💰 Saldo",
			Value:  fmt.Sprintf("**%s**", formatFGT(player.Balance)),
			Inline: true,
		},
		{
			Name:   "⭐ Poziom & XP",
			Value:  fmt.Sprintf("Poziom **%d** (%d XP)", player.Level, player.XP),
			Inline: true,
		},
		{
			Name:   "🔥 Streak logowań",
			Value:  fmt.Sprintf("**%d** dni", player.Streak),
			Inline: true,
		},
		{
			Name:   "🆔 Identyfikatory",
			Value:  fmt.Sprintf("User ID: `%s`\nEmail: `%s`", player.UserID, player.Email),
			Inline: false,
		},
	}

	if stats != nil {
		favGame := stats.FavoriteGame
		if favGame == "" {
			favGame = "Brak"
		}
		fields = append(fields, &discordgo.MessageEmbedField{
			Name: "📊 Statystyki Rozgrywek",
			Value: fmt.Sprintf(
				"🎮 Rozegrane rundy: **%d**\n"+
					"💸 Suma zakładów: **%s**\n"+
					"🏆 Największa wygrana: **%s**\n"+
					"⚡ Najwyższy mnożnik: **×%.2f**\n"+
					"🎯 Ulubiona gra: **%s**",
				stats.TotalRounds, formatFGT(stats.TotalWagered), formatFGT(stats.BiggestWin), stats.MaxMultiplier, favGame,
			),
			Inline: false,
		})
	}

	if activeRound != nil {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "⏳ Aktywna Gra w Toku",
			Value:  fmt.Sprintf("Gra: **%s** | Stawka: **%s** | ID: `%s`", activeRound.Game, formatFGT(activeRound.Bet), activeRound.ID),
			Inline: false,
		})
	}

	fields = append(fields, &discordgo.MessageEmbedField{
		Name:   "🕒 Czasy aktywności",
		Value:  fmt.Sprintf("Rejestracja: `%s`\nOstatnia gra: `%s`", createdTime, lastActive),
		Inline: false,
	})

	embed := &discordgo.MessageEmbed{
		Color:       ColorPurple,
		Title:       fmt.Sprintf("👤 Pełny Profil Gracza: %s", player.Nick),
		Description: fmt.Sprintf("Konto w systemie Kasyna Klubowego 2FGT ([Graj teraz](%s))", b.appURL),
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "System Bazy Danych Kasyna 2FGT",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}

	if avatarURL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: avatarURL}
	}

	return embed
}

func (b *Bot) buildGlobalStatsEmbed(ctx context.Context) *discordgo.MessageEmbed {
	stats, err := b.ledger.AdminGetGlobalCasinoStats(ctx)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd",
			Description: "Nie udało się pobrać statystyk kasyna.",
		}
	}

	biggestWinText := "Brak"
	if stats.BiggestWin > 0 {
		biggestWinText = fmt.Sprintf("**%s** (%s w %s)", formatFGT(stats.BiggestWin), stats.BiggestWinNick, stats.BiggestWinGame)
	}

	return &discordgo.MessageEmbed{
		Color: ColorGold,
		Title: "🌐 Globalne Statystyki Kasyna 2FGT",
		Description: fmt.Sprintf(
			"👥 **Zarejestrowani gracze:** `%d`\n"+
				"🎲 **Rozegrane rundy:** `%d`\n"+
				"💸 **Suma postawionych stawek:** `%s`\n"+
				"💎 **Suma wypłaconych wygranych:** `%s`\n"+
				"🏆 **Rekordowa wygrana:** %s\n"+
				"⚡ **Najwyższy trafiony mnożnik:** `×%.2f`\n\n"+
				"Wejdź do gry: [**%s**](%s)",
			stats.TotalPlayers, stats.TotalRounds, formatFGT(stats.TotalWagered), formatFGT(stats.TotalPayout),
			biggestWinText, stats.MaxMultiplier, b.appURL, b.appURL,
		),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Kasyno 2FGT • Statystyki w czasie rzeczywistym",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) buildHelpEmbed(isAdmin bool) *discordgo.MessageEmbed {
	fields := []*discordgo.MessageEmbedField{
		{
			Name: "💰 Player Funds Management (/money)",
			Value: "`/money add <player> <amount> [reason]` — Add $FGT tokens to player(s) or all (`*`)\n" +
				"`/money remove <player> <amount> [reason]` — Remove $FGT tokens from player(s)\n" +
				"`/money set <player> <amount> [reason]` — Set exact $FGT token balance\n" +
				"`/money revert <player> <until> [reason]` — Rollback balances & delete records back to date/time",
			Inline: false,
		},
		{
			Name: "👥 Player Account Management (/user)",
			Value: "`/user create <nickname> [id] [email] [balance]` — Create a new account\n" +
				"`/user setnick <player> <new_nickname>` — Change player nickname\n" +
				"`/user delete <player>` — Delete player account\n" +
				"`/user list [search]` — List registered players with interactive menu",
			Inline: false,
		},
		{
			Name: "⏰ Automated Drops (/schedule)",
			Value: "`/schedule add <name> <amount> <players> [day] [time] [cron] [reason]` — Plan recurring drops\n" +
				"`/schedule list [filter]` — List scheduled recurring drops\n" +
				"`/schedule remove <identifier>` — Delete a scheduled drop\n" +
				"`/schedule toggle <identifier> <active>` — Enable or disable a drop\n" +
				"`/schedule run <identifier>` — Test run a drop immediately",
			Inline: false,
		},
		{
			Name: "📊 Overview & Leaderboards",
			Value: "`/player <identifier>` — Full player profile, balance & XP\n" +
				"`/leaderboard [category]` — Wealth or level rankings\n" +
				"`/stats` — Real-time casino platform statistics\n" +
				"`/help` — Show this command guide",
			Inline: false,
		},
	}

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       "2FGT Casino — Command Console",
		Description: fmt.Sprintf("Casino web platform: [**%s**](%s)", b.appURL, b.appURL),
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "2FGT Casino Core • Management Console",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func isAllUsersIdentifier(identifier string) bool {
	t := strings.TrimSpace(strings.ToLower(identifier))
	if t == "" {
		return false
	}
	return strings.Contains(t, "*") ||
		strings.HasPrefix(t, "all") ||
		strings.HasPrefix(t, "wszysc") ||
		strings.HasPrefix(t, "@everyone") ||
		strings.HasPrefix(t, "everyone") ||
		t == "@here" || t == "global"
}

func (b *Bot) executeGrantMoney(ctx context.Context, identifier string, amount int64, reason string) *discordgo.MessageEmbed {
	if isAllUsersIdentifier(identifier) {
		count, totalTransferred, err := b.ledger.GrantBalanceAll(ctx, amount, reason)
		if err != nil {
			return &discordgo.MessageEmbed{
				Color:       ColorRose,
				Title:       "❌ Błąd masowej operacji na środkach",
				Description: fmt.Sprintf("Nie udało się zaktualizować sald dla wszystkich graczy: **%v**", err),
			}
		}

		b.invalidatePlayerCache()

		actionTitle := "[GLOBAL] Doładowano środki dla WSZYSTKICH graczy (*)"
		actionColor := ColorEmerald
		if amount < 0 {
			actionTitle = "[GLOBAL] Odjęto środki od WSZYSTKICH graczy (*)"
			actionColor = ColorGold
		}

		return &discordgo.MessageEmbed{
			Color: actionColor,
			Title: actionTitle,
			Fields: []*discordgo.MessageEmbedField{
				{Name: "👥 Zaktualizowano kont", Value: fmt.Sprintf("**%d graczy**", count), Inline: true},
				{Name: "💎 Zmiana na konto", Value: fmt.Sprintf("**%+d $FGT**", amount), Inline: true},
				{Name: "💰 Łączny transfer", Value: fmt.Sprintf("**%+d $FGT**", totalTransferred), Inline: true},
				{Name: "📝 Powód", Value: reason, Inline: false},
			},
			Footer:    &discordgo.MessageEmbedFooter{Text: "Operacja masowa (*) została pomyślnie zarejestrowana w bazie danych"},
			Timestamp: time.Now().Format(time.RFC3339),
		}
	}

	if strings.Contains(identifier, ",") {
		rawParts := strings.Split(identifier, ",")
		var players []string
		seen := make(map[string]bool)
		for _, p := range rawParts {
			clean := strings.TrimSpace(p)
			if clean != "" && !seen[strings.ToLower(clean)] {
				seen[strings.ToLower(clean)] = true
				players = append(players, clean)
			}
		}

		if len(players) > 1 {
			type grantRes struct {
				nick    string
				prevBal int64
				newBal  int64
				err     error
			}
			var results []grantRes
			var successCount int
			var totalTransferred int64

			for _, p := range players {
				nick, prevBal, newBal, err := b.ledger.GrantBalance(ctx, p, amount, reason)
				if err != nil {
					results = append(results, grantRes{nick: p, err: err})
				} else {
					successCount++
					totalTransferred += amount
					results = append(results, grantRes{nick: nick, prevBal: prevBal, newBal: newBal})
				}
			}

			b.invalidatePlayerCache()

			actionTitle := fmt.Sprintf("✅ Zaktualizowano środki dla %d graczy", successCount)
			actionColor := ColorEmerald
			if amount < 0 {
				actionColor = ColorGold
			}
			if successCount == 0 {
				actionColor = ColorRose
				actionTitle = "❌ Błąd: Nie znaleziono podanych graczy"
			}

			var details []string
			for _, r := range results {
				if r.err != nil {
					details = append(details, fmt.Sprintf("❌ **%s**: %v", r.nick, r.err))
				} else {
					details = append(details, fmt.Sprintf("👤 **%s**: %s ➔ **%s** (%+d $FGT)", r.nick, formatFGT(r.prevBal), formatFGT(r.newBal), amount))
				}
			}

			desc := strings.Join(details, "\n")
			if len(desc) > 2000 {
				desc = desc[:1990] + "..."
			}

			return &discordgo.MessageEmbed{
				Color:       actionColor,
				Title:       actionTitle,
				Description: desc,
				Fields: []*discordgo.MessageEmbedField{
					{Name: "👥 Pomyślnie zaktualizowano", Value: fmt.Sprintf("**%d / %d graczy**", successCount, len(players)), Inline: true},
					{Name: "💎 Zmiana na konto", Value: fmt.Sprintf("**%+d $FGT**", amount), Inline: true},
					{Name: "💰 Łączny transfer", Value: fmt.Sprintf("**%+d $FGT**", totalTransferred), Inline: true},
					{Name: "📝 Powód", Value: reason, Inline: false},
				},
				Footer:    &discordgo.MessageEmbedFooter{Text: "Operacja grupowa została pomyślnie wykonana"},
				Timestamp: time.Now().Format(time.RFC3339),
			}
		}
	}

	nick, prevBal, newBal, err := b.ledger.GrantBalance(ctx, identifier, amount, reason)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd operacji na środkach",
			Description: fmt.Sprintf("Nie udało się zaktualizować salda: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	actionTitle := "✅ Doładowano środki $FGT"
	actionColor := ColorEmerald
	if amount < 0 {
		actionTitle = "✅ Odjęto środki $FGT"
		actionColor = ColorGold
	}

	return &discordgo.MessageEmbed{
		Color: actionColor,
		Title: actionTitle,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Gracz", Value: fmt.Sprintf("**%s**", nick), Inline: true},
			{Name: "Zmiana", Value: fmt.Sprintf("**%+d $FGT**", amount), Inline: true},
			{Name: "Powód", Value: reason, Inline: true},
			{Name: "Poprzednie saldo", Value: formatFGT(prevBal), Inline: true},
			{Name: "Nowe saldo", Value: fmt.Sprintf("**%s**", formatFGT(newBal)), Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "Rejestr transakcji został zaktualizowany w bazie danych"},
	}
}

func (b *Bot) executeSetMoney(ctx context.Context, identifier string, newBalance int64, reason string) *discordgo.MessageEmbed {
	if isAllUsersIdentifier(identifier) {
		count, err := b.ledger.AdminSetBalanceAll(ctx, newBalance, reason)
		if err != nil {
			return &discordgo.MessageEmbed{
				Color:       ColorRose,
				Title:       "❌ Błąd masowego ustawiania salda",
				Description: fmt.Sprintf("Nie udało się ustawić salda dla wszystkich graczy: **%v**", err),
			}
		}

		b.invalidatePlayerCache()

		return &discordgo.MessageEmbed{
			Color: ColorEmerald,
			Title: "[GLOBAL] Ustawiono jednakowe saldo dla WSZYSTKICH graczy (*)",
			Fields: []*discordgo.MessageEmbedField{
				{Name: "👥 Zaktualizowano kont", Value: fmt.Sprintf("**%d graczy**", count), Inline: true},
				{Name: "💰 Nowe saldo na konto", Value: fmt.Sprintf("**%s**", formatFGT(newBalance)), Inline: true},
				{Name: "📝 Powód", Value: reason, Inline: false},
			},
			Footer:    &discordgo.MessageEmbedFooter{Text: "Masowa modyfikacja kont (*) została pomyślnie zapisana"},
			Timestamp: time.Now().Format(time.RFC3339),
		}
	}

	if strings.Contains(identifier, ",") {
		rawParts := strings.Split(identifier, ",")
		var players []string
		seen := make(map[string]bool)
		for _, p := range rawParts {
			clean := strings.TrimSpace(p)
			if clean != "" && !seen[strings.ToLower(clean)] {
				seen[strings.ToLower(clean)] = true
				players = append(players, clean)
			}
		}

		if len(players) > 1 {
			type setRes struct {
				nick    string
				prevBal int64
				newBal  int64
				err     error
			}
			var results []setRes
			var successCount int

			for _, p := range players {
				nick, prevBal, newBal, err := b.ledger.AdminSetBalance(ctx, p, newBalance, reason)
				if err != nil {
					results = append(results, setRes{nick: p, err: err})
				} else {
					successCount++
					results = append(results, setRes{nick: nick, prevBal: prevBal, newBal: newBal})
				}
			}

			b.invalidatePlayerCache()

			actionTitle := fmt.Sprintf("✅ Ustawiono saldo dla %d graczy", successCount)
			actionColor := ColorEmerald
			if successCount == 0 {
				actionColor = ColorRose
				actionTitle = "❌ Błąd: Nie znaleziono podanych graczy"
			}

			var details []string
			for _, r := range results {
				if r.err != nil {
					details = append(details, fmt.Sprintf("❌ **%s**: %v", r.nick, r.err))
				} else {
					details = append(details, fmt.Sprintf("👤 **%s**: %s ➔ **%s**", r.nick, formatFGT(r.prevBal), formatFGT(r.newBal)))
				}
			}

			desc := strings.Join(details, "\n")
			if len(desc) > 2000 {
				desc = desc[:1990] + "..."
			}

			return &discordgo.MessageEmbed{
				Color:       actionColor,
				Title:       actionTitle,
				Description: desc,
				Fields: []*discordgo.MessageEmbedField{
					{Name: "👥 Pomyślnie zaktualizowano", Value: fmt.Sprintf("**%d / %d graczy**", successCount, len(players)), Inline: true},
					{Name: "💰 Nowe saldo", Value: fmt.Sprintf("**%s**", formatFGT(newBalance)), Inline: true},
					{Name: "📝 Powód", Value: reason, Inline: false},
				},
				Footer:    &discordgo.MessageEmbedFooter{Text: "Operacja grupowa została pomyślnie wykonana"},
				Timestamp: time.Now().Format(time.RFC3339),
			}
		}
	}

	nick, prevBal, newBal, err := b.ledger.AdminSetBalance(ctx, identifier, newBalance, reason)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd ustawiania salda",
			Description: fmt.Sprintf("Nie udało się ustawić salda: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	return &discordgo.MessageEmbed{
		Color: ColorEmerald,
		Title: "✅ Ustawiono nowe saldo $FGT",
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Gracz", Value: fmt.Sprintf("**%s**", nick), Inline: true},
			{Name: "Powód", Value: reason, Inline: true},
			{Name: "Poprzednie saldo", Value: formatFGT(prevBal), Inline: true},
			{Name: "Nowe saldo", Value: fmt.Sprintf("**%s**", formatFGT(newBal)), Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "Rejestr transakcji został zaktualizowany w bazie danych"},
	}
}

func parseRevertTimestamp(input string) (time.Time, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return time.Time{}, fmt.Errorf("pusta data/godzina")
	}

	now := time.Now()
	inputLower := strings.ToLower(input)

	// Handle keywords with time, e.g. "today 15:30:00", "dzisiaj 14:00:00", "yesterday 20:00:00", "wczoraj 18:30:00"
	for _, prefix := range []string{"today ", "dzisiaj ", "now "} {
		if strings.HasPrefix(inputLower, prefix) {
			timePart := strings.TrimSpace(input[len(prefix):])
			t, err := parseTimeOnly(timePart, now)
			if err == nil {
				return t, nil
			}
		}
	}
	for _, prefix := range []string{"yesterday ", "wczoraj "} {
		if strings.HasPrefix(inputLower, prefix) {
			timePart := strings.TrimSpace(input[len(prefix):])
			t, err := parseTimeOnly(timePart, now.AddDate(0, 0, -1))
			if err == nil {
				return t, nil
			}
		}
	}

	// Relative formats: 10m, 1h, 24h, 2d, 30s, 1d
	if d, err := time.ParseDuration(input); err == nil {
		return now.Add(-d), nil
	}
	if strings.HasSuffix(inputLower, "d") {
		daysStr := strings.TrimSuffix(inputLower, "d")
		if days, err := strconv.Atoi(daysStr); err == nil && days > 0 {
			return now.AddDate(0, 0, -days), nil
		}
	}

	// Format: HH:MM or HH:MM:SS (Today)
	if (len(input) == 5 || len(input) == 8) && strings.Contains(input, ":") && !strings.Contains(input, "-") && !strings.Contains(input, ".") && !strings.Contains(input, "/") {
		layout := "15:04"
		if len(input) == 8 {
			layout = "15:04:05"
		}
		t, err := time.ParseInLocation(layout, input, time.Local)
		if err == nil {
			target := time.Date(now.Year(), now.Month(), now.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local)
			if target.After(now) {
				target = target.AddDate(0, 0, -1)
			}
			return target, nil
		}
	}

	// Supported explicit formats
	formats := []string{
		"02-01-2006 15:04:05",
		"02-01-2006 15:04",
		"02-01-2006T15:04:05",
		"02-01-2006T15:04",
		"02-01-2006",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"02.01.2006 15:04:05",
		"02.01.2006 15:04",
		"02/01/2006 15:04:05",
		"02/01/2006 15:04",
		"2006/01/02 15:04:05",
		"2006/01/02 15:04",
		"2006-01-02",
		"02.01.2006",
		"02/01/2006",
	}

	for _, layout := range formats {
		if t, err := time.ParseInLocation(layout, input, time.Local); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("nieobsługiwany format daty. Przykłady: '24-09-2026 15:30:00', '2026-09-24 15:30:00', '24-09-2026'")
}

func parseTimeOnly(input string, baseDate time.Time) (time.Time, error) {
	input = strings.TrimSpace(input)
	layout := "15:04"
	if strings.Count(input, ":") >= 2 {
		layout = "15:04:05"
	}
	t, err := time.ParseInLocation(layout, input, time.Local)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(baseDate.Year(), baseDate.Month(), baseDate.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local), nil
}

func (b *Bot) executeRevertMoney(ctx context.Context, identifier string, untilStr string, reason string) *discordgo.MessageEmbed {
	targetTime, err := parseRevertTimestamp(untilStr)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Nieprawidłowy format daty/godziny",
			Description: fmt.Sprintf("Nie udało się sparsować daty `%s`:\n**%v**", untilStr, err),
			Fields: []*discordgo.MessageEmbedField{
				{
					Name:  "💡 Obsługiwane formaty",
					Value: "`15:30` (godzina dzisiaj)\n`2026-09-24 14:00` (data i godzina)\n`24.09.2026 14:00`\n`1h` / `30m` / `1d` (wstecz)",
				},
			},
		}
	}

	untilMillis := targetTime.UnixMilli()
	formattedTargetTime := targetTime.Format("2006-01-02 15:04:05")

	if reason == "" {
		reason = "Transaction Revert (Discord)"
	}

	if isAllUsersIdentifier(identifier) {
		affectedUsers, deletedEntries, deletedRounds, err := b.ledger.AdminRevertBalanceAll(ctx, untilMillis)
		if err != nil {
			return &discordgo.MessageEmbed{
				Color:       ColorRose,
				Title:       "❌ Błąd masowego cofania transakcji (*)",
				Description: fmt.Sprintf("Nie udało się cofnąć transakcji: **%v**", err),
			}
		}

		b.invalidatePlayerCache()

		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "⏪ [GLOBAL] Cofnięto transakcje dla WSZYSTKICH graczy (*)",
			Description: fmt.Sprintf("Usunięto wszystkie wpisy w rejestrze i gry utworzone po **%s**.", formattedTargetTime),
			Fields: []*discordgo.MessageEmbedField{
				{Name: "📅 Punkt przywrócenia", Value: fmt.Sprintf("`%s`", formattedTargetTime), Inline: true},
				{Name: "👥 Zmodyfikowanych graczy", Value: fmt.Sprintf("**%d kont**", affectedUsers), Inline: true},
				{Name: "🗑️ Usuniętych wpisów ledger", Value: fmt.Sprintf("**%d**", deletedEntries), Inline: true},
				{Name: "🎮 Usuniętych gier", Value: fmt.Sprintf("**%d**", deletedRounds), Inline: true},
				{Name: "📝 Powód", Value: reason, Inline: false},
			},
			Footer:    &discordgo.MessageEmbedFooter{Text: "Cofanie transakcji zostało zakończone sukcesem"},
			Timestamp: time.Now().Format(time.RFC3339),
		}
	}

	if strings.Contains(identifier, ",") {
		rawParts := strings.Split(identifier, ",")
		var players []string
		seen := make(map[string]bool)
		for _, p := range rawParts {
			clean := strings.TrimSpace(p)
			if clean != "" && !seen[strings.ToLower(clean)] {
				seen[strings.ToLower(clean)] = true
				players = append(players, clean)
			}
		}

		if len(players) > 1 {
			var results []*ledger.RevertResult
			var errs []string
			var totalDeletedLedger, totalDeletedRounds int64

			for _, p := range players {
				res, err := b.ledger.AdminRevertBalanceUser(ctx, p, untilMillis)
				if err != nil {
					errs = append(errs, fmt.Sprintf("❌ **%s**: %v", p, err))
				} else {
					results = append(results, res)
					totalDeletedLedger += res.DeletedLedger
					totalDeletedRounds += res.DeletedRounds
				}
			}

			b.invalidatePlayerCache()

			var details []string
			for _, r := range results {
				details = append(details, fmt.Sprintf("👤 **%s**: %s ➔ **%s** (usunięto: %d wpisów, %d gier)",
					r.Nick, formatFGT(r.PreviousBal), formatFGT(r.NewBal), r.DeletedLedger, r.DeletedRounds))
			}
			details = append(details, errs...)

			desc := strings.Join(details, "\n")
			if len(desc) > 2000 {
				desc = desc[:1990] + "..."
			}

			return &discordgo.MessageEmbed{
				Color:       ColorGold,
				Title:       fmt.Sprintf("⏪ Cofnięto transakcje dla %d graczy", len(results)),
				Description: desc,
				Fields: []*discordgo.MessageEmbedField{
					{Name: "📅 Punkt przywrócenia", Value: fmt.Sprintf("`%s`", formattedTargetTime), Inline: true},
					{Name: "🗑️ Usunięte transakcje", Value: fmt.Sprintf("**%d wpisów**", totalDeletedLedger), Inline: true},
					{Name: "🎮 Usunięte gry", Value: fmt.Sprintf("**%d gier**", totalDeletedRounds), Inline: true},
					{Name: "📝 Powód", Value: reason, Inline: false},
				},
				Footer:    &discordgo.MessageEmbedFooter{Text: "Cofanie grupowe transakcji zostało zakończone"},
				Timestamp: time.Now().Format(time.RFC3339),
			}
		}
	}

	res, err := b.ledger.AdminRevertBalanceUser(ctx, identifier, untilMillis)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd cofania transakcji",
			Description: fmt.Sprintf("Nie udało się cofnąć transakcji dla `%s`: **%v**", identifier, err),
		}
	}

	b.invalidatePlayerCache()

	return &discordgo.MessageEmbed{
		Color: ColorGold,
		Title: "⏪ Cofnięto transakcje i saldo gracza",
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Gracz", Value: fmt.Sprintf("**%s**", res.Nick), Inline: true},
			{Name: "📅 Punkt przywrócenia", Value: fmt.Sprintf("`%s`", formattedTargetTime), Inline: true},
			{Name: "📝 Powód", Value: reason, Inline: true},
			{Name: "Poprzednie saldo", Value: formatFGT(res.PreviousBal), Inline: true},
			{Name: "Nowe saldo", Value: fmt.Sprintf("**%s**", formatFGT(res.NewBal)), Inline: true},
			{Name: "🗑️ Usunięte wpisy ledger", Value: fmt.Sprintf("**%d wpisów**", res.DeletedLedger), Inline: true},
			{Name: "🎮 Usunięte gry", Value: fmt.Sprintf("**%d gier**", res.DeletedRounds), Inline: true},
		},
		Footer:    &discordgo.MessageEmbedFooter{Text: "Usunięto wszystkie rekordy utworzone po wskazanym czasie"},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) executeCreateUser(ctx context.Context, nick, userID, email string, initialBal int64) *discordgo.MessageEmbed {
	player, err := b.ledger.AdminCreateUser(ctx, userID, nick, email, initialBal)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd tworzenia gracza",
			Description: fmt.Sprintf("Nie udało się utworzyć gracza: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	return &discordgo.MessageEmbed{
		Color: ColorEmerald,
		Title: "✅ Utworzono nowego gracza w kasynie",
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Nick", Value: fmt.Sprintf("**%s**", player.Nick), Inline: true},
			{Name: "User ID", Value: fmt.Sprintf("`%s`", player.UserID), Inline: true},
			{Name: "Email", Value: fmt.Sprintf("`%s`", player.Email), Inline: true},
			{Name: "Saldo początkowe", Value: fmt.Sprintf("**%s**", formatFGT(player.Balance)), Inline: true},
			{Name: "Poziom", Value: fmt.Sprintf("LVL %d (%d XP)", player.Level, player.XP), Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "Gracz może teraz logować się i brać udział w grach"},
	}
}

func (b *Bot) executeSetNick(ctx context.Context, identifier, newNick string) *discordgo.MessageEmbed {
	oldNick, updatedNick, err := b.ledger.AdminSetNick(ctx, identifier, newNick)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd zmiany nicku",
			Description: fmt.Sprintf("Nie udało się zmienić nicku: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	return &discordgo.MessageEmbed{
		Color:       ColorEmerald,
		Title:       "✅ Zmieniono nick gracza",
		Description: fmt.Sprintf("Pomyślnie zaktualizowano nick z **%s** na **%s**.", oldNick, updatedNick),
	}
}

func (b *Bot) executeDeleteUser(ctx context.Context, identifier string) *discordgo.MessageEmbed {
	nick, err := b.ledger.AdminDeleteUser(ctx, identifier)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd usuwania gracza",
			Description: fmt.Sprintf("Nie udało się usunąć gracza: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       "🗑️ Usunięto konto gracza",
		Description: fmt.Sprintf("Gracz **%s** oraz powiązana z nim historia gier i transakcji zostały usunięte.", nick),
	}
}

func (b *Bot) buildUsersListEmbed(ctx context.Context, search string) *discordgo.MessageEmbed {
	players, total, err := b.ledger.AdminListUsers(ctx, search, 25, 0)
	if err != nil || len(players) == 0 {
		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "👥 Lista Graczy Kasyna",
			Description: fmt.Sprintf("Nie znaleziono graczy pasujących do wyszukiwania: `%s`", search),
		}
	}

	var sb strings.Builder
	for idx, p := range players {
		sb.WriteString(fmt.Sprintf("`%d.` **%s** (`%s`) — %s | LVL %d | Streak: %dd\n",
			idx+1, p.Nick, p.UserID, formatFGT(p.Balance), p.Level, p.Streak))
	}

	title := fmt.Sprintf("👥 Lista Graczy Kasyna (Znaleziono %d)", total)
	if search != "" {
		title = fmt.Sprintf("👥 Wyniki dla: \"%s\" (Znaleziono %d)", search, total)
	}

	return &discordgo.MessageEmbed{
		Color:       ColorDark,
		Title:       title,
		Description: sb.String(),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Kasyno 2FGT • Wyświetlono do 25 rekordów",
		},
	}
}

func (b *Bot) buildUsersSelectMenu(ctx context.Context, search string) []discordgo.MessageComponent {
	players, _, err := b.ledger.AdminListUsers(ctx, search, 25, 0)
	if err != nil || len(players) == 0 {
		return nil
	}

	options := []discordgo.SelectMenuOption{}
	for idx, p := range players {
		if idx >= 25 {
			break
		}
		desc := fmt.Sprintf("Saldo: %s | Level %d | ID: %s", formatFGT(p.Balance), p.Level, p.UserID)
		if len(desc) > 100 {
			desc = desc[:97] + "..."
		}
		options = append(options, discordgo.SelectMenuOption{
			Label:       p.Nick,
			Value:       "select_player:" + p.Nick,
			Description: desc,
			Emoji:       &discordgo.ComponentEmoji{Name: "👤"},
		})
	}

	return []discordgo.MessageComponent{
		discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{
				discordgo.SelectMenu{
					CustomID:    "player_select_dropdown",
					Placeholder: "🔍 Wybierz gracza z listy, aby zobaczyć profil...",
					Options:     options,
				},
			},
		},
	}
}

func (b *Bot) buildScheduledGrantsListEmbed(ctx context.Context, filter string) *discordgo.MessageEmbed {
	if b.scheduler == nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd Harmonogramu",
			Description: "Usługa harmonogramu nie została zainicjalizowana.",
		}
	}

	grants, err := b.scheduler.ListGrants(ctx)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd Bazy Danych",
			Description: fmt.Sprintf("Nie udało się pobrać listy harmonogramów: %v", err),
		}
	}

	if len(grants) == 0 {
		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "⏰ Harmonogram Automatycznych Zrzutów ($FGT)",
			Description: "Brak zaplanowanych zrzutów. Użyj `/dodaj-zrzut`, aby dodać nowy harmonogram.",
		}
	}

	loc := b.scheduler.Location()
	filterLower := strings.ToLower(strings.TrimSpace(filter))

	var sb strings.Builder
	matchedCount := 0

	for idx, g := range grants {
		if filterLower != "" {
			combined := strings.ToLower(fmt.Sprintf("%s %s %s %s", g.ID, g.Name, g.TargetUsers, g.Reason))
			if !strings.Contains(combined, filterLower) {
				continue
			}
		}
		matchedCount++

		statusIcon := "🟢 Aktywny"
		if !g.Enabled {
			statusIcon = "🔴 Wyłączony"
		}

		targetStr := g.TargetUsers
		if targetStr == "*" {
			targetStr = "🌐 Wszyscy gracze (*)"
		} else {
			targetStr = "👥 " + targetStr
		}

		nextRunStr := "Brak"
		if g.NextRunAt != nil && g.Enabled {
			nextRunStr = time.UnixMilli(*g.NextRunAt).In(loc).Format("02.01.2006 15:04:05 (MST)")
		}

		lastRunStr := "Nigdy"
		if g.LastRunAt != nil {
			lastRunStr = time.UnixMilli(*g.LastRunAt).In(loc).Format("02.01.2006 15:04:05 (MST)")
		}

		shortID := g.ID
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}

		isMusor := g.GrantType == "musordrop" || g.GrantType == "musor_box" || g.GrantType == "box"
		rewardLabel := fmt.Sprintf("💰 Kwota: **+%s**", formatFGT(g.Amount))
		if isMusor {
			rewardLabel = fmt.Sprintf("📦 Skrzynki: **+%d Lepszych**", g.Amount)
		}

		sb.WriteString(fmt.Sprintf("**%d. %s** `[%s]` — %s\n", idx+1, g.Name, shortID, statusIcon))
		sb.WriteString(fmt.Sprintf("└ %s / gracz | Cel: **%s**\n", rewardLabel, targetStr))
		sb.WriteString(fmt.Sprintf("└ 🕒 Harmonogram: *%s* (Cron: `%s`)\n", g.HumanSchedule, g.CronExpr))
		sb.WriteString(fmt.Sprintf("└ ⏳ Następny zrzut: `%s` | Ostatni: `%s`\n", nextRunStr, lastRunStr))
		sb.WriteString(fmt.Sprintf("└ 📝 Powód: *%s* | ID: `%s`\n\n", g.Reason, g.ID))
	}

	if matchedCount == 0 {
		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "⏰ Harmonogram Automatycznych Zrzutów",
			Description: fmt.Sprintf("Brak harmonogramów pasujących do filtra: `%s`", filter),
		}
	}

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       fmt.Sprintf("⏰ Harmonogram Automatycznych Zrzutów [%d]", matchedCount),
		Description: sb.String(),
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("Strefa czasowa: %s • Zarządzaj: /dodaj-zrzut /usun-zrzut /przelacz-zrzut", b.cfg.Timezone),
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) executeScheduleAdd(ctx context.Context, params scheduler.CreateGrantParams) *discordgo.MessageEmbed {
	if b.scheduler == nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd",
			Description: "Harmonogram nie jest aktywny na tym serwerze.",
		}
	}

	grant, err := b.scheduler.AddScheduledGrant(ctx, params)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd tworzenia harmonogramu",
			Description: fmt.Sprintf("Nie udało się utworzyć harmonogramu: **%v**", err),
		}
	}

	nextRunStr := "Brak"
	if grant.NextRunAt != nil {
		loc := b.scheduler.Location()
		nextRunStr = time.UnixMilli(*grant.NextRunAt).In(loc).Format("02.01.2006 15:04:05 (MST)")
	}

	targetDesc := grant.TargetUsers
	if targetDesc == "*" {
		targetDesc = "🌐 Wszyscy zarejestrowani gracze (*)"
	} else {
		targetDesc = fmt.Sprintf("👥 Gracze: `%s`", targetDesc)
	}

	isMusor := grant.GrantType == "musordrop" || grant.GrantType == "musor_box" || grant.GrantType == "box"
	amountField := &discordgo.MessageEmbedField{
		Name:   "💰 Kwota na konto",
		Value:  fmt.Sprintf("**+%s**", formatFGT(grant.Amount)),
		Inline: true,
	}
	title := "✅ Utworzono Nowy Harmonogram Zrzutu $FGT"
	if isMusor {
		title = "✅ Utworzono Nowy Harmonogram Zrzutu Skrzynek Musor Drop"
		amountField = &discordgo.MessageEmbedField{
			Name:   "📦 Skrzynki na konto",
			Value:  fmt.Sprintf("**+%d skrzynek Lepszych**", grant.Amount),
			Inline: true,
		}
	}

	return &discordgo.MessageEmbed{
		Color: ColorEmerald,
		Title: title,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "📌 Nazwa", Value: fmt.Sprintf("**%s**", grant.Name), Inline: true},
			amountField,
			{Name: "🎯 Cel zrzutu", Value: targetDesc, Inline: false},
			{Name: "🕒 Harmonogram", Value: fmt.Sprintf("%s\n*(Cron: `%s`)*", grant.HumanSchedule, grant.CronExpr), Inline: false},
			{Name: "⏳ Następne uruchomienie", Value: fmt.Sprintf("`%s`", nextRunStr), Inline: true},
			{Name: "📝 Powód", Value: grant.Reason, Inline: true},
			{Name: "🆔 ID Zadania", Value: fmt.Sprintf("`%s`", grant.ID), Inline: false},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("Kasyno 2FGT • Zapisano w bazie danych • Strefa: %s", b.cfg.Timezone),
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) executeScheduleRemove(ctx context.Context, idOrName string) *discordgo.MessageEmbed {
	if b.scheduler == nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd",
			Description: "Harmonogram nie jest aktywny.",
		}
	}

	grant, err := b.scheduler.RemoveGrant(ctx, idOrName)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd usuwania harmonogramu",
			Description: fmt.Sprintf("Nie udało się usunąć zadania: **%v**", err),
		}
	}

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       "🗑️ Usunięto Harmonogram Zrzutu",
		Description: fmt.Sprintf("Pomyślnie usunięto automatyczny zrzut **%s** (`%s`).", grant.Name, grant.ID),
	}
}

func (b *Bot) executeScheduleToggle(ctx context.Context, idOrName string, enable bool) *discordgo.MessageEmbed {
	if b.scheduler == nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd",
			Description: "Harmonogram nie jest aktywny.",
		}
	}

	grant, err := b.scheduler.ToggleGrant(ctx, idOrName, enable)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd zmiany statusu harmonogramu",
			Description: fmt.Sprintf("Nie udało się zaktualizować zadania: **%v**", err),
		}
	}

	statusText := "Włączony 🟢"
	statusColor := ColorEmerald
	if !enable {
		statusText = "Wyłączony 🔴"
		statusColor = ColorRose
	}

	return &discordgo.MessageEmbed{
		Color:       statusColor,
		Title:       fmt.Sprintf("🔄 Zmieniono Status Harmonogramu: %s", statusText),
		Description: fmt.Sprintf("Harmonogram **%s** (`%s`) jest teraz **%s**.", grant.Name, grant.ID, statusText),
	}
}

func (b *Bot) executeScheduleRun(ctx context.Context, idOrName string) *discordgo.MessageEmbed {
	if b.scheduler == nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd",
			Description: "Harmonogram nie jest aktywny.",
		}
	}

	grant, err := b.scheduler.GetGrant(ctx, idOrName)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Nie znaleziono harmonogramu",
			Description: fmt.Sprintf("%v", err),
		}
	}

	res, err := b.scheduler.ExecuteGrant(ctx, grant.ID)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd natychmiastowego wykonania",
			Description: fmt.Sprintf("Nie udało się wykonać zrzutu: **%v**", err),
		}
	}

	var recDesc string
	if len(res.SuccessfulUsers) == 1 && res.SuccessfulUsers[0] == "* (Wszyscy gracze)" {
		recDesc = fmt.Sprintf("🌐 **Wszyscy zarejestrowani gracze** *(%d kont)*", res.RecipientsCount)
	} else {
		recDesc = fmt.Sprintf("👥 **Gracze (%d):** %s", len(res.SuccessfulUsers), strings.Join(res.SuccessfulUsers, ", "))
	}

	return &discordgo.MessageEmbed{
		Color: ColorEmerald,
		Title: fmt.Sprintf("⚡ Ręcznie Wykonano Zrzut: %s", res.Grant.Name),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "💰 Kwota na gracza", Value: fmt.Sprintf("**+%s**", formatFGT(res.Grant.Amount)), Inline: true},
			{Name: "💎 Łącznie rozdano", Value: fmt.Sprintf("**%s**", formatFGT(res.TotalTransferred)), Inline: true},
			{Name: "🎯 Odbiorcy", Value: recDesc, Inline: false},
			{Name: "📝 Powód", Value: res.Grant.Reason, Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Zrzut został natychmiastowo rozliczony i zapisany w bazie danych",
		},
		Timestamp: res.ExecutedAt.Format(time.RFC3339),
	}
}

func (b *Bot) buildMusorDropResultEmbed(playerNick string, outcome *ledger.MusorDropOutcome) *discordgo.MessageEmbed {
	color := ColorSky
	if outcome.IsJackpot {
		color = ColorGold
	} else if outcome.Prize > 0 {
		color = ColorEmerald
	} else {
		color = ColorDark
	}

	logoURL := b.appURL + "/musor-drop-hero.webp"

	title := fmt.Sprintf("🎁 Musor Drop: Skrzynka %s", strings.ToUpper(outcome.BoxType))
	if outcome.IsJackpot {
		title = fmt.Sprintf("🔥 JACKPOT W MUSOR DROP: Skrzynka %s!", strings.ToUpper(outcome.BoxType))
	}

	desc := fmt.Sprintf("Gracz **%s** otworzył skrzynkę **%s**!", playerNick, outcome.BoxType)

	var prizeDisplay string
	if outcome.Prize > 0 {
		prizeDisplay = fmt.Sprintf("🎉 **+%s** *(%s)*", formatFGT(outcome.Prize), outcome.PrizeName)
	} else {
		prizeDisplay = "💨 **Pusta skrzynka** *(Brak nagrody tym razem)*"
	}

	var limitsInfo string
	switch outcome.BoxType {
	case "plebs":
		limitsInfo = fmt.Sprintf("Darmowe dzisiaj: **%d / %d**", outcome.State.PlebsUsed, outcome.State.PlebsLimit)
	case "arystokracja":
		limitsInfo = fmt.Sprintf("Płatne dzisiaj: **%d / %d**", outcome.State.ArystokracjaUsed, outcome.State.ArystokracjaLimit)
	case "lepsza":
		limitsInfo = fmt.Sprintf("Pozostałe Lepsze: **%d szt.**", outcome.State.LepszaBoxes)
	}

	return &discordgo.MessageEmbed{
		Color:       color,
		Title:       title,
		Description: desc,
		Thumbnail: &discordgo.MessageEmbedThumbnail{
			URL: logoURL,
		},
		Fields: []*discordgo.MessageEmbedField{
			{
				Name:   "🎁 Wynik losowania",
				Value:  prizeDisplay,
				Inline: false,
			},
			{
				Name:   "💰 Aktualne saldo",
				Value:  fmt.Sprintf("**%s**", formatFGT(outcome.Balance)),
				Inline: true,
			},
			{
				Name:   "📊 Stan skrzynek",
				Value:  limitsInfo,
				Inline: true,
			},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Kasyno 2FGT • Musor Drop",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) executeGrantMusorDrop(ctx context.Context, identifier string, amount int, reason string) *discordgo.MessageEmbed {
	if reason == "" {
		if amount >= 0 {
			reason = "Admin Musor Drop Grant"
		} else {
			reason = "Admin Musor Drop Deduction"
		}
	}

	if isAllUsersIdentifier(identifier) {
		count, total, err := b.ledger.GrantMusorBoxesAll(ctx, amount, reason)
		if err != nil {
			return &discordgo.MessageEmbed{
				Color:       ColorRose,
				Title:       "❌ Błąd masowej operacji na skrzynkach",
				Description: fmt.Sprintf("Nie udało się zaktualizować skrzynek dla wszystkich graczy: **%v**", err),
			}
		}

		b.invalidatePlayerCache()

		actionTitle := "🎁 [GLOBAL] Przyznano skrzynki Musor Drop dla WSZYSTKICH graczy (*)"
		actionColor := ColorEmerald
		if amount < 0 {
			actionTitle = "📦 [GLOBAL] Odjęto skrzynki Musor Drop od WSZYSTKICH graczy (*)"
			actionColor = ColorGold
		}

		return &discordgo.MessageEmbed{
			Color: actionColor,
			Title: actionTitle,
			Fields: []*discordgo.MessageEmbedField{
				{Name: "👥 Zaktualizowano kont", Value: fmt.Sprintf("**%d graczy**", count), Inline: true},
				{Name: "📦 Zmiana na konto", Value: fmt.Sprintf("**%+d skrzynek Lepszych**", amount), Inline: true},
				{Name: "💎 Łącznie", Value: fmt.Sprintf("**%+d skrzynek**", total), Inline: true},
				{Name: "📝 Powód", Value: reason, Inline: false},
			},
			Footer:    &discordgo.MessageEmbedFooter{Text: "Operacja masowa (*) na skrzynkach została pomyślnie zrealizowana"},
			Timestamp: time.Now().Format(time.RFC3339),
		}
	}

	nick, prevBoxes, newBoxes, err := b.ledger.GrantMusorBoxes(ctx, identifier, amount, reason)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd operacji na skrzynkach",
			Description: fmt.Sprintf("Nie udało się zaktualizować skrzynek dla gracza `%s`: **%v**", identifier, err),
		}
	}

	b.invalidatePlayerCache()

	actionTitle := "🎁 Przyznano skrzynki Musor Drop"
	actionColor := ColorEmerald
	if amount < 0 {
		actionTitle = "📦 Odjęto skrzynki Musor Drop"
		actionColor = ColorGold
	}

	return &discordgo.MessageEmbed{
		Color: actionColor,
		Title: actionTitle,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "👤 Gracz", Value: fmt.Sprintf("**%s**", nick), Inline: true},
			{Name: "📦 Zmiana", Value: fmt.Sprintf("**%+d skrzynek**", amount), Inline: true},
			{Name: "📊 Stan skrzynek Lepszych", Value: fmt.Sprintf("`%d` ➔ **%d**", prevBoxes, newBoxes), Inline: true},
			{Name: "📝 Powód", Value: reason, Inline: false},
		},
		Footer:    &discordgo.MessageEmbedFooter{Text: "Musor Drop • Ekwipunek skrzynek"},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) executeResetMusorDrop(ctx context.Context, identifier, boxType string) *discordgo.MessageEmbed {
	affected, err := b.ledger.ResetMusorDropDaily(ctx, identifier, boxType)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd resetowania limitów Musor Drop",
			Description: fmt.Sprintf("Nie udało się zresetować dziennych limitów: **%v**", err),
		}
	}

	b.invalidatePlayerCache()

	boxLabel := "wszystkie dzienne skrzynki (Plebsowa i Arystokracka)"
	switch strings.ToLower(boxType) {
	case "plebs", "plebsowa":
		boxLabel = "skrzynka Plebsowa"
	case "arystokracja", "arystokracka":
		boxLabel = "skrzynka Arystokracka"
	}

	targetLabel := fmt.Sprintf("dla gracza `%s`", identifier)
	if isAllUsersIdentifier(identifier) {
		targetLabel = "dla WSZYSTKICH graczy (*)"
	}

	return &discordgo.MessageEmbed{
		Color: ColorEmerald,
		Title: "🔄 Zresetowano dzienne limity Musor Drop",
		Fields: []*discordgo.MessageEmbedField{
			{Name: "🎯 Cel", Value: targetLabel, Inline: true},
			{Name: "📦 Typ skrzynki", Value: boxLabel, Inline: true},
			{Name: "🧹 Usunięto wpisów dziennych", Value: fmt.Sprintf("**%d**", affected), Inline: true},
		},
		Footer:    &discordgo.MessageEmbedFooter{Text: "Gracz może ponownie otworzyć dzisiejsze darmowe/płatne skrzynki"},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}



