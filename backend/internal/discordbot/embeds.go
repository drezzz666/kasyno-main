package discordbot

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

func (b *Bot) buildBalanceEmbed(ctx context.Context, target string) *discordgo.MessageEmbed {
	player, stats, _, err := b.ledger.AdminGetUser(ctx, target)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Nie znaleziono gracza",
			Description: fmt.Sprintf("Nie znaleziono gracza o identyfikatorze/nicku **%s**.", target),
		}
	}

	avatarURL := b.getValidAvatarURL(player.Avatar)

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "💰 Saldo konta",
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
	}

	if stats != nil && stats.TotalRounds > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "📊 Aktywność",
			Value:  fmt.Sprintf("Rozegrane gry: **%d** | Obstawiono: **%s**", stats.TotalRounds, formatFGT(stats.TotalWagered)),
			Inline: false,
		})
	}

	embed := &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       fmt.Sprintf("👤 Stan konta: %s", player.Nick),
		Description: fmt.Sprintf("Zaloguj się i zagraj na [**%s**](%s)", b.appURL, b.appURL),
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "2FGT Kasyno Klubowe • Tokeny $FGT mają charakter wyłącznie rozrywkowy",
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}

	if avatarURL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: avatarURL}
	}

	return embed
}

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

func (b *Bot) buildMissionsEmbed(ctx context.Context) *discordgo.MessageEmbed {
	missions, nextReset, err := b.ledger.GetDailyMissions(ctx, "global_preview")
	if err != nil || len(missions) == 0 {
		return &discordgo.MessageEmbed{
			Color:       ColorGold,
			Title:       "🎯 Misje Rotacyjne Kasyna",
			Description: "Brak dostępnych misji w tym cyklu rotacji.",
		}
	}

	var sb strings.Builder
	sb.WriteString("Misje odnawiają się automatycznie **co 6 godzin** (00:00, 06:00, 12:00, 18:00 UTC).\n\n")

	for idx, m := range missions {
		sb.WriteString(fmt.Sprintf("**%d. %s**\n", idx+1, m.Title))
		sb.WriteString(fmt.Sprintf("└ *%s*\n", m.Description))
		sb.WriteString(fmt.Sprintf("└ 🎁 Nagroda: **+%s** & **+%d XP**\n\n", formatFGT(m.Reward), m.XPReward))
	}

	resetTime := time.UnixMilli(nextReset).UTC().Format("15:04:05 UTC")

	return &discordgo.MessageEmbed{
		Color:       ColorEmerald,
		Title:       "🎯 Aktywne Misje Rotacyjne (Cykl 6H)",
		Description: sb.String(),
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("Następna zmiana misji o: %s • Graj na %s", resetTime, b.appURL),
		},
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func (b *Bot) buildDailyEmbed(ctx context.Context, callerNick string) *discordgo.MessageEmbed {
	player, _, _, err := b.ledger.AdminGetUser(ctx, callerNick)

	streak := 0
	if err == nil && player != nil {
		streak = player.Streak
	}

	nextBonus := int64(100 + streak*50)
	if nextBonus > 1000 {
		nextBonus = 1000
	}

	return &discordgo.MessageEmbed{
		Color: ColorGold,
		Title: "🎁 Bonus Dzienny & Streak Logowań",
		Description: fmt.Sprintf(
			"Loguj się codziennie na stronie [**%s**](%s), aby odbierać coraz wyższe nagrody dzienne!\n\n"+
				"🔥 **Twój obecny streak:** `%d dni`\n"+
				"💎 **Kolejna nagroda codzienna:** `+%s`\n"+
				"🏆 **Maksymalny bonus:** `1,000 $FGT` (przy 18+ dniach streaku)\n\n"+
				"Odbierz bonus klikając przycisk w prawym górnym rogu na stronie kasyna!",
			b.appURL, b.appURL, streak, formatFGT(nextBonus),
		),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Kasyno 2FGT • Bonus resetuje się o północy UTC",
		},
	}
}

func (b *Bot) buildGamesEmbed() *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Color: ColorSky,
		Title: "🎰 Dostępne Gry w Kasynie 2FGT",
		Description: fmt.Sprintf(
			"Wszystkie gry rozliczane są po stronie serwera z certyfikatem **Provably Fair** (HMAC-SHA256):\n\n"+
				"1. **🎡 Ruletka (Roulette)** — Koło europejskie 0-36, zakłady na kolory, tuziny, numery (do ×36, RTP 97.3%%)\n"+
				"2. **🃏 Blackjack** — Klasyczny stolik, krupier dobiera do 17, wypłata 3:2, podwajanie i pas\n"+
				"3. **💣 Mines** — Siatka 5×5, od 2 do 24 min, cash-out w dowolnym momencie (RTP 97.0%%)\n"+
				"4. **🎰 Slots (Automaty)** — 5 obracających się bębnów, kombinacje (Pary, Trójki, Full, Korony do ×150, RTP 97.4%%)\n"+
				"5. **🪙 Coinflip** — Rzut monetą (Orzeł/Reszka), natychmiastowe rozliczenie (×1.98, RTP 99.0%%)\n"+
				"6. **✂️ KPN (Kamień, Papier, Nożyce)** — Pojedynek PvE z serwerem (×1.98)\n"+
				"7. **⚪ Plinko** — Fizyka kołków, 8-16 rzędów, poziomy ryzyka Low/Med/High (mnożnik do ×1000)\n"+
				"8. **🚀 Crash** — Startuje od 1.00x, rosnąca rakieta z manualnym lub automatycznym cashoutem (RTP 99.0%%)\n"+
				"9. **📈 Limbo** — Ustaw mnożnik docelowy od 1.01x do 10000x i sprawdź swoje szczęście (RTP 99.0%%)\n\n"+
				"👉 **Zagraj teraz:** [**%s**](%s)",
			b.appURL, b.appURL,
		),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Kasyno Klubowe 2FGT • Obsługuje Tryb Turbo ⚡",
		},
	}
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
			Name: "💰 Zarządzanie Finansami Graczy",
			Value: "`/casino-money-add <gracz> <kwota> [powód]` lub `!user money <gracz> add <kwota>`\n" +
				"`/casino-money-remove <gracz> <kwota> [powód]` lub `!user money <gracz> remove <kwota>`\n" +
				"`/casino-money-set <gracz> <kwota> [powód]` lub `!user money <gracz> set <kwota>`",
			Inline: false,
		},
		{
			Name: "👥 Zarządzanie Kontami Graczy",
			Value: "`/casino-user-create <nick> [id] [email] [saldo]` lub `!user create <nick>`\n" +
				"`/casino-user-setnick <stary_nick> <nowy_nick>` lub `!user setnick <stary> <nowy>`\n" +
				"`/casino-user-delete <gracz>` lub `!user delete <gracz>`\n" +
				"`/casino-users [szukaj]` lub `!users [szukaj]`",
			Inline: false,
		},
		{
			Name: "📊 Podgląd & Statystyki",
			Value: "`/gracz <identyfikator>` lub `!gracz <identyfikator>` — Pełny profil gracza, saldo i XP\n" +
				"`/top [kategoria]` lub `!top [lvl]` — Ranking majątku lub poziomów\n" +
				"`/statystyki` lub `!stats` — Statystyki platformy kasyna w czasie rzeczywistym\n" +
				"`/pomoc` lub `!pomoc` — Wyświetla ten panel pomocy",
			Inline: false,
		},
	}

	return &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       "👑 2FGT Kasyno — Konsola Administratora",
		Description: fmt.Sprintf("Wszystkie komendy są zastrzeżone **wyłącznie dla Administratorów Kasyna**.\nStrona kasyna: [**%s**](%s)", b.appURL, b.appURL),
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "2FGT Casino Core • System Zarządzania",
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

		actionTitle := "👑 [GLOBAL] Doładowano środki dla WSZYSTKICH graczy (*)"
		actionColor := ColorEmerald
		if amount < 0 {
			actionTitle = "👑 [GLOBAL] Odjęto środki od WSZYSTKICH graczy (*)"
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

	nick, prevBal, newBal, err := b.ledger.GrantBalance(ctx, identifier, amount, reason)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd operacji na środkach",
			Description: fmt.Sprintf("Nie udało się zaktualizować salda: **%v**", err),
		}
	}

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

		return &discordgo.MessageEmbed{
			Color: ColorEmerald,
			Title: "👑 [GLOBAL] Ustawiono jednakowe saldo dla WSZYSTKICH graczy (*)",
			Fields: []*discordgo.MessageEmbedField{
				{Name: "👥 Zaktualizowano kont", Value: fmt.Sprintf("**%d graczy**", count), Inline: true},
				{Name: "💰 Nowe saldo na konto", Value: fmt.Sprintf("**%s**", formatFGT(newBalance)), Inline: true},
				{Name: "📝 Powód", Value: reason, Inline: false},
			},
			Footer:    &discordgo.MessageEmbedFooter{Text: "Masowa modyfikacja kont (*) została pomyślnie zapisana"},
			Timestamp: time.Now().Format(time.RFC3339),
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

func (b *Bot) executeCreateUser(ctx context.Context, nick, userID, email string, initialBal int64) *discordgo.MessageEmbed {
	player, err := b.ledger.AdminCreateUser(ctx, userID, nick, email, initialBal)
	if err != nil {
		return &discordgo.MessageEmbed{
			Color:       ColorRose,
			Title:       "❌ Błąd tworzenia gracza",
			Description: fmt.Sprintf("Nie udało się utworzyć gracza: **%v**", err),
		}
	}

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

