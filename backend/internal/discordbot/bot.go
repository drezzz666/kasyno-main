package discordbot

import (
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/bwmarrin/discordgo"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

const (
	ColorGold    = 0xF59E0B
	ColorEmerald = 0x10B981
	ColorRose    = 0xEF4444
	ColorSky     = 0x38BDF8
	ColorPurple  = 0x8B5CF6
	ColorDark    = 0x1E293B
)

type Bot struct {
	session *discordgo.Session
	cfg     *config.Config
	ledger  *ledger.Service
	appURL  string
}

func New(cfg *config.Config, ledgerSvc *ledger.Service) (*Bot, error) {
	if cfg.DiscordBotToken == "" {
		return nil, fmt.Errorf("DISCORD_BOT_TOKEN nie jest ustawiony")
	}

	session, err := discordgo.New("Bot " + cfg.DiscordBotToken)
	if err != nil {
		return nil, fmt.Errorf("błąd inicjalizacji sesji discord: %w", err)
	}

	b := &Bot{
		session: session,
		cfg:     cfg,
		ledger:  ledgerSvc,
		appURL:  strings.TrimRight(cfg.AppURL, "/"),
	}

	session.AddHandler(b.handleReady)
	session.AddHandler(b.handleGuildCreate)
	session.AddHandler(b.handleMessageCreate)
	session.AddHandler(b.handleInteractionCreate)

	SetGlobalBot(b)

	return b, nil
}

func (b *Bot) handleGuildCreate(s *discordgo.Session, g *discordgo.GuildCreate) {
	log.Printf("🤖 [Discord Bot] Załadowano serwer: %s (ID: %s)", g.Name, g.ID)
	// In global mode, ensure old duplicate guild-scoped commands are cleared
	if b.cfg.DiscordGuildID == "" && s.State != nil && s.State.User != nil {
		_, _ = s.ApplicationCommandBulkOverwrite(s.State.User.ID, g.ID, []*discordgo.ApplicationCommand{})
	}
}

func (b *Bot) Start() error {
	// First attempt with message content intent for prefix commands
	b.session.Identify.Intents = discordgo.IntentsGuildMessages | discordgo.IntentsDirectMessages | discordgo.IntentsMessageContent | discordgo.IntentsGuilds
	err := b.session.Open()
	if err != nil && strings.Contains(err.Error(), "4014") {
		log.Printf("⚠️ [Discord Bot] Intent 'MessageContent' nie jest włączony w Discord Portal. Przełączam na Slash Commands...")
		// Fallback to unprivileged intents (Slash commands + Guilds)
		b.session.Identify.Intents = discordgo.IntentsGuilds | discordgo.IntentsGuildMessages | discordgo.IntentsDirectMessages
		err = b.session.Open()
		if err != nil && strings.Contains(err.Error(), "4014") {
			b.session.Identify.Intents = discordgo.IntentsGuilds
			err = b.session.Open()
		}
	}

	if err != nil {
		return fmt.Errorf("błąd otwierania połączenia websocket discord: %w", err)
	}

	log.Printf("🤖 [Discord Bot] Pomyślnie połączono z Discordem jako: %s#%s", b.session.State.User.Username, b.session.State.User.Discriminator)

	// Set presence - Admin Console
	_ = b.session.UpdateGameStatus(0, "👑 2FGT Casino Admin Console")

	// Register slash commands
	b.registerSlashCommands()

	return nil
}

func (b *Bot) Stop() {
	if b.session != nil {
		_ = b.session.Close()
		log.Printf("🤖 [Discord Bot] Połączenie z Discordem zostało zamknięte.")
	}
}

var (
	globalBot   *Bot
	globalBotMu sync.RWMutex
)

// SetGlobalBot sets the global bot singleton instance.
func SetGlobalBot(b *Bot) {
	globalBotMu.Lock()
	defer globalBotMu.Unlock()
	globalBot = b
}

// GetGlobalBot returns the global bot singleton instance.
func GetGlobalBot() *Bot {
	globalBotMu.RLock()
	defer globalBotMu.RUnlock()
	return globalBot
}

func (b *Bot) handleReady(s *discordgo.Session, r *discordgo.Ready) {
	log.Printf("🤖 [Discord Bot] Bot jest gotowy. Serwery: %d", len(r.Guilds))
}

// formatFGT formats amount with commas
func formatFGT(amount int64) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	str := strconv.FormatInt(amount, 10)
	n := len(str)
	if n <= 3 {
		return fmt.Sprintf("%s%s $FGT", sign, str)
	}

	var sb strings.Builder
	sb.WriteString(sign)
	rem := n % 3
	if rem > 0 {
		sb.WriteString(str[:rem])
		if n > rem {
			sb.WriteString(",")
		}
	}
	for i := rem; i < n; i += 3 {
		sb.WriteString(str[i : i+3])
		if i+3 < n {
			sb.WriteString(",")
		}
	}
	sb.WriteString(" $FGT")
	return sb.String()
}

// isAdmin checks whether user has admin permissions
func (b *Bot) isAdmin(m *discordgo.Member, userID string) bool {
	if userID == "" && m != nil && m.User != nil {
		userID = m.User.ID
	}

	// 1. Direct ID whitelist from env
	for _, adminID := range b.cfg.DiscordAdminUsers {
		if strings.TrimSpace(adminID) != "" && (adminID == userID || (m != nil && m.User != nil && adminID == m.User.ID)) {
			return true
		}
	}

	if m == nil {
		return false
	}

	// 2. Direct Discord Administrator permission on member
	if m.Permissions&discordgo.PermissionAdministrator != 0 {
		return true
	}

	// 3. Check Guild Owner and Role Permissions from state/guild cache
	if m.GuildID != "" {
		guild, err := b.session.State.Guild(m.GuildID)
		if err == nil && guild != nil {
			// Guild owner is always admin
			if guild.OwnerID == userID {
				return true
			}

			// Check roles for Administrator permissions or custom role name
			for _, roleID := range m.Roles {
				for _, r := range guild.Roles {
					if r.ID == roleID {
						if r.Permissions&discordgo.PermissionAdministrator != 0 {
							return true
						}
						if b.cfg.DiscordAdminRole != "" && (strings.EqualFold(r.Name, b.cfg.DiscordAdminRole) || r.ID == b.cfg.DiscordAdminRole) {
							return true
						}
					}
				}
			}
		}
	}

	return false
}

func limitStr(s string, max int) string {
	if len(s) > max {
		return s[:max-3] + "..."
	}
	return s
}

func isValidHttpURL(raw string) bool {
	if raw == "" {
		return false
	}
	u, err := url.ParseRequestURI(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	if u.Host == "" {
		return false
	}
	return true
}

func (b *Bot) getValidAvatarURL(avatar *string) string {
	if avatar == nil || *avatar == "" {
		return ""
	}
	raw := strings.TrimSpace(*avatar)
	if isValidHttpURL(raw) {
		return raw
	}
	if strings.HasPrefix(raw, "/") && b != nil && b.appURL != "" {
		candidate := strings.TrimRight(b.appURL, "/") + raw
		if isValidHttpURL(candidate) {
			return candidate
		}
	}
	return ""
}

