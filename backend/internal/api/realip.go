package api

import (
	"net"
	"net/http"
	"strings"
)

// GetClientIP extracts the client's real IP address from headers, prioritizing
// X-Remote-Ip, CF-Connecting-Ip, X-Forwarded-For, and X-Real-IP before falling back to RemoteAddr.
func GetClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}

	// 1. X-Remote-Ip / X-Remote-IP header
	if ip := strings.TrimSpace(r.Header.Get("X-Remote-Ip")); ip != "" {
		return cleanIP(ip)
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Remote-IP")); ip != "" {
		return cleanIP(ip)
	}

	// 2. Cloudflare CF-Connecting-Ip / CF-Connecting-IP
	if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-Ip")); ip != "" {
		return cleanIP(ip)
	}
	if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
		return cleanIP(ip)
	}

	// 3. X-Forwarded-For (first IP in proxy chain)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for _, p := range parts {
			ip := strings.TrimSpace(p)
			if ip != "" {
				return cleanIP(ip)
			}
		}
	}

	// 4. X-Real-IP
	if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
		return cleanIP(xrip)
	}

	// 5. RemoteAddr
	return cleanIP(r.RemoteAddr)
}

func cleanIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(raw); err == nil && host != "" {
		return host
	}
	return raw
}

// RealIPMiddleware overwrites r.RemoteAddr with the resolved client IP
func RealIPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientIP := GetClientIP(r)
		if clientIP != "" {
			r.RemoteAddr = clientIP
		}
		next.ServeHTTP(w, r)
	})
}
