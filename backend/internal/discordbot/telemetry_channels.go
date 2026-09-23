package discordbot

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

type UserTelemetryReport struct {
	UserID             string  `json:"user_id"`
	Nick               string  `json:"nick"`
	Email              string  `json:"email"`
	IP                 string  `json:"ip"`
	UserAgent          string  `json:"user_agent"`
	GPUInfo            string  `json:"gpu_info"`
	CPUCores           string  `json:"cpu_cores"`
	DeviceRAM          string  `json:"device_ram"`
	ScreenDetails      string  `json:"screen_details"`
	Orientation        string  `json:"orientation"`
	TouchPoints        int     `json:"touch_points"`
	ColorScheme        string  `json:"color_scheme"`
	Timezone           string  `json:"timezone"`
	Language           string  `json:"language"`
	Platform           string  `json:"platform"`
	NetworkInfo        string  `json:"network_info"`
	MemoryMB           string  `json:"memory_mb"`
	NavigationTiming   string  `json:"navigation_timing"`
	LatencyMs          float64 `json:"latency_ms"`
	PageVisibility     string  `json:"page_visibility"`
	Referrer           string  `json:"referrer"`
	SessionDurationSec int     `json:"session_duration_sec"`
	LastAction         string  `json:"last_action"`
}

var (
	globalBot          *Bot
	globalBotMu        sync.RWMutex
	telemetryChannelMu sync.Mutex
	userSyncDebounce   = make(map[string]time.Time)
	userSyncDebounceMu sync.Mutex
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

// getGuildIDs returns all guilds where the bot is connected.
func (b *Bot) getGuildIDs() []string {
	if b == nil || b.session == nil {
		return nil
	}
	if b.cfg.DiscordGuildID != "" {
		return []string{b.cfg.DiscordGuildID}
	}
	var ids []string
	if b.session.State != nil && len(b.session.State.Guilds) > 0 {
		for _, g := range b.session.State.Guilds {
			ids = append(ids, g.ID)
		}
	}
	if len(ids) == 0 {
		guilds, err := b.session.UserGuilds(100, "", "", false)
		if err == nil {
			for _, g := range guilds {
				ids = append(ids, g.ID)
			}
		}
	}
	return ids
}

// EnsureTelemetryCategory finds or creates the "📊 Telemetria" category on a guild.
func (b *Bot) EnsureTelemetryCategory(guildID string) (string, error) {
	if b == nil || b.session == nil || guildID == "" {
		return "", fmt.Errorf("sesja discord lub guildID jest niedostępna")
	}

	channels, err := b.session.GuildChannels(guildID)
	if err != nil {
		return "", fmt.Errorf("błąd pobierania kanałów serwera: %w", err)
	}

	var foundCategories []string
	for _, ch := range channels {
		if ch.Type == discordgo.ChannelTypeGuildCategory {
			cleanName := strings.ToLower(strings.TrimSpace(ch.Name))
			if strings.Contains(cleanName, "telemetria") {
				foundCategories = append(foundCategories, ch.ID)
			}
		}
	}

	if len(foundCategories) > 0 {
		// Return first category found
		return foundCategories[0], nil
	}

	// Create category if it doesn't exist
	cat, err := b.session.GuildChannelCreateComplex(guildID, discordgo.GuildChannelCreateData{
		Name: "📊-telemetria",
		Type: discordgo.ChannelTypeGuildCategory,
	})
	if err != nil {
		return "", fmt.Errorf("błąd tworzenia kategorii telemetria: %w", err)
	}

	log.Printf("📊 [Discord Bot] Utworzono kategorię telemetrii (ID: %s) na serwerze %s", cat.ID, guildID)
	return cat.ID, nil
}

// sanitizeChannelName creates a valid Discord channel name from user nickname or ID.
func sanitizeChannelName(nick, userID string) string {
	raw := strings.ToLower(strings.TrimSpace(nick))
	if raw == "" && len(userID) > 0 {
		raw = userID
	}

	var sb strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sb.WriteRune(r)
		} else if r == ' ' || r == '.' || r == '@' || r == '+' || r == '/' {
			sb.WriteRune('-')
		}
	}

	clean := strings.Trim(sb.String(), "-_")
	if clean == "" {
		if len(userID) >= 8 {
			clean = "gracz-" + userID[:8]
		} else if len(userID) > 0 {
			clean = "gracz-" + userID
		} else {
			clean = "gracz-anonim"
		}
	}

	if len(clean) > 80 {
		clean = clean[:80]
	}
	return clean
}

// getOrCreateUserTelemetryChannel finds, deduplicates, or creates a user channel inside the Telemetria category.
func (b *Bot) getOrCreateUserTelemetryChannel(guildID, categoryID, nick, userID string) (string, error) {
	targetName := sanitizeChannelName(nick, userID)

	channels, err := b.session.GuildChannels(guildID)
	if err != nil {
		return "", err
	}

	var matchingChannels []*discordgo.Channel

	// 1. Search for existing channels in the guild matching this user
	for _, ch := range channels {
		if ch.Type != discordgo.ChannelTypeGuildText {
			continue
		}

		matched := false
		// Match by User ID in topic (most reliable)
		if userID != "" && strings.Contains(ch.Topic, userID) {
			matched = true
		}
		// Match by exact channel name inside telemetry category
		if !matched && ch.ParentID == categoryID && strings.EqualFold(ch.Name, targetName) {
			matched = true
		}
		// Match by exact channel name across guild if topic references telemetry
		if !matched && strings.EqualFold(ch.Name, targetName) && strings.Contains(strings.ToLower(ch.Topic), "telemetria") {
			matched = true
		}

		if matched {
			matchingChannels = append(matchingChannels, ch)
		}
	}

	topic := fmt.Sprintf("Telemetria i dane gracza: %s | ID: %s", nick, userID)

	// 2. If matching channel(s) exist:
	if len(matchingChannels) > 0 {
		primary := matchingChannels[0]

		// Automatically prune and DELETE any extra duplicate channels for this user
		for _, dup := range matchingChannels[1:] {
			log.Printf("🧹 [Discord Bot] Usuwanie zduplikowanego kanału telemetrii #%s (ID: %s) dla gracza %s", dup.Name, dup.ID, nick)
			_, delErr := b.session.ChannelDelete(dup.ID)
			if delErr != nil {
				log.Printf("⚠️ [Discord Bot] Nie udało się usunąć zduplikowanego kanału %s: %v", dup.ID, delErr)
			}
		}

		// Ensure primary channel is in the right category, and has updated name & topic
		needsEdit := false
		var edit discordgo.ChannelEdit
		if primary.ParentID != categoryID {
			edit.ParentID = categoryID
			needsEdit = true
		}
		if !strings.EqualFold(primary.Name, targetName) {
			edit.Name = targetName
			needsEdit = true
		}
		if primary.Topic != topic {
			edit.Topic = topic
			needsEdit = true
		}
		if needsEdit {
			_, _ = b.session.ChannelEdit(primary.ID, &edit)
		}

		return primary.ID, nil
	}

	// 3. Create single text channel in category
	ch, err := b.session.GuildChannelCreateComplex(guildID, discordgo.GuildChannelCreateData{
		Name:     targetName,
		Type:     discordgo.ChannelTypeGuildText,
		ParentID: categoryID,
		Topic:    topic,
	})
	if err != nil {
		return "", fmt.Errorf("błąd tworzenia kanału gracza %s: %w", targetName, err)
	}

	log.Printf("📊 [Discord Bot] Utworzono kanał telemetrii #%s dla gracza %s (ID: %s)", targetName, nick, userID)
	return ch.ID, nil
}

// SyncUserTelemetry updates or posts player telemetry in their dedicated Discord channel.
func (b *Bot) SyncUserTelemetry(ctx context.Context, data *UserTelemetryReport) error {
	if b == nil || b.session == nil || data == nil {
		return nil
	}

	identifier := data.UserID
	if identifier == "" {
		identifier = data.Nick
	}
	if identifier == "" {
		identifier = data.Email
	}
	if identifier == "" {
		return nil
	}

	// Debounce rapid repeated syncs per user (minimum 4 seconds apart)
	userSyncDebounceMu.Lock()
	lastSync, exists := userSyncDebounce[identifier]
	if exists && time.Since(lastSync) < 4*time.Second {
		userSyncDebounceMu.Unlock()
		return nil
	}
	userSyncDebounce[identifier] = time.Now()
	userSyncDebounceMu.Unlock()

	var player *ledger.Player
	var stats *ledger.PlayerStats
	if b.ledger != nil {
		p, s, _, err := b.ledger.AdminGetUser(ctx, identifier)
		if err == nil && p != nil {
			player = p
			stats = s
			if data.Nick == "" {
				data.Nick = p.Nick
			}
			if data.UserID == "" {
				data.UserID = p.UserID
			}
			if data.Email == "" {
				data.Email = p.Email
			}
		}
	}

	if data.Nick == "" {
		data.Nick = identifier
	}

	guildIDs := b.getGuildIDs()
	if len(guildIDs) == 0 {
		return fmt.Errorf("brak dostępnych serwerów discord dla bota")
	}

	// Acquire channel management mutex to serialize Discord channel lookups and creations
	telemetryChannelMu.Lock()
	defer telemetryChannelMu.Unlock()

	for _, guildID := range guildIDs {
		catID, err := b.EnsureTelemetryCategory(guildID)
		if err != nil {
			log.Printf("⚠️ [Discord Bot] Nie udało się uzyskać kategorii telemetrii na guild %s: %v", guildID, err)
			continue
		}

		chID, err := b.getOrCreateUserTelemetryChannel(guildID, catID, data.Nick, data.UserID)
		if err != nil {
			log.Printf("⚠️ [Discord Bot] Nie udało się uzyskać kanału gracza %s: %v", data.Nick, err)
			continue
		}

		embed := b.buildUserTelemetryEmbed(data, player, stats)

		// Try updating existing bot message in the channel, or post new
		messages, err := b.session.ChannelMessages(chID, 5, "", "", "")
		var botMsg *discordgo.Message
		if err == nil && b.session.State != nil && b.session.State.User != nil {
			for _, m := range messages {
				if m.Author != nil && m.Author.ID == b.session.State.User.ID {
					botMsg = m
					break
				}
			}
		}

		if botMsg != nil {
			_, err = b.session.ChannelMessageEditEmbed(chID, botMsg.ID, embed)
			if err != nil {
				_, _ = b.session.ChannelMessageSendEmbed(chID, embed)
			}
		} else {
			_, err = b.session.ChannelMessageSendEmbed(chID, embed)
			if err != nil {
				log.Printf("⚠️ [Discord Bot] Błąd wysyłania embeda telemetrii do #%s: %v", chID, err)
			}
		}
	}

	return nil
}

// buildUserTelemetryEmbed constructs a rich embed with player account, gambling stats, hardware, and network telemetry.
func (b *Bot) buildUserTelemetryEmbed(data *UserTelemetryReport, player *ledger.Player, stats *ledger.PlayerStats) *discordgo.MessageEmbed {
	nick := data.Nick
	if nick == "" {
		nick = "Gracz"
	}

	fields := []*discordgo.MessageEmbedField{
		{
			Name: "👤 Dane Konta",
			Value: fmt.Sprintf(
				"**Nick:** `%s`\n**User ID:** `%s`\n**Email:** `%s`",
				nick,
				data.UserID,
				data.Email,
			),
			Inline: true,
		},
	}

	if player != nil {
		regTime := time.UnixMilli(player.CreatedAt).Format("02.01.2006 15:04")
		fields = append(fields, &discordgo.MessageEmbedField{
			Name: "💰 Finanse i Status",
			Value: fmt.Sprintf(
				"**Saldo:** %s\n**Poziom:** %d (%d XP)\n**Streak:** %d dni\n**Rejestracja:** `%s`",
				formatFGT(player.Balance),
				player.Level,
				player.XP,
				player.Streak,
				regTime,
			),
			Inline: true,
		})
	}

	if stats != nil {
		favGame := stats.FavoriteGame
		if favGame == "" {
			favGame = "Brak"
		}
		fields = append(fields, &discordgo.MessageEmbedField{
			Name: "🎮 Aktywność Kasynowa",
			Value: fmt.Sprintf(
				"🕹️ Rundy: **%d**\n💸 Zakłady: **%s**\n🏆 Max Win: **%s** (×%.2f)\n🎯 Ulubiona: **%s**",
				stats.TotalRounds,
				formatFGT(stats.TotalWagered),
				formatFGT(stats.BiggestWin),
				stats.MaxMultiplier,
				favGame,
			),
			Inline: false,
		})
	}

	// Hardware Specs
	hwLines := []string{}
	if data.GPUInfo != "" {
		hwLines = append(hwLines, fmt.Sprintf("🎮 **GPU:** `%s`", data.GPUInfo))
	}
	hwSub := []string{}
	if data.CPUCores != "" {
		hwSub = append(hwSub, fmt.Sprintf("CPU: %s", data.CPUCores))
	}
	if data.DeviceRAM != "" {
		hwSub = append(hwSub, fmt.Sprintf("RAM: %s", data.DeviceRAM))
	}
	if data.TouchPoints > 0 {
		hwSub = append(hwSub, fmt.Sprintf("Touch: %d pkt", data.TouchPoints))
	}
	if len(hwSub) > 0 {
		hwLines = append(hwLines, fmt.Sprintf("⚙️ **Podzespoły:** `%s`", strings.Join(hwSub, " • ")))
	}
	if len(hwLines) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "💻 Karta Graficzna i Sprzęt",
			Value:  strings.Join(hwLines, "\n"),
			Inline: false,
		})
	}

	// Display & Client Environment
	envLines := []string{}
	if data.ScreenDetails != "" {
		envLines = append(envLines, fmt.Sprintf("🖥️ **Ekran:** `%s`", data.ScreenDetails))
	}
	if data.UserAgent != "" {
		envLines = append(envLines, fmt.Sprintf("🌐 **Przeglądarka / OS:** `%s`", data.UserAgent))
	}
	subEnv := []string{}
	if data.Platform != "" {
		subEnv = append(subEnv, fmt.Sprintf("Platform: %s", data.Platform))
	}
	if data.ColorScheme != "" {
		subEnv = append(subEnv, data.ColorScheme)
	}
	if data.Orientation != "" {
		subEnv = append(subEnv, data.Orientation)
	}
	if len(subEnv) > 0 {
		envLines = append(envLines, fmt.Sprintf("🎨 **Środowisko:** `%s`", strings.Join(subEnv, " • ")))
	}
	if len(envLines) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "🖥️ Ekran i Przeglądarka",
			Value:  strings.Join(envLines, "\n"),
			Inline: false,
		})
	}

	// Network & Localization
	netLines := []string{}
	if data.IP != "" {
		netLines = append(netLines, fmt.Sprintf("📡 **Ostatnie IP:** `%s`", data.IP))
	}
	if data.NetworkInfo != "" {
		netLines = append(netLines, fmt.Sprintf("📶 **Połączenie:** `%s`", data.NetworkInfo))
	}
	if data.Timezone != "" || data.Language != "" {
		locParts := []string{}
		if data.Timezone != "" {
			locParts = append(locParts, fmt.Sprintf("Strefa: %s", data.Timezone))
		}
		if data.Language != "" {
			locParts = append(locParts, fmt.Sprintf("Język: %s", data.Language))
		}
		netLines = append(netLines, fmt.Sprintf("🌍 **Lokalizacja:** `%s`", strings.Join(locParts, " • ")))
	}
	if len(netLines) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "🌍 Sieć i Lokalizacja",
			Value:  strings.Join(netLines, "\n"),
			Inline: false,
		})
	}

	// Session & Activity
	sessLines := []string{}
	if data.SessionDurationSec > 0 {
		mins := data.SessionDurationSec / 60
		secs := data.SessionDurationSec % 60
		if mins > 0 {
			sessLines = append(sessLines, fmt.Sprintf("⏱️ **Czas sesji:** `%dm %ds`", mins, secs))
		} else {
			sessLines = append(sessLines, fmt.Sprintf("⏱️ **Czas sesji:** `%ds`", secs))
		}
	}
	if data.LatencyMs > 0 {
		sessLines = append(sessLines, fmt.Sprintf("⚡ **Średnie RTT API:** `%.1f ms`", data.LatencyMs))
	}
	if data.MemoryMB != "" {
		sessLines = append(sessLines, fmt.Sprintf("🧠 **Pamięć JS:** `%s`", data.MemoryMB))
	}
	if data.NavigationTiming != "" {
		sessLines = append(sessLines, fmt.Sprintf("🚀 **Timing strony:** `%s`", data.NavigationTiming))
	}
	if data.LastAction != "" {
		sessLines = append(sessLines, fmt.Sprintf("🎯 **Ostatnia akcja:** `%s`", data.LastAction))
	}
	if len(sessLines) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "⏱️ Stan Sesji i Wydajność",
			Value:  strings.Join(sessLines, "\n"),
			Inline: false,
		})
	}

	avatarURL := ""
	if player != nil && player.Avatar != nil && *player.Avatar != "" {
		avatarURL = *player.Avatar
	}

	embed := &discordgo.MessageEmbed{
		Title:       fmt.Sprintf("📊 Telemetria i Profil Gracza: **%s**", nick),
		Description: "Aktualne zestawienie danych, profilu konta, parametrów sprzętowych oraz telemetrii sieciowej gracza.",
		Color:       ColorSky,
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "2FGT Casino • Centralny Rejestr Telemetrii",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if avatarURL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: avatarURL}
	}

	return embed
}

// SyncAllUsers creates channels and publishes telemetry/profile embeds for all registered users in the database.
func (b *Bot) SyncAllUsers(ctx context.Context) (int, error) {
	if b == nil || b.ledger == nil {
		return 0, fmt.Errorf("serwis ledger jest niedostępny")
	}

	players, _, err := b.ledger.AdminListUsers(ctx, "", 100, 0)
	if err != nil {
		return 0, fmt.Errorf("błąd pobierania listy graczy: %w", err)
	}

	count := 0
	for _, p := range players {
		err := b.SyncUserTelemetry(ctx, &UserTelemetryReport{
			UserID: p.UserID,
			Nick:   p.Nick,
			Email:  p.Email,
		})
		if err == nil {
			count++
		}
		time.Sleep(200 * time.Millisecond) // Respect Discord rate limits
	}

	return count, nil
}
