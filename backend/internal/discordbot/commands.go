package discordbot

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

var adminPerms int64 = discordgo.PermissionAdministrator

var slashCommands = []*discordgo.ApplicationCommand{
	{
		Name:                     "casino-money-add",
		Description:              "👑 [ADMIN] Doładuj środki $FGT dla gracza lub wszystkich (*)",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "gracz",
				Description:  "Nick/ID gracza lub * (wszyscy zarejestrowani gracze)",
				Required:     true,
				Autocomplete: true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionInteger,
				Name:        "kwota",
				Description: "Liczba żetonów $FGT do dodania",
				Required:    true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "powod",
				Description: "Powód doładowania (zapisywany w historii)",
				Required:    false,
			},
		},
	},
	{
		Name:                     "casino-money-remove",
		Description:              "👑 [ADMIN] Odejmij środki $FGT z konta gracza lub wszystkich (*)",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "gracz",
				Description:  "Nick/ID gracza lub * (wszyscy zarejestrowani gracze)",
				Required:     true,
				Autocomplete: true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionInteger,
				Name:        "kwota",
				Description: "Liczba żetonów $FGT do odjęcia",
				Required:    true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "powod",
				Description: "Powód odjęcia",
				Required:    false,
			},
		},
	},
	{
		Name:                     "casino-money-set",
		Description:              "👑 [ADMIN] Ustaw dokładne saldo $FGT gracza lub wszystkich (*)",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "gracz",
				Description:  "Nick/ID gracza lub * (wszyscy zarejestrowani gracze)",
				Required:     true,
				Autocomplete: true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionInteger,
				Name:        "kwota",
				Description: "Nowa dokładna wartość salda",
				Required:    true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "powod",
				Description: "Powód zmiany",
				Required:    false,
			},
		},
	},
	{
		Name:                     "casino-user-create",
		Description:              "👑 [ADMIN] Utwórz nowe konto gracza w kasynie",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "nick",
				Description: "Nick nowego gracza",
				Required:    true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "user_id",
				Description: "Identyfikator użytkownika (opcjonalny)",
				Required:    false,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "email",
				Description: "Email (opcjonalny)",
				Required:    false,
			},
			{
				Type:        discordgo.ApplicationCommandOptionInteger,
				Name:        "poczatkowe_saldo",
				Description: "Początkowe saldo $FGT (domyślnie 1000)",
				Required:    false,
			},
		},
	},
	{
		Name:                     "casino-user-setnick",
		Description:              "👑 [ADMIN] Zmień nick istniejącego gracza",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "stary_identyfikator",
				Description:  "Wybierz gracza z listy lub wpisz stary nick/ID",
				Required:     true,
				Autocomplete: true,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "nowy_nick",
				Description: "Nowy nick dla gracza",
				Required:    true,
			},
		},
	},
	{
		Name:                     "casino-user-delete",
		Description:              "👑 [ADMIN] Usuń konto gracza z bazy danych",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "gracz",
				Description:  "Wybierz gracza z listy lub wpisz nick/ID",
				Required:     true,
				Autocomplete: true,
			},
		},
	},
	{
		Name:                     "casino-users",
		Description:              "👑 [ADMIN] Lista zarejestrowanych graczy w kasynie z menu wyboru",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "szukaj",
				Description:  "Filtr wyszukiwania po nicku, ID lub emailu",
				Required:     false,
				Autocomplete: true,
			},
		},
	},
	{
		Name:                     "gracz",
		Description:              "👑 [ADMIN] Szczegółowy profil gracza, historia i saldo",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "identyfikator",
				Description:  "Wybierz gracza z listy lub wpisz nick/ID",
				Required:     true,
				Autocomplete: true,
			},
		},
	},
	{
		Name:                     "top",
		Description:              "👑 [ADMIN] Wyświetla ranking graczy kasyna",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "kategoria",
				Description: "Kategoria rankingu (bogactwo lub poziom)",
				Required:    false,
				Choices: []*discordgo.ApplicationCommandOptionChoice{
					{Name: "💰 Bogactwo ($FGT)", Value: "balance"},
					{Name: "⭐ Poziom i Doświadczenie (LVL / XP)", Value: "level"},
				},
			},
		},
	},
	{
		Name:                     "statystyki",
		Description:              "👑 [ADMIN] Globalne statystyki platformy kasyna 2FGT",
		DefaultMemberPermissions: &adminPerms,
	},
	{
		Name:                     "pomoc",
		Description:              "👑 [ADMIN] Instrukcja i lista komend konsoli administratora",
		DefaultMemberPermissions: &adminPerms,
	},
	{
		Name:                     "casino-telemetry-sync",
		Description:              "📊 [ADMIN] Synchronizuj kategorię telemetrii i kanały wszystkich graczy na Discordzie",
		DefaultMemberPermissions: &adminPerms,
	},
	{
		Name:                     "casino-telemetry",
		Description:              "📊 [ADMIN] Utwórz lub zsynchronizuj kanał telemetrii dla wskazanego gracza",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "gracz",
				Description:  "Nick lub ID gracza",
				Required:     true,
				Autocomplete: true,
			},
		},
	},
}

func (b *Bot) registerSlashCommands() {
	if b.session.State == nil || b.session.State.User == nil {
		return
	}
	appID := b.session.State.User.ID
	guildID := b.cfg.DiscordGuildID

	if guildID != "" {
		// 1. Overwrite commands specifically for this guild (instant update in Discord)
		_, err := b.session.ApplicationCommandBulkOverwrite(appID, guildID, slashCommands)
		if err != nil {
			fmt.Printf("⚠️ [Discord Bot] Bulk overwrite na GuildID '%s': %v (używam Create fallback)\n", guildID, err)
			for _, cmd := range slashCommands {
				_, _ = b.session.ApplicationCommandCreate(appID, guildID, cmd)
			}
		} else {
			fmt.Printf("🤖 [Discord Bot] Zsynchronizowano %d komend Slash na GuildID '%s'\n", len(slashCommands), guildID)
		}

		// 2. Clear global commands so they don't duplicate on the same server
		_, _ = b.session.ApplicationCommandBulkOverwrite(appID, "", []*discordgo.ApplicationCommand{})
	} else {
		// 1. Overwrite commands globally
		_, err := b.session.ApplicationCommandBulkOverwrite(appID, "", slashCommands)
		if err != nil {
			fmt.Printf("⚠️ [Discord Bot] Global bulk overwrite: %v\n", err)
			for _, cmd := range slashCommands {
				_, _ = b.session.ApplicationCommandCreate(appID, "", cmd)
			}
		} else {
			fmt.Printf("🤖 [Discord Bot] Zsynchronizowano %d globalnych Slash Commands\n", len(slashCommands))
		}

		// 2. Clear any lingering guild-specific commands from cached guilds so no duplicates appear
		if b.session.State != nil {
			for _, g := range b.session.State.Guilds {
				_, _ = b.session.ApplicationCommandBulkOverwrite(appID, g.ID, []*discordgo.ApplicationCommand{})
			}
		}
	}
}

func getInteractionUserID(i *discordgo.InteractionCreate) string {
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User.ID
	}
	if i.User != nil {
		return i.User.ID
	}
	return ""
}

func (b *Bot) handleInteractionCreate(s *discordgo.Session, i *discordgo.InteractionCreate) {
	userID := getInteractionUserID(i)
	if !b.isAdmin(i.Member, userID) {
		b.respondInteractionError(s, i, "⛔ **Brak uprawnień:** Ten bot i jego komendy są dostępne wyłącznie dla administratorów kasyna.")
		return
	}

	switch i.Type {
	case discordgo.InteractionApplicationCommandAutocomplete:
		b.handleAutocomplete(s, i)
		return
	case discordgo.InteractionMessageComponent:
		b.handleComponentInteraction(s, i)
		return
	case discordgo.InteractionApplicationCommand:
		// Process application command below
	default:
		return
	}

	data := i.ApplicationCommandData()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch data.Name {
	case "gracz":
		target := ""
		for _, opt := range data.Options {
			if opt.Name == "identyfikator" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.buildPlayerProfileEmbed(ctx, target))

	case "top":
		category := "balance"
		for _, opt := range data.Options {
			if opt.Name == "kategoria" {
				category = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.buildLeaderboardEmbed(ctx, category))

	case "statystyki":
		b.respondInteraction(s, i, b.buildGlobalStatsEmbed(ctx))

	case "pomoc":
		b.respondInteraction(s, i, b.buildHelpEmbed(true))

	case "casino-money-add":
		var gracz, powod string
		var kwota int64
		for _, opt := range data.Options {
			if opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Doładowanie administratora (Discord)"
		}
		b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, kwota, powod))

	case "casino-money-remove":
		var gracz, powod string
		var kwota int64
		for _, opt := range data.Options {
			if opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Korekta salda (Discord)"
		}
		b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, -kwota, powod))

	case "casino-money-set":
		var gracz, powod string
		var kwota int64
		for _, opt := range data.Options {
			if opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Ręczne ustawienie salda (Discord)"
		}
		b.respondInteraction(s, i, b.executeSetMoney(ctx, gracz, kwota, powod))

	case "casino-user-create":
		var nick, userID, email string
		var initialBal int64 = 1000
		for _, opt := range data.Options {
			if opt.Name == "nick" {
				nick = opt.StringValue()
			} else if opt.Name == "user_id" {
				userID = opt.StringValue()
			} else if opt.Name == "email" {
				email = opt.StringValue()
			} else if opt.Name == "poczatkowe_saldo" {
				initialBal = opt.IntValue()
			}
		}
		b.respondInteraction(s, i, b.executeCreateUser(ctx, nick, userID, email, initialBal))

	case "casino-user-setnick":
		var oldIdent, newNick string
		for _, opt := range data.Options {
			if opt.Name == "stary_identyfikator" {
				oldIdent = opt.StringValue()
			} else if opt.Name == "nowy_nick" {
				newNick = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeSetNick(ctx, oldIdent, newNick))

	case "casino-user-delete":
		var target string
		for _, opt := range data.Options {
			if opt.Name == "gracz" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeDeleteUser(ctx, target))

	case "casino-users":
		search := ""
		for _, opt := range data.Options {
			if opt.Name == "szukaj" {
				search = opt.StringValue()
			}
		}
		embed := b.buildUsersListEmbed(ctx, search)
		comps := b.buildUsersSelectMenu(ctx, search)
		if len(comps) > 0 {
			b.respondInteractionWithComponents(s, i, embed, comps)
		} else {
			b.respondInteraction(s, i, embed)
		}

	case "casino-telemetry-sync":
		go func() {
			count, err := b.SyncAllUsers(context.Background())
			if err != nil {
				log.Printf("⚠️ [Discord Bot] Błąd synchronizacji telemetrii: %v", err)
			} else {
				log.Printf("📊 [Discord Bot] Zsynchronizowano telemetrię dla %d graczy", count)
			}
		}()
		b.respondInteraction(s, i, &discordgo.MessageEmbed{
			Color:       ColorSky,
			Title:       "📊 Rozpoczęto synchronizację kanałów telemetrii",
			Description: "Bot sprawdza kategorię **📊 telemetria** na serwerze i tworzy/aktualizuje kanały dla wszystkich graczy.",
			Footer:      &discordgo.MessageEmbedFooter{Text: "Operacja masowa wykonywana w tle"},
			Timestamp:   time.Now().Format(time.RFC3339),
		})

	case "casino-telemetry":
		target := ""
		for _, opt := range data.Options {
			if opt.Name == "gracz" {
				target = opt.StringValue()
			}
		}
		err := b.SyncUserTelemetry(ctx, &UserTelemetryReport{
			Nick:   target,
			UserID: target,
		})
		if err != nil {
			b.respondInteraction(s, i, &discordgo.MessageEmbed{
				Color:       ColorRose,
				Title:       "❌ Błąd synchronizacji telemetrii",
				Description: fmt.Sprintf("Nie udało się zaktualizować kanału telemetrii dla `%s`: %v", target, err),
			})
		} else {
			b.respondInteraction(s, i, &discordgo.MessageEmbed{
				Color:       ColorEmerald,
				Title:       "✅ Zsynchronizowano telemetrię gracza",
				Description: fmt.Sprintf("Kanał telemetrii gracza **%s** w kategorii **📊 telemetria** został zaktualizowany.", target),
			})
		}
	}
}

func (b *Bot) handleAutocomplete(s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.ApplicationCommandData()
	var currentVal string
	for _, opt := range data.Options {
		if opt.Focused {
			currentVal = opt.StringValue()
			break
		}
	}

	choices := []*discordgo.ApplicationCommandOptionChoice{}

	// If this is a money management command, always offer the wildcard * option
	if data.Name == "casino-money-add" || data.Name == "casino-money-remove" || data.Name == "casino-money-set" {
		choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
			Name:  "⭐ * (Wszyscy zarejestrowani gracze)",
			Value: "*",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	players, _, err := b.ledger.AdminListUsers(ctx, currentVal, 20, 0)
	if err == nil {
		for _, p := range players {
			name := fmt.Sprintf("%s (Saldo: %s | LVL %d)", p.Nick, formatFGT(p.Balance), p.Level)
			if len(name) > 100 {
				name = name[:97] + "..."
			}
			choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
				Name:  name,
				Value: p.Nick,
			})
		}
	}

	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionApplicationCommandAutocompleteResult,
		Data: &discordgo.InteractionResponseData{
			Choices: choices,
		},
	})
}

func (b *Bot) handleComponentInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.MessageComponentData()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if data.CustomID == "player_select_dropdown" && len(data.Values) > 0 {
		val := data.Values[0]
		targetNick := strings.TrimPrefix(val, "select_player:")
		embed := b.buildPlayerProfileEmbed(ctx, targetNick)

		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Embeds: []*discordgo.MessageEmbed{embed},
				Flags:  discordgo.MessageFlagsEphemeral,
			},
		})
	}
}

func (b *Bot) respondInteraction(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) {
	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: []*discordgo.MessageEmbed{embed},
		},
	})
	if err != nil {
		// Fallback: send as direct channel message so command outcome is never lost
		_, _ = s.ChannelMessageSendEmbed(i.ChannelID, embed)
	}
}

func (b *Bot) respondInteractionWithComponents(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed, components []discordgo.MessageComponent) {
	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
		},
	})
	if err != nil {
		_, _ = s.ChannelMessageSendComplex(i.ChannelID, &discordgo.MessageSend{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
		})
	}
}

func (b *Bot) respondInteractionError(s *discordgo.Session, i *discordgo.InteractionCreate, msg string) {
	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Flags:   discordgo.MessageFlagsEphemeral,
			Content: msg,
		},
	})
	if err != nil {
		_, _ = s.ChannelMessageSend(i.ChannelID, msg)
	}
}

func (b *Bot) handleMessageCreate(s *discordgo.Session, m *discordgo.MessageCreate) {
	if m.Author == nil || m.Author.Bot {
		return
	}

	content := strings.TrimSpace(m.Content)
	if !strings.HasPrefix(content, "!") {
		return
	}

	// Restrict bot usage exclusively to admins
	if !b.isAdmin(m.Member, m.Author.ID) {
		return
	}

	parts := strings.Fields(content)
	if len(parts) == 0 {
		return
	}

	cmd := strings.ToLower(parts[0])
	args := parts[1:]
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch cmd {
	case "!gracz", "!profil", "!userinfo":
		if len(args) == 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!gracz <nick_lub_id>`")
			return
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildPlayerProfileEmbed(ctx, args[0]))

	case "!top", "!ranking", "!leaderboard":
		cat := "balance"
		if len(args) > 0 && (args[0] == "lvl" || args[0] == "level" || args[0] == "xp" || args[0] == "poziom") {
			cat = "level"
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildLeaderboardEmbed(ctx, cat))

	case "!stats", "!statystyki", "!kasyno-stats":
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildGlobalStatsEmbed(ctx))

	case "!pomoc", "!casino-help", "!admin":
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildHelpEmbed(true))

	case "!casino":
		if len(args) == 0 || args[0] == "help" {
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildHelpEmbed(true))
			return
		}
		sub := strings.ToLower(args[0])
		switch sub {
		case "stats":
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildGlobalStatsEmbed(ctx))
		case "top":
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildLeaderboardEmbed(ctx, "balance"))
		default:
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildHelpEmbed(true))
		}

	case "!users", "!lista":
		search := ""
		if len(args) > 0 {
			search = args[0]
		}
		embed := b.buildUsersListEmbed(ctx, search)
		comps := b.buildUsersSelectMenu(ctx, search)
		if len(comps) > 0 {
			msgSend := &discordgo.MessageSend{
				Embeds:     []*discordgo.MessageEmbed{embed},
				Components: comps,
			}
			_, _ = s.ChannelMessageSendComplex(m.ChannelID, msgSend)
		} else {
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, embed)
		}

	// Shorthand commands: !give <gracz|*> <kwota> [powód]
	case "!give", "!grant", "!addmoney":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `"+cmd+" <gracz|*> <kwota> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.ParseInt(args[1], 10, 64)
		if err != nil {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna kwota $FGT.")
			return
		}
		reason := "Doładowanie administratora (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMoney(ctx, target, val, reason))

	// Shorthand commands: !take <gracz|*> <kwota> [powód]
	case "!take", "!removemoney":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `"+cmd+" <gracz|*> <kwota> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.ParseInt(args[1], 10, 64)
		if err != nil {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna kwota $FGT.")
			return
		}
		reason := "Korekta salda (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMoney(ctx, target, -val, reason))

	// Shorthand commands: !setmoney <gracz|*> <kwota> [powód]
	case "!setmoney":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!setmoney <gracz|*> <kwota> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.ParseInt(args[1], 10, 64)
		if err != nil {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna kwota $FGT.")
			return
		}
		reason := "Ręczne ustawienie salda (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeSetMoney(ctx, target, val, reason))

	case "!user", "!money":
		var subArgs []string
		if cmd == "!money" {
			subArgs = args
		} else {
			if len(args) == 0 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user <money|create|setnick|delete|info>`")
				return
			}
			sub := strings.ToLower(args[0])
			if sub != "money" {
				switch sub {
				case "create":
					if len(args) < 2 {
						_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user create <nick> [id] [email] [poczatkowe_saldo]`")
						return
					}
					nick := args[1]
					var uid, email string
					var initBal int64 = 1000
					if len(args) > 2 {
						uid = args[2]
					}
					if len(args) > 3 {
						email = args[3]
					}
					if len(args) > 4 {
						if b, err := strconv.ParseInt(args[4], 10, 64); err == nil {
							initBal = b
						}
					}
					_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeCreateUser(ctx, nick, uid, email, initBal))
					return

				case "setnick":
					if len(args) < 3 {
						_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user setnick <stary_nick_lub_id> <nowy_nick>`")
						return
					}
					_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeSetNick(ctx, args[1], args[2]))
					return

				case "delete":
					if len(args) < 2 {
						_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user delete <gracz>`")
						return
					}
					_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeDeleteUser(ctx, args[1]))
					return

				case "info":
					if len(args) < 2 {
						_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user info <gracz>`")
						return
					}
					_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildPlayerProfileEmbed(ctx, args[1]))
					return

				default:
					_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Nieznana podkomenda `!user`. Dostępne: `money`, `create`, `setnick`, `delete`, `info`.")
					return
				}
			}
			subArgs = args[1:]
		}

		// Handle money management with flexible argument ordering:
		// Syntax A: !user money <gracz|*> <add|remove|set> <kwota> [powód]
		// Syntax B: !user money <add|remove|set> <gracz|*> <kwota> [powód]
		if len(subArgs) < 3 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user money <gracz|*> <add|remove|set> <kwota> [powód]`\nlub `!give <gracz|*> <kwota>`")
			return
		}

		var target, action string
		var valStr string
		var reasonIdx int

		firstLower := strings.ToLower(subArgs[0])
		if firstLower == "add" || firstLower == "+" || firstLower == "remove" || firstLower == "sub" || firstLower == "-" || firstLower == "set" || firstLower == "=" {
			// Syntax B: action target val
			action = firstLower
			target = subArgs[1]
			valStr = subArgs[2]
			reasonIdx = 3
		} else {
			// Syntax A: target action val
			target = subArgs[0]
			action = strings.ToLower(subArgs[1])
			valStr = subArgs[2]
			reasonIdx = 3
		}

		val, err := strconv.ParseInt(valStr, 10, 64)
		if err != nil {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna kwota $FGT.")
			return
		}

		reason := "Zarządzanie kontem (Discord)"
		if len(subArgs) > reasonIdx {
			reason = strings.Join(subArgs[reasonIdx:], " ")
		}

		switch action {
		case "add", "+":
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMoney(ctx, target, val, reason))
		case "remove", "sub", "-":
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMoney(ctx, target, -val, reason))
		case "set", "=":
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeSetMoney(ctx, target, val, reason))
		default:
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Nieznana akcja: użyj `add`, `remove` lub `set`.")
		}
	}
}
