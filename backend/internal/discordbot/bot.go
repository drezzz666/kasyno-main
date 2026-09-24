package discordbot

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/scheduler"
)

const (
	ColorGold    = 0xF59E0B
	ColorEmerald = 0x10B981
	ColorRose    = 0xEF4444
	ColorSky     = 0x38BDF8
	ColorPurple  = 0x8B5CF6
	ColorDark    = 0x1E293B
)

type playerCacheItem struct {
	Nick    string
	UserID  string
	Balance int64
	Level   int
}

type Bot struct {
	session   *discordgo.Session
	cfg       *config.Config
	ledger    *ledger.Service
	scheduler *scheduler.Scheduler
	appURL    string

	playerCacheMu sync.RWMutex
	playerCache   []playerCacheItem
	playerCacheAt time.Time
}

func (b *Bot) invalidatePlayerCache() {
	b.playerCacheMu.Lock()
	defer b.playerCacheMu.Unlock()
	b.playerCacheAt = time.Time{}
}

func (b *Bot) getCachedPlayers(ctx context.Context) []playerCacheItem {
	b.playerCacheMu.RLock()
	if len(b.playerCache) > 0 && time.Since(b.playerCacheAt) < 15*time.Second {
		cached := make([]playerCacheItem, len(b.playerCache))
		copy(cached, b.playerCache)
		b.playerCacheMu.RUnlock()
		return cached
	}
	b.playerCacheMu.RUnlock()

	b.playerCacheMu.Lock()
	defer b.playerCacheMu.Unlock()

	if len(b.playerCache) > 0 && time.Since(b.playerCacheAt) < 15*time.Second {
		cached := make([]playerCacheItem, len(b.playerCache))
		copy(cached, b.playerCache)
		return cached
	}

	players, _, err := b.ledger.AdminListUsers(ctx, "", 200, 0)
	if err != nil {
		return b.playerCache
	}

	var items []playerCacheItem
	for _, p := range players {
		items = append(items, playerCacheItem{
			Nick:    p.Nick,
			UserID:  p.UserID,
			Balance: p.Balance,
			Level:   p.Level,
		})
	}
	b.playerCache = items
	b.playerCacheAt = time.Now()

	cached := make([]playerCacheItem, len(items))
	copy(cached, items)
	return cached
}

func New(cfg *config.Config, ledgerSvc *ledger.Service, schedulerSvc *scheduler.Scheduler) (*Bot, error) {
	if cfg.DiscordBotToken == "" {
		return nil, fmt.Errorf("DISCORD_BOT_TOKEN nie jest ustawiony")
	}

	session, err := discordgo.New("Bot " + cfg.DiscordBotToken)
	if err != nil {
		return nil, fmt.Errorf("błąd inicjalizacji sesji discord: %w", err)
	}

	b := &Bot{
		session:   session,
		cfg:       cfg,
		ledger:    ledgerSvc,
		scheduler: schedulerSvc,
		appURL:    strings.TrimRight(cfg.AppURL, "/"),
	}

	if schedulerSvc != nil {
		schedulerSvc.SetAnnounceHandler(b.announceDrop)
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
	_ = b.session.UpdateGameStatus(0, "2FGT Casino Console")

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

func (b *Bot) announceDrop(ctx context.Context, res *scheduler.GrantExecutionResult) {
	if b.session == nil || res == nil || res.Grant == nil {
		return
	}

	channelID := b.cfg.DiscordDropChannelID
	if channelID == "" {
		log.Printf("ℹ️ [Discord Bot] Wykonano automatyczny zrzut '%s' (+%d $FGT), ale DISCORD_DROP_CHANNEL_ID nie jest ustawiony.", res.Grant.Name, res.Grant.Amount)
		return
	}

	var targetDesc string
	if len(res.SuccessfulUsers) == 1 && res.SuccessfulUsers[0] == "* (Wszyscy gracze)" {
		targetDesc = fmt.Sprintf("🌐 **Wszyscy zarejestrowani gracze** *(%d kont)*", res.RecipientsCount)
	} else {
		targetDesc = fmt.Sprintf("👥 **Gracze (%d):** %s", len(res.SuccessfulUsers), strings.Join(res.SuccessfulUsers, ", "))
	}

	if len(res.FailedUsers) > 0 {
		targetDesc += fmt.Sprintf("\n⚠️ *Nie znaleziono:* %s", strings.Join(res.FailedUsers, ", "))
	}

	nextRunStr := "Brak"
	if res.Grant.NextRunAt != nil {
		loc := time.Local
		if b.scheduler != nil && b.scheduler.Location() != nil {
			loc = b.scheduler.Location()
		}
		nextRunStr = time.UnixMilli(*res.Grant.NextRunAt).In(loc).Format("02.01.2006 15:04:05 (MST)")
	}

	embed := &discordgo.MessageEmbed{
		Color:       ColorGold,
		Title:       fmt.Sprintf("🎁 AUTOMATYCZNY ZRZUT $FGT: %s", res.Grant.Name),
		Description: fmt.Sprintf("Zrealizowano zaplanowane doładowanie środków dla graczy!\nZaloguj się i zagraj na [**%s**](%s)", b.appURL, b.appURL),
		Fields: []*discordgo.MessageEmbedField{
			{
				Name:   "💰 Kwota zrzutu",
				Value:  fmt.Sprintf("**+%s** / gracz", formatFGT(res.Grant.Amount)),
				Inline: true,
			},
			{
				Name:   "💎 Łącznie rozdano",
				Value:  fmt.Sprintf("**%s**", formatFGT(res.TotalTransferred)),
				Inline: true,
			},
			{
				Name:   "🎯 Odbiorcy",
				Value:  targetDesc,
				Inline: false,
			},
			{
				Name:   "📝 Powód / Okazja",
				Value:  res.Grant.Reason,
				Inline: true,
			},
			{
				Name:   "🕒 Harmonogram",
				Value:  fmt.Sprintf("%s\n*(Kolejny drop: %s)*", res.Grant.HumanSchedule, nextRunStr),
				Inline: false,
			},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("Kasyno 2FGT • Zrzut Automatyczny • Strefa: %s", b.cfg.Timezone),
		},
		Timestamp: res.ExecutedAt.Format(time.RFC3339),
	}

	_, err := b.session.ChannelMessageSendEmbed(channelID, embed)
	if err != nil {
		log.Printf("⚠️ [Discord Bot] Błąd wysyłania powiadomienia o zrzucie na kanał %s: %v", channelID, err)
	} else {
		log.Printf("📢 [Discord Bot] Wysłano ogłoszenie o zrzucie '%s' (+%d $FGT) na kanał Discord %s.", res.Grant.Name, res.Grant.Amount, channelID)
	}
}

