package captcha

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrCaptchaExpired   = errors.New("captcha wygasła (spróbuj ponownie)")
	ErrCaptchaInvalid   = errors.New("nieprawidłowy kod captcha")
	ErrCaptchaReplayed  = errors.New("kod captcha został już wykorzystany")
	ErrCaptchaRateLimit = errors.New("zbyt szybkie rozwiązywanie captcha (odczekaj chwilę)")
)

// Single-use consumed store for anti-replay
type consumedStore struct {
	mu    sync.Mutex
	items map[string]int64
}

var store = &consumedStore{
	items: make(map[string]int64),
}

func init() {
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			now := time.Now().Unix()
			store.mu.Lock()
			for id, exp := range store.items {
				if exp < now {
					delete(store.items, id)
				}
			}
			store.mu.Unlock()

			cooldowns.mu.Lock()
			for uid, last := range cooldowns.lastClaim {
				if now-last > 300 {
					delete(cooldowns.lastClaim, uid)
				}
			}
			cooldowns.mu.Unlock()
		}
	}()
}

func (s *consumedStore) MarkConsumed(id string, expiresAt int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.items[id]; exists {
		return false
	}
	s.items[id] = expiresAt
	return true
}

// User cooldown tracker (min 2 seconds between successful solves)
type userCooldown struct {
	mu        sync.Mutex
	lastClaim map[string]int64
}

var cooldowns = &userCooldown{
	lastClaim: make(map[string]int64),
}

func (c *userCooldown) CheckAndSet(userID string, minIntervalSec int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().Unix()
	if last, ok := c.lastClaim[userID]; ok {
		if now-last < minIntervalSec {
			return false
		}
	}
	c.lastClaim[userID] = now
	return true
}

// Challenge sent to frontend. Note: answer/display is strictly NOT exposed.
type Challenge struct {
	ID        string `json:"id"`
	Type      string `json:"type"` // "text" or "math"
	IssuedAt  int64  `json:"issued_at"`
	Signature string `json:"signature"`
	Image     []byte `json:"-"` // Pure binary PNG image bytes
	Answer    string `json:"-"`
}

const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func randomString(length int) string {
	b := make([]byte, length)
	for i := 0; i < length; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

func sign(userID, secret, id, answer string, issuedAt int64) string {
	msg := fmt.Sprintf("%s:%s:%s:%d", userID, id, strings.ToUpper(strings.TrimSpace(answer)), issuedAt)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

// 5x7 bitmap font definitions for alphanumeric characters + math symbols
var font5x7 = map[rune][7]uint8{
	'0': {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E},
	'1': {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
	'2': {0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F},
	'3': {0x1E, 0x01, 0x01, 0x0E, 0x01, 0x01, 0x1E},
	'4': {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02},
	'5': {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E},
	'6': {0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E},
	'7': {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
	'8': {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E},
	'9': {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C},
	'A': {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11},
	'B': {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E},
	'C': {0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E},
	'D': {0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C},
	'E': {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F},
	'F': {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10},
	'G': {0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F},
	'H': {0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11},
	'J': {0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C},
	'K': {0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11},
	'L': {0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F},
	'M': {0x11, 0x1B, 0x15, 0x11, 0x11, 0x11, 0x11},
	'N': {0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11},
	'P': {0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10},
	'Q': {0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D},
	'R': {0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11},
	'S': {0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E},
	'T': {0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04},
	'U': {0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E},
	'V': {0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04},
	'W': {0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11},
	'X': {0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11},
	'Y': {0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04},
	'Z': {0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F},
	'+': {0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00},
	'-': {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00},
	'=': {0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00, 0x00},
	'?': {0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04},
	' ': {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00},
}

var palette = []color.RGBA{
	{R: 251, G: 191, B: 36, A: 255},  // Amber
	{R: 56, G: 189, B: 248, A: 255},  // Sky
	{R: 52, G: 211, B: 153, A: 255},  // Emerald
	{R: 244, G: 63, B: 94, A: 255},   // Rose
	{R: 167, G: 139, B: 250, A: 255}, // Purple
	{R: 245, G: 158, B: 11, A: 255},  // Gold
}

// RenderCaptchaPNG generates pure binary PNG image bytes with anti-OCR warp and noise
func RenderCaptchaPNG(text string) []byte {
	const width = 280
	const height = 75

	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// 1. Dark Gradient Background
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			factor := float64(x+y) / float64(width+height)
			r := uint8(14 + factor*12)
			g := uint8(19 + factor*15)
			b := uint8(31 + factor*20)
			img.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
		}
	}

	// 2. Background Noise lines (10 lines with varying colors and angles)
	for i := 0; i < 10; i++ {
		col := palette[i%len(palette)]
		col.A = 80
		x0, _ := rand.Int(rand.Reader, big.NewInt(width))
		y0, _ := rand.Int(rand.Reader, big.NewInt(height))
		x1, _ := rand.Int(rand.Reader, big.NewInt(width))
		y1, _ := rand.Int(rand.Reader, big.NewInt(height))
		drawLine(img, int(x0.Int64()), int(y0.Int64()), int(x1.Int64()), int(y1.Int64()), col)
	}

	// 3. Background Random Noise Specks (120 specks)
	for i := 0; i < 120; i++ {
		x, _ := rand.Int(rand.Reader, big.NewInt(width))
		y, _ := rand.Int(rand.Reader, big.NewInt(height))
		cIdx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(palette))))
		col := palette[cIdx.Int64()]
		col.A = 130
		img.Set(int(x.Int64()), int(y.Int64()), col)
		img.Set(int(x.Int64())+1, int(y.Int64()), col)
	}

	// 4. Render Characters with Font Matrix + Scale + Slant + Jitter
	chars := []rune(text)
	charCount := len(chars)
	const scale = 5
	const charW = 5 * scale
	const charH = 7 * scale
	spacing := 5
	if charCount > 6 {
		spacing = 3
	}
	totalTextW := charCount*charW + (charCount-1)*spacing
	startX := (width - totalTextW) / 2
	if startX < 10 {
		startX = 10
	}

	for idx, ch := range chars {
		glyph, ok := font5x7[ch]
		if !ok {
			glyph = font5x7['?']
		}
		col := palette[idx%len(palette)]

		// Per-character jitter and mild slant
		charJitterY := int(math.Sin(float64(idx)*1.7)*5.0) + int(float64((int(ch)%5)-2)*1.2)
		slant := float64((int(ch)%5)-2) * 0.08 // mild slant between -0.16 and +0.16

		cX := startX + idx*(charW+spacing)
		cY := (height-charH)/2 + charJitterY

		for row := 0; row < 7; row++ {
			bits := glyph[row]
			for colBit := 0; colBit < 5; colBit++ {
				if (bits & (1 << (4 - colBit))) != 0 {
					for dy := 0; dy < scale; dy++ {
						for dx := 0; dx < scale; dx++ {
							px := cX + colBit*scale + dx + int(float64(row*scale+dy)*slant)
							py := cY + row*scale + dy
							if px >= 0 && px < width && py >= 0 && py < height {
								img.Set(px, py, col)
							}
						}
					}
				}
			}
		}
	}

	// 5. Apply Multi-Harmonic Wave Distortion
	distorted := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(distorted, distorted.Bounds(), img, image.Point{}, draw.Src)

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			srcX := x + int(math.Sin(float64(y)/7.0)*3.5 + math.Cos(float64(x)/16.0)*1.8)
			srcY := y + int(math.Cos(float64(x)/9.0)*3.8 + math.Sin(float64(y)/8.0)*1.8)
			if srcX >= 0 && srcX < width && srcY >= 0 && srcY < height {
				distorted.Set(x, y, img.At(srcX, srcY))
			}
		}
	}

	// 6. Two Foreground Intersecting Sine Wave Interference Curves
	for x := 0; x < width; x++ {
		// Curve 1: Gold wave
		y1 := int(float64(height)/2.0 + math.Sin(float64(x)/13.0)*13.0 + math.Cos(float64(x)/28.0)*5.0)
		if y1 >= 0 && y1 < height {
			distorted.Set(x, y1, color.RGBA{R: 251, G: 191, B: 36, A: 160})
			if y1+1 < height {
				distorted.Set(x, y1+1, color.RGBA{R: 251, G: 191, B: 36, A: 140})
			}
		}

		// Curve 2: Cyan wave crossing in opposite direction
		y2 := int(float64(height)/2.0 - math.Cos(float64(x)/16.0)*12.0 + math.Sin(float64(x)/22.0)*6.0)
		if y2 >= 0 && y2 < height {
			distorted.Set(x, y2, color.RGBA{R: 56, G: 189, B: 248, A: 150})
			if y2+1 < height {
				distorted.Set(x, y2+1, color.RGBA{R: 56, G: 189, B: 248, A: 130})
			}
		}
	}

	// 7. Foreground pepper noise (50 specks on top)
	for i := 0; i < 50; i++ {
		x, _ := rand.Int(rand.Reader, big.NewInt(width))
		y, _ := rand.Int(rand.Reader, big.NewInt(height))
		distorted.Set(int(x.Int64()), int(y.Int64()), color.RGBA{R: 240, G: 240, B: 245, A: 180})
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, distorted)
	return buf.Bytes()
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, col color.RGBA) {
	dx := int(math.Abs(float64(x1 - x0)))
	dy := int(math.Abs(float64(y1 - y0)))
	sx := 1
	if x0 >= x1 {
		sx = -1
	}
	sy := 1
	if y0 >= y1 {
		sy = -1
	}
	err := dx - dy

	for {
		if x0 >= 0 && x0 < img.Bounds().Dx() && y0 >= 0 && y0 < img.Bounds().Dy() {
			img.Set(x0, y0, col)
		}
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x0 += sx
		}
		if e2 < dx {
			err += dx
			y0 += sy
		}
	}
}

// Generate creates a cryptographically signed Captcha challenge for a user
func Generate(userID, secret string) *Challenge {
	idBytes := make([]byte, 16)
	_, _ = rand.Read(idBytes)
	id := hex.EncodeToString(idBytes)
	issuedAt := time.Now().Unix()

	useMathVal, _ := rand.Int(rand.Reader, big.NewInt(3))
	isMath := useMathVal.Int64() == 0

	var displayText string
	var answer string
	var chType string

	if isMath {
		chType = "math"
		opVal, _ := rand.Int(rand.Reader, big.NewInt(3))
		switch opVal.Int64() {
		case 0: // 2-digit addition: e.g. 38 + 47 = 85
			a, _ := rand.Int(rand.Reader, big.NewInt(50))
			b, _ := rand.Int(rand.Reader, big.NewInt(40))
			n1 := a.Int64() + 25
			n2 := b.Int64() + 18
			displayText = fmt.Sprintf("%d+%d", n1, n2)
			answer = strconv.FormatInt(n1+n2, 10)
		case 1: // 2-digit subtraction: e.g. 74 - 28 = 46
			a, _ := rand.Int(rand.Reader, big.NewInt(50))
			b, _ := rand.Int(rand.Reader, big.NewInt(30))
			n1 := a.Int64() + 45
			n2 := b.Int64() + 14
			displayText = fmt.Sprintf("%d-%d", n1, n2)
			answer = strconv.FormatInt(n1-n2, 10)
		default: // 3-term calculation: e.g. 15+8-6 = 17
			a, _ := rand.Int(rand.Reader, big.NewInt(25))
			b, _ := rand.Int(rand.Reader, big.NewInt(20))
			c, _ := rand.Int(rand.Reader, big.NewInt(15))
			n1 := a.Int64() + 10
			n2 := b.Int64() + 5
			n3 := c.Int64() + 3
			displayText = fmt.Sprintf("%d+%d-%d", n1, n2, n3)
			answer = strconv.FormatInt(n1+n2-n3, 10)
		}
	} else {
		chType = "text"
		answer = randomString(6) // 6 alphanumeric characters
		displayText = answer
	}

	sig := sign(userID, secret, id, answer, issuedAt)
	pngBytes := RenderCaptchaPNG(displayText)

	return &Challenge{
		ID:        id,
		Image:     pngBytes,
		Type:      chType,
		IssuedAt:  issuedAt,
		Signature: sig,
		Answer:    answer,
	}
}

// Verify checks the user's answer against the signed challenge
func Verify(userID, secret, id, userProvidedAnswer, expectedSig string, issuedAt int64) error {
	now := time.Now().Unix()

	// 1. Expiration check (5 minutes)
	if now-issuedAt > 300 || issuedAt > now+60 {
		return ErrCaptchaExpired
	}

	// 2. Anti-Replay check
	if !store.MarkConsumed(id, issuedAt+360) {
		return ErrCaptchaReplayed
	}

	// 3. User answer signature match
	expectedUserSig := sign(userID, secret, id, userProvidedAnswer, issuedAt)
	if !hmac.Equal([]byte(expectedSig), []byte(expectedUserSig)) {
		return ErrCaptchaInvalid
	}

	// 4. Rate limit check (minimum 2 seconds between claim solves)
	if !cooldowns.CheckAndSet(userID, 2) {
		return ErrCaptchaRateLimit
	}

	return nil
}
