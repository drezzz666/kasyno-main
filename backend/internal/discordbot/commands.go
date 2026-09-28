package discordbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/scheduler"
	"github.com/drezzz666/kasyno/backend/internal/ws"
)

var adminPerms int64 = discordgo.PermissionAdministrator

var slashCommands = []*discordgo.ApplicationCommand{
	{
		Name:                     "musordrop",
		Description:              "Zarządzaj skrzynkami i limitami Musor Drop (Lepsze, Plebs, Arystokracja)",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "add",
				Description: "Dodaj skrzynki Musor Drop (Lepsze) graczowi, liście graczy lub wszystkim (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Nick/ID gracza, lista po przecinku lub * (wszyscy)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Liczba skrzynek do dodania",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Powód przyznania skrzynek",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "remove",
				Description: "Odbierz skrzynki Musor Drop od gracza, listy graczy lub wszystkich (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Nick/ID gracza, lista po przecinku lub * (wszyscy)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Liczba skrzynek do odebrania",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Powód odebrania skrzynek",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "set",
				Description: "Ustaw dokładną liczbę skrzynek Musor Drop dla gracza, listy lub wszystkich (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Nick/ID gracza, lista po przecinku lub * (wszyscy)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Nowa dokładna liczba skrzynek Lepszych",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Powód zmiany",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "reset",
				Description: "Zresetuj dzienne limity otwarcia skrzynek Musor Drop dla gracza lub wszystkich (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Nick/ID gracza lub * (wszyscy gracze)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "box_type",
						Description: "Typ skrzynki do zresetowania limitu",
						Required:    false,
						Choices: []*discordgo.ApplicationCommandOptionChoice{
							{Name: "📦 Wszystkie dzienne (Plebsowa + Arystokracka)", Value: "all"},
							{Name: "🪵 Plebsowa (Darmowa)", Value: "plebs"},
							{Name: "👑 Arystokracka (Płatna 500 ₽)", Value: "arystokracja"},
						},
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "info",
				Description: "Sprawdź stan skrzynek i dziennych limitów gracza",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Nick/ID gracza",
						Required:     true,
						Autocomplete: true,
					},
				},
			},
		},
	},
	{
		Name:                     "money",
		Description:              "Manage player $FGT token balances",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "add",
				Description: "Add $FGT tokens to player account or all (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Player username/ID or * (all registered players)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Number of $FGT tokens to add",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Reason for grant (saved in history)",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "remove",
				Description: "Remove $FGT tokens from player account or all (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Player username/ID or * (all registered players)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Number of $FGT tokens to remove",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Reason for deduction",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "set",
				Description: "Set exact $FGT token balance for player or all (*)",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Player username/ID or * (all registered players)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "New exact balance amount",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Reason for change",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "revert",
				Description: "Rollback player balances and delete records back to a date and time with seconds",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Player username/ID, comma-separated list, or * (all players)",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "date",
						Description: "Date to rollback to (e.g. 24-09-2026, 2026-09-24, 24.09.2026, or 'today')",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "time",
						Description: "Time with seconds (e.g. 15:30:00, 14:05:30, or 12:00:00)",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Reason for rollback",
						Required:    false,
					},
				},
			},
		},
	},
	{
		Name:                     "user",
		Description:              "Manage player accounts and profiles",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "create",
				Description: "Create a new casino player account",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "nickname",
						Description: "Nickname for new player",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "user_id",
						Description: "User ID (optional)",
						Required:    false,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "email",
						Description: "Email address (optional)",
						Required:    false,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "initial_balance",
						Description: "Initial $FGT balance (default 1000)",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "setnick",
				Description: "Change nickname for an existing player",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Select player from list or enter old nick/ID",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "new_nickname",
						Description: "New nickname for player",
						Required:    true,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "delete",
				Description: "Delete player account from database",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "player",
						Description:  "Select player from list or enter nick/ID",
						Required:     true,
						Autocomplete: true,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "list",
				Description: "List registered casino players with interactive menu",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "search",
						Description:  "Search filter by nickname, ID, or email",
						Required:     false,
						Autocomplete: true,
					},
				},
			},
		},
	},
	{
		Name:                     "schedule",
		Description:              "Manage automated recurring $FGT drops",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "add",
				Description: "Schedule automated recurring $FGT drops",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "name",
						Description: "Task name (e.g. Friday Drop, Weekend Bonus)",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionInteger,
						Name:        "amount",
						Description: "Number of $FGT tokens per player",
						Required:    true,
					},
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "players",
						Description:  "Recipients: * (all) or comma-separated list",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "day_of_week",
						Description: "Execution day of week (ignored if cron is set)",
						Required:    false,
						Choices: []*discordgo.ApplicationCommandOptionChoice{
							{Name: "📅 Daily (Every day)", Value: "Codziennie"},
							{Name: "📅 Monday", Value: "Poniedziałek"},
							{Name: "📅 Tuesday", Value: "Wtorek"},
							{Name: "📅 Wednesday", Value: "Środa"},
							{Name: "📅 Thursday", Value: "Czwartek"},
							{Name: "📅 Friday", Value: "Piątek"},
							{Name: "📅 Saturday", Value: "Sobota"},
							{Name: "📅 Sunday", Value: "Niedziela"},
						},
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "time_of_day",
						Description: "Execution time in HH:MM format (e.g. 18:00 or 20:30)",
						Required:    false,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "cron",
						Description: "Custom cron expression (e.g. 0 20 * * 5) - overrides day/time",
						Required:    false,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "type",
						Description: "Typ nagrody: $FGT Waluta lub Skrzynki Musor Drop (Lepsze)",
						Required:    false,
						Choices: []*discordgo.ApplicationCommandOptionChoice{
							{Name: "💰 $FGT Waluta", Value: "money"},
							{Name: "📦 Skrzynki Musor Drop (Lepsze)", Value: "musordrop"},
						},
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "reason",
						Description: "Reason for grant (saved in history)",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "list",
				Description: "List all scheduled automatic $FGT drops",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "filter",
						Description: "Filter list by name, recipients, or ID",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "remove",
				Description: "Delete a scheduled automatic $FGT drop",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "identifier",
						Description:  "Select task from list or enter ID",
						Required:     true,
						Autocomplete: true,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "toggle",
				Description: "Enable or disable a scheduled $FGT drop",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "identifier",
						Description:  "Select task from list or enter ID",
						Required:     true,
						Autocomplete: true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionBoolean,
						Name:        "active",
						Description: "Enable (True) or Disable (False)",
						Required:    true,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "run",
				Description: "Run a scheduled drop immediately in test mode",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:         discordgo.ApplicationCommandOptionString,
						Name:         "identifier",
						Description:  "Select task from list or enter ID to execute immediately",
						Required:     true,
						Autocomplete: true,
					},
				},
			},
		},
	},
	{
		Name:                     "player",
		Description:              "View detailed player profile, balance, XP and history",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "identifier",
				Description:  "Select player from list or enter nick/ID",
				Required:     true,
				Autocomplete: true,
			},
		},
	},
	{
		Name:                     "leaderboard",
		Description:              "Display casino leaderboard rankings",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "category",
				Description: "Leaderboard category (wealth or level)",
				Required:    false,
				Choices: []*discordgo.ApplicationCommandOptionChoice{
					{Name: "💰 Wealth ($FGT)", Value: "balance"},
					{Name: "⭐ Level & XP", Value: "level"},
				},
			},
		},
	},
	{
		Name:                     "stats",
		Description:              "Global real-time casino platform statistics",
		DefaultMemberPermissions: &adminPerms,
	},
	{
		Name:                     "event",
		Description:              "Zarządzaj wydarzeniami na żywo w kasynie (np. Money Rain)",
		DefaultMemberPermissions: &adminPerms,
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "start",
				Description: "Uruchom wydarzenie na żywo (np. Money Rain) dla wszystkich graczy",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "name",
						Description: "Nazwa wydarzenia (np. money-rain)",
						Required:    true,
						Choices: []*discordgo.ApplicationCommandOptionChoice{
							{
								Name:  "Money Rain (Deszcz Kasy)",
								Value: "money-rain",
							},
						},
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "duration",
						Description: "Czas trwania (np. 60s, 10m, 1h, domyślnie: 60s)",
						Required:    false,
					},
					{
						Type:        discordgo.ApplicationCommandOptionNumber,
						Name:        "multiplier",
						Description: "Mnożnik bonusowy wygranych (np. 1.25 = +25% do wygranych, domyślnie: 1.25)",
						Required:    false,
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "stop",
				Description: "Zatrzymaj aktualnie trwające wydarzenie",
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "name",
						Description: "Nazwa wydarzenia do zatrzymania",
						Required:    true,
						Choices: []*discordgo.ApplicationCommandOptionChoice{
							{
								Name:  "Money Rain (Deszcz Kasy)",
								Value: "money-rain",
							},
						},
					},
				},
			},
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "status",
				Description: "Sprawdź status aktualnego wydarzenia na żywo",
			},
		},
	},
	{
		Name:                     "help",
		Description:              "Show command guide and help documentation",
		DefaultMemberPermissions: &adminPerms,
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

func parseInteractionCommand(data discordgo.ApplicationCommandInteractionData) (cmd string, subCmd string, options []*discordgo.ApplicationCommandInteractionDataOption) {
	cmd = data.Name
	options = data.Options
	if len(data.Options) > 0 && data.Options[0].Type == discordgo.ApplicationCommandOptionSubCommand {
		subCmd = data.Options[0].Name
		options = data.Options[0].Options
	}
	return
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
	cmd, subCmd, options := parseInteractionCommand(data)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch cmd {
	case "event", "wydarzenie":
		b.handleEventCommand(s, i, subCmd, options)

	case "player", "gracz":
		target := ""
		for _, opt := range options {
			if opt.Name == "identifier" || opt.Name == "identyfikator" || opt.Name == "player" || opt.Name == "gracz" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.buildPlayerProfileEmbed(ctx, target))

	case "leaderboard", "top":
		category := "balance"
		for _, opt := range options {
			if opt.Name == "category" || opt.Name == "kategoria" {
				category = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.buildLeaderboardEmbed(ctx, category))

	case "stats", "statystyki":
		b.respondInteraction(s, i, b.buildGlobalStatsEmbed(ctx))

	case "musordrop", "musor", "skrzynki", "casino-grant-musordrop", "grant-musordrop", "grantmusor", "casino-reset-musordrop", "reset-musordrop", "resetmusor":
		var gracz, boxType, powod string
		var kwota int64
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" || opt.Name == "identifier" {
				gracz = opt.StringValue()
			} else if opt.Name == "amount" || opt.Name == "kwota" || opt.Name == "ilosc" {
				kwota = opt.IntValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			} else if opt.Name == "box_type" || opt.Name == "skrzynka" || opt.Name == "type" {
				boxType = opt.StringValue()
			}
		}

		if subCmd == "" {
			if strings.Contains(cmd, "reset") {
				subCmd = "reset"
			} else if strings.Contains(cmd, "grant") {
				subCmd = "add"
			}
		}

		switch subCmd {
		case "add":
			if powod == "" {
				powod = "Admin Musor Drop Grant (Discord)"
			}
			b.respondInteraction(s, i, b.executeGrantMusorDrop(ctx, gracz, int(kwota), powod))
		case "remove":
			if powod == "" {
				powod = "Admin Musor Drop Deduction (Discord)"
			}
			val := int(kwota)
			if val > 0 {
				val = -val
			}
			b.respondInteraction(s, i, b.executeGrantMusorDrop(ctx, gracz, val, powod))
		case "set":
			if powod == "" {
				powod = "Admin Musor Drop Set (Discord)"
			}
			b.respondInteraction(s, i, b.executeSetMusorDrop(ctx, gracz, int(kwota), powod))
		case "reset":
			b.respondInteraction(s, i, b.executeResetMusorDrop(ctx, gracz, boxType))
		case "info", "stan", "check":
			b.respondInteraction(s, i, b.executeMusorDropInfo(ctx, gracz))
		default:
			if kwota != 0 {
				b.respondInteraction(s, i, b.executeGrantMusorDrop(ctx, gracz, int(kwota), powod))
			} else if gracz != "" {
				b.respondInteraction(s, i, b.executeMusorDropInfo(ctx, gracz))
			} else {
				b.respondInteraction(s, i, b.buildHelpEmbed(true))
			}
		}

	case "help", "pomoc":
		b.respondInteraction(s, i, b.buildHelpEmbed(true))

	case "money":
		var gracz, dateStr, timeStr, until, powod string
		var kwota int64
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "amount" || opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "date" || opt.Name == "data" {
				dateStr = opt.StringValue()
			} else if opt.Name == "time" || opt.Name == "godzina" || opt.Name == "czas" {
				timeStr = opt.StringValue()
			} else if opt.Name == "until" || opt.Name == "do" {
				until = opt.StringValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		switch subCmd {
		case "add":
			if powod == "" {
				powod = "Admin Grant (Discord)"
			}
			b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, kwota, powod))
		case "remove":
			if powod == "" {
				powod = "Balance Correction (Discord)"
			}
			b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, -kwota, powod))
		case "set":
			if powod == "" {
				powod = "Set Balance (Discord)"
			}
			b.respondInteraction(s, i, b.executeSetMoney(ctx, gracz, kwota, powod))
		case "revert":
			targetTimeInput := until
			if dateStr != "" && timeStr != "" {
				targetTimeInput = dateStr + " " + timeStr
			} else if dateStr != "" {
				targetTimeInput = dateStr
			} else if timeStr != "" {
				targetTimeInput = timeStr
			}
			b.respondInteraction(s, i, b.executeRevertMoney(ctx, gracz, targetTimeInput, powod))
		}

	case "money-revert", "revert":
		var gracz, dateStr, timeStr, until, powod string
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "date" || opt.Name == "data" {
				dateStr = opt.StringValue()
			} else if opt.Name == "time" || opt.Name == "godzina" || opt.Name == "czas" {
				timeStr = opt.StringValue()
			} else if opt.Name == "until" || opt.Name == "do" {
				until = opt.StringValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		targetTimeInput := until
		if dateStr != "" && timeStr != "" {
			targetTimeInput = dateStr + " " + timeStr
		} else if dateStr != "" {
			targetTimeInput = dateStr
		} else if timeStr != "" {
			targetTimeInput = timeStr
		}
		b.respondInteraction(s, i, b.executeRevertMoney(ctx, gracz, targetTimeInput, powod))

	case "money-add", "dodaj-kase", "casino-money-add":
		var gracz, powod string
		var kwota int64
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "amount" || opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Admin Grant (Discord)"
		}
		b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, kwota, powod))

	case "money-remove", "zabierz-kase", "casino-money-remove":
		var gracz, powod string
		var kwota int64
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "amount" || opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Balance Correction (Discord)"
		}
		b.respondInteraction(s, i, b.executeGrantMoney(ctx, gracz, -kwota, powod))

	case "money-set", "ustaw-kase", "casino-money-set":
		var gracz, powod string
		var kwota int64
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				gracz = opt.StringValue()
			} else if opt.Name == "amount" || opt.Name == "kwota" {
				kwota = opt.IntValue()
			} else if opt.Name == "reason" || opt.Name == "powod" {
				powod = opt.StringValue()
			}
		}
		if powod == "" {
			powod = "Set Balance (Discord)"
		}
		b.respondInteraction(s, i, b.executeSetMoney(ctx, gracz, kwota, powod))

	case "user":
		switch subCmd {
		case "create":
			var nick, userID, email string
			var initialBal int64 = 1000
			for _, opt := range options {
				if opt.Name == "nickname" || opt.Name == "nick" {
					nick = opt.StringValue()
				} else if opt.Name == "user_id" {
					userID = opt.StringValue()
				} else if opt.Name == "email" {
					email = opt.StringValue()
				} else if opt.Name == "initial_balance" || opt.Name == "poczatkowe_saldo" {
					initialBal = opt.IntValue()
				}
			}
			b.respondInteraction(s, i, b.executeCreateUser(ctx, nick, userID, email, initialBal))
		case "setnick":
			var oldIdent, newNick string
			for _, opt := range options {
				if opt.Name == "player" || opt.Name == "stary_identyfikator" {
					oldIdent = opt.StringValue()
				} else if opt.Name == "new_nickname" || opt.Name == "nowy_nick" {
					newNick = opt.StringValue()
				}
			}
			b.respondInteraction(s, i, b.executeSetNick(ctx, oldIdent, newNick))
		case "delete":
			var target string
			for _, opt := range options {
				if opt.Name == "player" || opt.Name == "gracz" {
					target = opt.StringValue()
				}
			}
			b.respondInteraction(s, i, b.executeDeleteUser(ctx, target))
		case "list":
			search := ""
			for _, opt := range options {
				if opt.Name == "search" || opt.Name == "szukaj" {
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
		}

	case "user-create", "dodaj-gracza", "casino-user-create":
		var nick, userID, email string
		var initialBal int64 = 1000
		for _, opt := range options {
			if opt.Name == "nickname" || opt.Name == "nick" {
				nick = opt.StringValue()
			} else if opt.Name == "user_id" {
				userID = opt.StringValue()
			} else if opt.Name == "email" {
				email = opt.StringValue()
			} else if opt.Name == "initial_balance" || opt.Name == "poczatkowe_saldo" {
				initialBal = opt.IntValue()
			}
		}
		b.respondInteraction(s, i, b.executeCreateUser(ctx, nick, userID, email, initialBal))

	case "user-setnick", "zmien-nick", "casino-user-setnick":
		var oldIdent, newNick string
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "stary_identyfikator" {
				oldIdent = opt.StringValue()
			} else if opt.Name == "new_nickname" || opt.Name == "nowy_nick" {
				newNick = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeSetNick(ctx, oldIdent, newNick))

	case "user-delete", "usun-gracza", "casino-user-delete":
		var target string
		for _, opt := range options {
			if opt.Name == "player" || opt.Name == "gracz" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeDeleteUser(ctx, target))

	case "users", "gracze", "casino-users":
		search := ""
		for _, opt := range options {
			if opt.Name == "search" || opt.Name == "szukaj" {
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

	case "schedule":
		switch subCmd {
		case "add":
			var nazwa, gracze, dzien, godzina, customCron, powod, typ string
			var kwota int64
			for _, opt := range options {
				switch opt.Name {
				case "name", "nazwa":
					nazwa = opt.StringValue()
				case "amount", "kwota":
					kwota = opt.IntValue()
				case "players", "gracze":
					gracze = opt.StringValue()
				case "type", "typ", "grant_type":
					typ = opt.StringValue()
				case "day_of_week", "dzien_tygodnia":
					dzien = opt.StringValue()
				case "time_of_day", "godzina":
					godzina = opt.StringValue()
				case "cron":
					customCron = opt.StringValue()
				case "reason", "powod":
					powod = opt.StringValue()
				}
			}
			createdBy := userID
			if i.Member != nil && i.Member.User != nil {
				createdBy = i.Member.User.Username
			}
			params := scheduler.CreateGrantParams{
				Name:        nazwa,
				TargetUsers: gracze,
				Amount:      kwota,
				GrantType:   typ,
				Reason:      powod,
				DayOfWeek:   dzien,
				TimeOfDay:   godzina,
				CustomCron:  customCron,
				CreatedBy:   createdBy,
			}
			b.respondInteraction(s, i, b.executeScheduleAdd(ctx, params))
		case "list":
			filtr := ""
			for _, opt := range options {
				if opt.Name == "filter" || opt.Name == "filtr" {
					filtr = opt.StringValue()
				}
			}
			b.respondInteraction(s, i, b.buildScheduledGrantsListEmbed(ctx, filtr))
		case "remove":
			var target string
			for _, opt := range options {
				if opt.Name == "identifier" || opt.Name == "identyfikator" {
					target = opt.StringValue()
				}
			}
			b.respondInteraction(s, i, b.executeScheduleRemove(ctx, target))
		case "toggle":
			var target string
			var active bool = true
			for _, opt := range options {
				if opt.Name == "identifier" || opt.Name == "identyfikator" {
					target = opt.StringValue()
				} else if opt.Name == "active" || opt.Name == "aktywny" {
					active = opt.BoolValue()
				}
			}
			b.respondInteraction(s, i, b.executeScheduleToggle(ctx, target, active))
		case "run":
			var target string
			for _, opt := range options {
				if opt.Name == "identifier" || opt.Name == "identyfikator" {
					target = opt.StringValue()
				}
			}
			b.respondInteraction(s, i, b.executeScheduleRun(ctx, target))
		}

	case "schedule-add", "dodaj-zrzut", "casino-schedule-add":
		var nazwa, gracze, dzien, godzina, customCron, powod, typ string
		var kwota int64
		for _, opt := range options {
			switch opt.Name {
			case "name", "nazwa":
				nazwa = opt.StringValue()
			case "amount", "kwota":
				kwota = opt.IntValue()
			case "players", "gracze":
				gracze = opt.StringValue()
			case "type", "typ", "grant_type":
				typ = opt.StringValue()
			case "day_of_week", "dzien_tygodnia":
				dzien = opt.StringValue()
			case "time_of_day", "godzina":
				godzina = opt.StringValue()
			case "cron":
				customCron = opt.StringValue()
			case "reason", "powod":
				powod = opt.StringValue()
			}
		}
		createdBy := userID
		if i.Member != nil && i.Member.User != nil {
			createdBy = i.Member.User.Username
		}
		params := scheduler.CreateGrantParams{
			Name:        nazwa,
			TargetUsers: gracze,
			Amount:      kwota,
			GrantType:   typ,
			Reason:      powod,
			DayOfWeek:   dzien,
			TimeOfDay:   godzina,
			CustomCron:  customCron,
			CreatedBy:   createdBy,
		}
		b.respondInteraction(s, i, b.executeScheduleAdd(ctx, params))

	case "schedules", "zrzuty", "casino-schedule-list":
		filtr := ""
		for _, opt := range options {
			if opt.Name == "filter" || opt.Name == "filtr" {
				filtr = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.buildScheduledGrantsListEmbed(ctx, filtr))

	case "schedule-remove", "usun-zrzut", "casino-schedule-remove":
		var target string
		for _, opt := range options {
			if opt.Name == "identifier" || opt.Name == "identyfikator" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeScheduleRemove(ctx, target))

	case "schedule-toggle", "przelacz-zrzut", "casino-schedule-toggle":
		var target string
		var active bool = true
		for _, opt := range options {
			if opt.Name == "identifier" || opt.Name == "identyfikator" {
				target = opt.StringValue()
			} else if opt.Name == "active" || opt.Name == "aktywny" {
				active = opt.BoolValue()
			}
		}
		b.respondInteraction(s, i, b.executeScheduleToggle(ctx, target, active))

	case "schedule-run", "odpal-zrzut", "casino-schedule-run":
		var target string
		for _, opt := range options {
			if opt.Name == "identifier" || opt.Name == "identyfikator" {
				target = opt.StringValue()
			}
		}
		b.respondInteraction(s, i, b.executeScheduleRun(ctx, target))
	}
}

func (b *Bot) handleAutocomplete(s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.ApplicationCommandData()
	cmd, _, options := parseInteractionCommand(data)
	var currentVal string
	var focusedOptName string
	for _, opt := range options {
		if opt.Focused {
			currentVal = opt.StringValue()
			focusedOptName = opt.Name
			break
		}
	}

	choices := []*discordgo.ApplicationCommandOptionChoice{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	isScheduleCmd := cmd == "schedule" || strings.Contains(cmd, "zrzut") || strings.Contains(cmd, "schedule") || cmd == "schedules"
	if isScheduleCmd && (focusedOptName == "identifier" || focusedOptName == "identyfikator") {
		if b.scheduler != nil {
			grants, err := b.scheduler.ListGrants(ctx)
			if err == nil {
				for _, g := range grants {
					if currentVal != "" && !strings.Contains(strings.ToLower(g.Name), strings.ToLower(currentVal)) && !strings.HasPrefix(g.ID, currentVal) {
						continue
					}
					status := "Active"
					if !g.Enabled {
						status = "Disabled"
					}
					choiceName := fmt.Sprintf("%s (+%s | %s)", g.Name, formatFGT(g.Amount), status)
					if len(choiceName) > 100 {
						choiceName = choiceName[:97] + "..."
					}
					choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
						Name:  choiceName,
						Value: g.ID,
					})
					if len(choices) >= 25 {
						break
					}
				}
			}
		}

		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionApplicationCommandAutocompleteResult,
			Data: &discordgo.InteractionResponseData{
				Choices: choices,
			},
		})
		return
	}

	// Multi-player autocomplete support:
	// If currentVal contains commas (e.g. "gracz1, gra"), preserve already chosen players and autocomplete next
	var prefix string
	var searchToken string
	selectedNicks := make(map[string]bool)

	if strings.Contains(currentVal, ",") {
		parts := strings.Split(currentVal, ",")
		var cleanedParts []string
		for i := 0; i < len(parts)-1; i++ {
			trimmed := strings.TrimSpace(parts[i])
			if trimmed != "" {
				selectedNicks[strings.ToLower(trimmed)] = true
				cleanedParts = append(cleanedParts, trimmed)
			}
		}
		if len(cleanedParts) > 0 {
			prefix = strings.Join(cleanedParts, ", ") + ", "
		}
		searchToken = strings.TrimSpace(parts[len(parts)-1])
	} else {
		searchToken = strings.TrimSpace(currentVal)
	}

	// If this is a money/musordrop management command and no multiple players selected yet, offer wildcard * option
	if len(selectedNicks) == 0 {
		isPlayerWildcardCmd := cmd == "money" || strings.HasPrefix(cmd, "money-") || strings.Contains(cmd, "kase") || strings.Contains(cmd, "grant") || strings.Contains(cmd, "reset") || strings.Contains(cmd, "musor")
		if (isPlayerWildcardCmd && (focusedOptName == "player" || focusedOptName == "gracz")) ||
			((cmd == "schedule" || strings.Contains(cmd, "schedule") || strings.Contains(cmd, "zrzut")) && (focusedOptName == "players" || focusedOptName == "gracze")) {
			choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
				Name:  "⭐ * (All registered players)",
				Value: "*",
			})
		}
	}

	// Use fast in-memory cache
	cachedPlayers := b.getCachedPlayers(ctx)
	searchLower := strings.ToLower(searchToken)

	for _, p := range cachedPlayers {
		if selectedNicks[strings.ToLower(p.Nick)] || selectedNicks[strings.ToLower(p.UserID)] {
			continue // Skip already chosen players in multi-select
		}

		if searchLower != "" &&
			!strings.Contains(strings.ToLower(p.Nick), searchLower) &&
			!strings.Contains(strings.ToLower(p.UserID), searchLower) {
			continue
		}

		choiceVal := prefix + p.Nick
		var choiceName string
		if len(selectedNicks) > 0 {
			choiceName = fmt.Sprintf("➕ %s (Saldo: %s | LVL %d) [Wybrano: %d]", p.Nick, formatFGT(p.Balance), p.Level, len(selectedNicks)+1)
		} else {
			choiceName = fmt.Sprintf("%s (Saldo: %s | LVL %d)", p.Nick, formatFGT(p.Balance), p.Level)
		}

		if len(choiceName) > 100 {
			choiceName = choiceName[:97] + "..."
		}
		if len(choiceVal) > 100 {
			choiceVal = choiceVal[:100]
		}

		choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
			Name:  choiceName,
			Value: choiceVal,
		})

		if len(choices) >= 25 {
			break
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

	// Shorthand commands: !revert <gracz|*> <data_lub_czas> [powód]
	case "!revert", "!rollback", "!cofnij":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!revert <gracz|*> <godzina_lub_data> [powód]`\nPrzykłady: `!revert * 15:30`, `!revert gracz1 2026-09-24 14:00`, `!revert * 1h`")
			return
		}
		target := args[0]
		untilStr := args[1]
		reason := "Cofnięcie transakcji (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeRevertMoney(ctx, target, untilStr, reason))

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

		if len(subArgs) > 0 && (strings.ToLower(subArgs[0]) == "revert" || (len(subArgs) > 1 && strings.ToLower(subArgs[1]) == "revert")) {
			var target, untilStr, reason string
			if strings.ToLower(subArgs[0]) == "revert" && len(subArgs) >= 3 {
				target = subArgs[1]
				untilStr = subArgs[2]
				if len(subArgs) > 3 {
					reason = strings.Join(subArgs[3:], " ")
				}
			} else if len(subArgs) >= 3 {
				target = subArgs[0]
				untilStr = subArgs[2]
				if len(subArgs) > 3 {
					reason = strings.Join(subArgs[3:], " ")
				}
			}
			if target != "" && untilStr != "" {
				_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeRevertMoney(ctx, target, untilStr, reason))
				return
			}
		}

		// Handle money management with flexible argument ordering:
		// Syntax A: !user money <gracz|*> <add|remove|set> <kwota> [powód]
		// Syntax B: !user money <add|remove|set> <gracz|*> <kwota> [powód]
		if len(subArgs) < 3 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!user money <gracz|*> <add|remove|set|revert> <kwota/data> [powód]`\nlub `!give <gracz|*> <kwota>`")
			return
		}

		var target, action string
		var valStr string
		var reasonIdx int

		firstLower := strings.ToLower(subArgs[0])
		if firstLower == "add" || firstLower == "+" || firstLower == "remove" || firstLower == "sub" || firstLower == "-" || firstLower == "set" || firstLower == "=" || firstLower == "revert" {
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

		if action == "revert" {
			reason := "Cofnięcie transakcji (Discord)"
			if len(subArgs) > reasonIdx {
				reason = strings.Join(subArgs[reasonIdx:], " ")
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeRevertMoney(ctx, target, valStr, reason))
			return
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
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Nieznana akcja: użyj `add`, `remove`, `set` lub `revert`.")
		}

	// Shorthand commands: !givebox <gracz|*> <ilość> [powód]
	case "!givebox", "!grantbox", "!addbox":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `"+cmd+" <gracz|*> <ilość> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.Atoi(args[1])
		if err != nil || val <= 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek (musi być liczbą dodatnią).")
			return
		}
		reason := "Przyznanie administratora (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMusorDrop(ctx, target, val, reason))

	// Shorthand commands: !takebox <gracz|*> <ilość> [powód]
	case "!takebox", "!removebox":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `"+cmd+" <gracz|*> <ilość> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.Atoi(args[1])
		if err != nil || val <= 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek (musi być liczbą dodatnią).")
			return
		}
		reason := "Korekta skrzynek (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMusorDrop(ctx, target, -val, reason))

	// Shorthand commands: !setbox <gracz|*> <ilość> [powód]
	case "!setbox":
		if len(args) < 2 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!setbox <gracz|*> <ilość> [powód]`")
			return
		}
		target := args[0]
		val, err := strconv.Atoi(args[1])
		if err != nil || val < 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek.")
			return
		}
		reason := "Ręczne ustawienie liczby skrzynek (Discord)"
		if len(args) > 2 {
			reason = strings.Join(args[2:], " ")
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeSetMusorDrop(ctx, target, val, reason))

	// Shorthand commands: !resetbox <gracz|*> [box_type]
	case "!resetbox", "!resetmusor":
		if len(args) < 1 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!resetbox <gracz|*> [plebs|arystokracja|all]`")
			return
		}
		target := args[0]
		boxType := "all"
		if len(args) > 1 {
			boxType = args[1]
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeResetMusorDrop(ctx, target, boxType))

	// Shorthand commands: !boxinfo <gracz>
	case "!boxinfo", "!musorinfo":
		if len(args) < 1 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!boxinfo <gracz>`")
			return
		}
		_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeMusorDropInfo(ctx, args[0]))

	// Full Musor Drop text command: !musor, !musordrop, !skrzynki
	case "!musor", "!musordrop", "!skrzynki":
		if len(args) == 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor <add|remove|set|reset|info> <gracz|*> [ilość/typ] [powód]`\nPrzykłady:\n• `!musor add * 5 Prezent`\n• `!musor remove gracz1 2`\n• `!musor set gracz1 10`\n• `!musor reset * all`\n• `!musor info gracz1`")
			return
		}

		sub := strings.ToLower(args[0])
		switch sub {
		case "add", "give", "+":
			if len(args) < 3 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor add <gracz|*> <ilość> [powód]`")
				return
			}
			val, err := strconv.Atoi(args[2])
			if err != nil || val <= 0 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek.")
				return
			}
			reason := "Admin Musor Drop Grant"
			if len(args) > 3 {
				reason = strings.Join(args[3:], " ")
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMusorDrop(ctx, args[1], val, reason))

		case "remove", "take", "sub", "-":
			if len(args) < 3 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor remove <gracz|*> <ilość> [powód]`")
				return
			}
			val, err := strconv.Atoi(args[2])
			if err != nil || val <= 0 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek.")
				return
			}
			reason := "Admin Musor Drop Deduction"
			if len(args) > 3 {
				reason = strings.Join(args[3:], " ")
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMusorDrop(ctx, args[1], -val, reason))

		case "set", "=":
			if len(args) < 3 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor set <gracz|*> <ilość> [powód]`")
				return
			}
			val, err := strconv.Atoi(args[2])
			if err != nil || val < 0 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna liczba skrzynek.")
				return
			}
			reason := "Admin Musor Drop Set"
			if len(args) > 3 {
				reason = strings.Join(args[3:], " ")
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeSetMusorDrop(ctx, args[1], val, reason))

		case "reset":
			if len(args) < 2 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor reset <gracz|*> [plebs|arystokracja|all]`")
				return
			}
			boxType := "all"
			if len(args) > 2 {
				boxType = args[2]
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeResetMusorDrop(ctx, args[1], boxType))

		case "info", "stan", "check":
			if len(args) < 2 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!musor info <gracz>`")
				return
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeMusorDropInfo(ctx, args[1]))

		default:
			// If first argument is player name and second is number: !musor <gracz> <ilość>
			if len(args) >= 2 {
				if val, err := strconv.Atoi(args[1]); err == nil {
					reason := "Admin Musor Drop Grant"
					if len(args) > 2 {
						reason = strings.Join(args[2:], " ")
					}
					_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeGrantMusorDrop(ctx, args[0], val, reason))
					return
				}
			}
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Nieznana podkomenda `!musor`. Dostępne: `add`, `remove`, `set`, `reset`, `info`.")
		}

	case "!schedule", "!drop", "!harmonogram", "!autodrop":
		if len(args) == 0 || args[0] == "list" || args[0] == "lista" {
			filter := ""
			if len(args) > 1 {
				filter = strings.Join(args[1:], " ")
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.buildScheduledGrantsListEmbed(ctx, filter))
			return
		}

		sub := strings.ToLower(args[0])
		switch sub {
		case "remove", "delete", "del", "rm":
			if len(args) < 2 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!schedule remove <identyfikator>`")
				return
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeScheduleRemove(ctx, args[1]))

		case "toggle", "switch":
			if len(args) < 3 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!schedule toggle <identyfikator> <on|off|true|false>`")
				return
			}
			val := strings.ToLower(args[2])
			enable := val == "on" || val == "true" || val == "1" || val == "włącz" || val == "wlacz"
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeScheduleToggle(ctx, args[1], enable))

		case "run", "exec", "test":
			if len(args) < 2 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!schedule run <identyfikator>`")
				return
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeScheduleRun(ctx, args[1]))

		case "add", "create":
			// Syntax: !schedule add <nazwa> <kwota> <gracze> [dzien] [godzina] [cron] [powod]
			if len(args) < 4 {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!schedule add <nazwa> <kwota> <gracze|*> [dzien] [godzina] [cron] [powod]`\nPrzykład: `!schedule add PiątkowyDrop 500 * Piątek 18:00 - Weekendowy drop`")
				return
			}
			name := args[1]
			amount, err := strconv.ParseInt(args[2], 10, 64)
			if err != nil {
				_, _ = s.ChannelMessageSend(m.ChannelID, "❌ Niepoprawna kwota $FGT.")
				return
			}
			targets := args[3]
			day := "Codziennie"
			timeOfDay := "18:00"
			customCron := ""
			reason := "Automatyczny drop $FGT"

			if len(args) > 4 && args[4] != "-" {
				day = args[4]
			}
			if len(args) > 5 && args[5] != "-" {
				timeOfDay = args[5]
			}
			if len(args) > 6 && args[6] != "-" && strings.ContainsAny(args[6], " *") || strings.HasPrefix(args[6], "@") {
				customCron = args[6]
			}
			if len(args) > 7 {
				reason = strings.Join(args[7:], " ")
			} else if len(args) > 6 && customCron == "" {
				reason = strings.Join(args[6:], " ")
			}

			params := scheduler.CreateGrantParams{
				Name:        name,
				TargetUsers: targets,
				Amount:      amount,
				Reason:      reason,
				DayOfWeek:   day,
				TimeOfDay:   timeOfDay,
				CustomCron:  customCron,
				CreatedBy:   m.Author.Username,
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, b.executeScheduleAdd(ctx, params))

		default:
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Nieznana podkomenda `!schedule`. Dostępne: `list`, `add`, `remove`, `toggle`, `run`.")
		}

	case "!event", "!wydarzenie":
		if len(args) == 0 {
			_, _ = s.ChannelMessageSend(m.ChannelID, "❓ Użycie: `!event start <nazwa> [czas]` (np. `!event start money-rain 60s`) lub `!event stop <nazwa>`")
			return
		}
		sub := strings.ToLower(args[0])
		switch sub {
		case "start":
			ev := "money-rain"
			durStr := "60s"
			if len(args) > 1 {
				ev = args[1]
			}
			if len(args) > 2 {
				durStr = args[2]
			}
			dur, friendly, err := parseEventDuration(durStr)
			if err != nil {
				_, _ = s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("⚠️ %v", err))
				return
			}
			mult := 1.25
			if len(args) > 3 {
				if mVal, err := strconv.ParseFloat(args[3], 64); err == nil && mVal > 1.0 {
					mult = mVal
				}
			}
			if current := b.GetActiveEvent(); current != nil {
				remaining := time.Until(current.EndsAt)
				if remaining > 0 {
					_, _ = s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("⚠️ Wydarzenie **%s** jest już aktywne (pozostało ok. %d sek)! Może być aktywne tylko 1 wydarzenie na raz. Użyj `!event stop` aby je zakończyć.", current.Name, int(remaining.Seconds())))
					return
				}
			}
			now := time.Now()
			endsAt := now.Add(dur)
			b.SetActiveEvent(&ActiveEventInfo{
				Name:      ev,
				Duration:  dur,
				StartedAt: now,
				EndsAt:    endsAt,
				StartedBy: m.Author.Username,
			})
			// Broadcast to all casino players (in-memory + HTTP to AppURL)
			b.dispatchLiveEventToCasino(ev, "start", int(dur.Seconds()), mult, m.Author.Username)
			time.AfterFunc(dur, func() {
				curr := b.GetActiveEvent()
				if curr != nil && curr.EndsAt.Equal(endsAt) {
					b.ClearActiveEvent()
				}
			})
			embed := &discordgo.MessageEmbed{
				Title:       "🌧️ Wydarzenie Uruchomione: Money Rain!",
				Description: "Deszcz pieniędzy został pomyślnie rozesłany na żywo do wszystkich graczy w kasynie!",
				Color:       ColorEmerald,
				Fields: []*discordgo.MessageEmbedField{
					{
						Name:   "⏳ Czas trwania",
						Value:  fmt.Sprintf("**%s** (<t:%d:R>)", friendly, endsAt.Unix()),
						Inline: true,
					},
					{
						Name:   "⚡ Bonusowy Mnożnik",
						Value:  fmt.Sprintf("**×%.2f (+%d%% do każdej wygranej)**", mult, int(math.Round((mult-1.0)*100))),
						Inline: true,
					},
					{
						Name:   "👤 Uruchomione przez",
						Value:  fmt.Sprintf("**%s**", m.Author.Username),
						Inline: true,
					},
					{
						Name:   "🎵 Muzyka & Efekty",
						Value:  "ABBA – *Money, Money, Money* + spadające banknoty 3D",
						Inline: false,
					},
				},
				Footer: &discordgo.MessageEmbedFooter{
					Text: "2FGT Kasyno • System Wydarzeń Na Żywo",
				},
				Timestamp: time.Now().Format(time.RFC3339),
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, embed)

		case "stop":
			ev := "money-rain"
			if len(args) > 1 {
				ev = args[1]
			}
			b.ClearActiveEvent()
			b.dispatchLiveEventToCasino(ev, "stop", 0, 1.0, "")
			embed := &discordgo.MessageEmbed{
				Title:       "⏹️ Wydarzenie Zatrzymane",
				Description: fmt.Sprintf("Wydarzenie **%s** zostało natychmiast przerwane na platformie.", ev),
				Color:       ColorRose,
				Footer: &discordgo.MessageEmbedFooter{
					Text: "2FGT Kasyno • System Wydarzeń Na Żywo",
				},
				Timestamp: time.Now().Format(time.RFC3339),
			}
			_, _ = s.ChannelMessageSendEmbed(m.ChannelID, embed)

		case "status":
			active := b.GetActiveEvent()
			if active == nil {
				_, _ = s.ChannelMessageSend(m.ChannelID, "ℹ️ Brak aktywnego wydarzenia. Możesz uruchomić np.: `!event start money-rain 60s`")
				return
			}
			remaining := time.Until(active.EndsAt)
			_, _ = s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("🌧️ Trwa wydarzenie **%s**! Pozostało ok. %d sek. (uruchomił: %s)", active.Name, int(remaining.Seconds()), active.StartedBy))
		}
	}
}

func parseEventDuration(durStr string) (time.Duration, string, error) {
	durStr = strings.TrimSpace(strings.ToLower(durStr))
	if durStr == "" {
		return 60 * time.Second, "60 sekund", nil
	}
	// Pure integer without unit -> default to seconds
	if n, err := strconv.Atoi(durStr); err == nil {
		if n <= 0 {
			return 0, "", fmt.Errorf("czas trwania musi być większy od 0")
		}
		return time.Duration(n) * time.Second, fmt.Sprintf("%d sekund", n), nil
	}
	d, err := time.ParseDuration(durStr)
	if err != nil {
		return 0, "", fmt.Errorf("niepoprawny format czasu (użyj np. 60s, 10m, 1h)")
	}
	if d < 5*time.Second {
		return 0, "", fmt.Errorf("czas trwania musi wynosić minimum 5 sekund")
	}
	if d > 24*time.Hour {
		return 0, "", fmt.Errorf("maksymalny czas trwania wydarzenia to 24 godziny")
	}
	var friendly string
	if d < time.Minute {
		friendly = fmt.Sprintf("%d sekund", int(d.Seconds()))
	} else if d < time.Hour {
		if int(d.Seconds())%60 == 0 {
			friendly = fmt.Sprintf("%d minut", int(d.Minutes()))
		} else {
			friendly = fmt.Sprintf("%d minut %d sekund", int(d.Minutes()), int(d.Seconds())%60)
		}
	} else {
		friendly = fmt.Sprintf("%.1f godzin", d.Hours())
	}
	return d, friendly, nil
}

func (b *Bot) handleEventCommand(s *discordgo.Session, i *discordgo.InteractionCreate, subCmd string, options []*discordgo.ApplicationCommandInteractionDataOption) {
	switch subCmd {
	case "start":
		eventName := "money-rain"
		durStr := "60s"
		mult := 1.25
		for _, opt := range options {
			if opt.Name == "name" || opt.Name == "event" {
				eventName = opt.StringValue()
			} else if opt.Name == "duration" || opt.Name == "czas" {
				durStr = opt.StringValue()
			} else if opt.Name == "multiplier" || opt.Name == "mnoznik" {
				mult = opt.FloatValue()
			}
		}
		if mult <= 1.0 {
			mult = 1.25
		}

		dur, friendly, err := parseEventDuration(durStr)
		if err != nil {
			b.respondInteractionError(s, i, fmt.Sprintf("⚠️ %v", err))
			return
		}

		startedBy := "Administrator"
		if i.Member != nil && i.Member.User != nil {
			startedBy = i.Member.User.Username
		} else if i.User != nil {
			startedBy = i.User.Username
		}

		if current := b.GetActiveEvent(); current != nil {
			remaining := time.Until(current.EndsAt)
			if remaining > 0 {
				b.respondInteractionError(s, i, fmt.Sprintf("⚠️ Wydarzenie **%s** jest już aktywne (pozostało ok. %d sek)! Może być aktywne tylko 1 wydarzenie na raz. Użyj `/event stop` przed uruchomieniem kolejnego.", current.Name, int(remaining.Seconds())))
				return
			}
		}

		now := time.Now()
		endsAt := now.Add(dur)

		b.SetActiveEvent(&ActiveEventInfo{
			Name:      eventName,
			Duration:  dur,
			StartedAt: now,
			EndsAt:    endsAt,
			StartedBy: startedBy,
		})

		// Broadcast through WebSocket to all connected casino players (in-memory + HTTP to AppURL)
		b.dispatchLiveEventToCasino(eventName, "start", int(dur.Seconds()), mult, startedBy)

		time.AfterFunc(dur, func() {
			current := b.GetActiveEvent()
			if current != nil && current.EndsAt.Equal(endsAt) {
				b.ClearActiveEvent()
			}
		})

		embed := &discordgo.MessageEmbed{
			Title:       "🌧️ Wydarzenie Uruchomione: Money Rain!",
			Description: "Deszcz pieniędzy został pomyślnie rozesłany na żywo do wszystkich graczy w kasynie!",
			Color:       ColorEmerald,
			Fields: []*discordgo.MessageEmbedField{
				{
					Name:   "⏳ Czas trwania",
					Value:  fmt.Sprintf("**%s** (<t:%d:R>)", friendly, endsAt.Unix()),
					Inline: true,
				},
				{
					Name:   "⚡ Bonusowy Mnożnik",
					Value:  fmt.Sprintf("**×%.2f (+%d%% do każdej wygranej)**", mult, int(math.Round((mult-1.0)*100))),
					Inline: true,
				},
				{
					Name:   "👤 Uruchomione przez",
					Value:  fmt.Sprintf("**%s**", startedBy),
					Inline: true,
				},
				{
					Name:   "🎵 Muzyka & Efekty",
					Value:  "ABBA – *Money, Money, Money* + spadające banknoty 3D",
					Inline: false,
				},
			},
			Footer: &discordgo.MessageEmbedFooter{
				Text: "2FGT Kasyno • System Wydarzeń Na Żywo",
			},
			Timestamp: time.Now().Format(time.RFC3339),
		}
		b.respondInteraction(s, i, embed)

	case "stop":
		eventName := "money-rain"
		for _, opt := range options {
			if opt.Name == "name" || opt.Name == "event" {
				eventName = opt.StringValue()
			}
		}

		b.ClearActiveEvent()
		b.dispatchLiveEventToCasino(eventName, "stop", 0, 1.0, "")

		embed := &discordgo.MessageEmbed{
			Title:       "⏹️ Wydarzenie Zatrzymane",
			Description: fmt.Sprintf("Wydarzenie **%s** zostało natychmiast przerwane na platformie.", eventName),
			Color:       ColorRose,
			Footer: &discordgo.MessageEmbedFooter{
				Text: "2FGT Kasyno • System Wydarzeń Na Żywo",
			},
			Timestamp: time.Now().Format(time.RFC3339),
		}
		b.respondInteraction(s, i, embed)

	case "status":
		active := b.GetActiveEvent()
		if active == nil {
			embed := &discordgo.MessageEmbed{
				Title:       "ℹ️ Status Wydarzeń",
				Description: "Obecnie **żadne wydarzenie nie jest aktywne**.\n\nAby uruchomić nowe wydarzenie, użyj:\n`/event start money-rain 60s`",
				Color:       ColorSky,
				Footer: &discordgo.MessageEmbedFooter{
					Text: "2FGT Kasyno • System Wydarzeń Na Żywo",
				},
				Timestamp: time.Now().Format(time.RFC3339),
			}
			b.respondInteraction(s, i, embed)
			return
		}

		remaining := time.Until(active.EndsAt)
		embed := &discordgo.MessageEmbed{
			Title:       "🌧️ Aktualne Wydarzenie Na Żywo",
			Description: fmt.Sprintf("Aktualnie trwa wydarzenie **%s**!", active.Name),
			Color:       ColorEmerald,
			Fields: []*discordgo.MessageEmbedField{
				{
					Name:   "⏳ Pozostały czas",
					Value:  fmt.Sprintf("<t:%d:R> (ok. %d sek)", active.EndsAt.Unix(), int(remaining.Seconds())),
					Inline: true,
				},
				{
					Name:   "👤 Uruchomił",
					Value:  active.StartedBy,
					Inline: true,
				},
			},
			Footer: &discordgo.MessageEmbedFooter{
				Text: "2FGT Kasyno • Użyj /event stop aby zatrzymać",
			},
			Timestamp: time.Now().Format(time.RFC3339),
		}
		b.respondInteraction(s, i, embed)

	default:
		b.respondInteractionError(s, i, "Nieznana podkomenda. Użyj: `/event start`, `/event stop` lub `/event status`.")
	}
}

func (b *Bot) dispatchLiveEventToCasino(eventName, action string, durSeconds int, multiplier float64, startedBy string) {
	if multiplier <= 1.0 {
		multiplier = 1.25
	}
	evType := ws.EventMoneyRain
	if action == "stop" {
		evType = ws.EventStopMoneyRain
	}

	// Update ledger in-memory if available
	if b.ledger != nil {
		if action == "start" {
			dur := time.Duration(durSeconds) * time.Second
			b.ledger.SetActiveEvent(&ledger.LiveEventInfo{
				Name:       eventName,
				Multiplier: multiplier,
				StartedAt:  time.Now(),
				EndsAt:     time.Now().Add(dur),
				StartedBy:  startedBy,
			})
		} else {
			b.ledger.ClearActiveEvent()
		}
	}

	// 1. Direct in-memory broadcast if wsHub is available in the current process
	if b.wsHub != nil {
		b.wsHub.Broadcast(ws.Event{
			Type: evType,
			Payload: map[string]interface{}{
				"event":      eventName,
				"action":     action,
				"duration":   durSeconds,
				"multiplier": multiplier,
				"started_by": startedBy,
			},
		})
	}

	// 2. HTTP POST to casino web server (only needed when bot runs on a separate machine or container without direct wsHub)
	if b.wsHub == nil {
		go func() {
			appURL := strings.TrimRight(b.appURL, "/")
			if appURL == "" && b.cfg != nil {
				appURL = strings.TrimRight(b.cfg.AppURL, "/")
			}
			if appURL == "" || b.cfg == nil || b.cfg.SessionSecret == "" {
				return
			}

			targetURL := fmt.Sprintf("%s/api/internal/events", appURL)
			payload, _ := json.Marshal(map[string]interface{}{
				"event":      eventName,
				"action":     action,
				"duration":   durSeconds,
				"multiplier": multiplier,
				"started_by": startedBy,
			})

			req, err := http.NewRequest("POST", targetURL, bytes.NewBuffer(payload))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+b.cfg.SessionSecret)

			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Do(req)
			if err == nil && resp != nil {
				_ = resp.Body.Close()
			}
		}()
	}
}


