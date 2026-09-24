package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string
	AppURL               string
	DatabaseURL          string
	SessionSecret        string
	AuthentikIssuer      string
	AuthentikClientID    string
	AuthentikClientSecret string
	AuthentikAuthURL     string
	AuthentikTokenURL    string
	AuthentikUserinfoURL string
	AuthentikEndSessionURL string
	DefaultBalance        int64
	DailyMissionTarget    int
	DailyMissionReward    int64
	DiscordErrorWebhookURL    string
	DiscordSecurityWebhookURL string
	DiscordBotToken           string
	DiscordGuildID            string
	DiscordAdminRole          string
	DiscordAdminUsers         []string
}

func Load() *Config {
	// Load .env if present (ignore error if file doesn't exist)
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	port := getEnv("PORT", "8080")
	appURL := strings.TrimRight(getEnv("APP_URL", "http://localhost:3000"), "/")
	dbURL := getEnv("DATABASE_URL", "postgres://kasyno:kasyno_pass@127.0.0.1:5432/kasyno")
	sessionSecret := getEnv("SESSION_SECRET", "kasyno-2fgt-secret-key-replace-in-env-production-32-chars")
	
	authentikIssuer := strings.TrimRight(getEnv("AUTHENTIK_ISSUER", "https://login.2fgt.pl/application/o/kasyno/"), "/")
	authentikClientID := getEnv("AUTHENTIK_CLIENT_ID", "")
	authentikClientSecret := getEnv("AUTHENTIK_CLIENT_SECRET", "")

	discordErrorWebhook := getEnv("DISCORD_ERROR_WEBHOOK_URL", "")
	if discordErrorWebhook == "" {
		discordErrorWebhook = getEnv("DISCORD_WEBHOOK_URL", "")
	}

	discordSecurityWebhook := getEnv("DISCORD_SECURITY_WEBHOOK_URL", "")
	if discordSecurityWebhook == "" {
		discordSecurityWebhook = getEnv("DISCORD_ANTICHEAT_WEBHOOK_URL", "")
	}
	if discordSecurityWebhook == "" {
		discordSecurityWebhook = discordErrorWebhook
	}

	discordBotToken := getEnv("DISCORD_BOT_TOKEN", "")
	discordGuildID := getEnv("DISCORD_GUILD_ID", "")
	discordAdminRole := getEnv("DISCORD_ADMIN_ROLE", "Admin")
	rawAdminUsers := getEnv("DISCORD_ADMIN_USER_IDS", "")
	var adminUsers []string
	if rawAdminUsers != "" {
		for _, u := range strings.Split(rawAdminUsers, ",") {
			trimmed := strings.TrimSpace(u)
			if trimmed != "" {
				adminUsers = append(adminUsers, trimmed)
			}
		}
	}

	return &Config{
		Port:                  port,
		AppURL:                appURL,
		DatabaseURL:           dbURL,
		SessionSecret:         sessionSecret,
		AuthentikIssuer:       authentikIssuer,
		AuthentikClientID:     authentikClientID,
		AuthentikClientSecret: authentikClientSecret,
		AuthentikAuthURL:      getEnv("AUTHENTIK_AUTH_URL", ""),
		AuthentikTokenURL:     getEnv("AUTHENTIK_TOKEN_URL", ""),
		AuthentikUserinfoURL:  getEnv("AUTHENTIK_USERINFO_URL", ""),
		AuthentikEndSessionURL: getEnv("AUTHENTIK_END_SESSION_URL", ""),
		DefaultBalance:        getEnvInt64("DEFAULT_BALANCE", 1000),
		DailyMissionTarget:    getEnvInt("DAILY_MISSION_TARGET", 5),
		DailyMissionReward:    getEnvInt64("DAILY_MISSION_REWARD", 250),
		DiscordErrorWebhookURL:    discordErrorWebhook,
		DiscordSecurityWebhookURL: discordSecurityWebhook,
		DiscordBotToken:           discordBotToken,
		DiscordGuildID:            discordGuildID,
		DiscordAdminRole:          discordAdminRole,
		DiscordAdminUsers:         adminUsers,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	b, err := strconv.ParseBool(val)
	if err != nil {
		return fallback
	}
	return b
}

func getEnvInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvInt64(key string, fallback int64) int64 {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
