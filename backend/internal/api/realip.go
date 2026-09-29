package api

import (
	"net"
	"net/http"
	"strings"
)

var (
	_, mutedSubnet, _ = net.ParseCIDR("193.93.68.0/22")
)

// IsMutedSubnet checks if the given IP address is within the 193.93.68.0/22 range.
func IsMutedSubnet(ipStr string) bool {
	if ipStr == "" || mutedSubnet == nil {
		return false
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	return mutedSubnet.Contains(ip)
}

// GetClientIP returns the client's real IP address, extracted by Chi's RealIP middleware.
func GetClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}
