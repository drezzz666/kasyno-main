package telemetry

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

type CryptoManager struct {
	privKey   *ecdh.PrivateKey
	pubKey    *ecdh.PublicKey
	pubKeyHex string
	pubKeyB64 string
}

func NewCryptoManager(secret string) (*CryptoManager, error) {
	if secret == "" {
		secret = "kasyno_telemetry_secure_default_secret_v1"
	}

	// Deterministic HMAC-SHA256 derivation of 32-byte P-256 scalar
	mac := hmac.New(sha256.New, []byte("kasyno-telemetry-ecdh-p256-salt-v1"))
	mac.Write([]byte(secret))
	privBytes := mac.Sum(nil)

	privKey, err := ecdh.P256().NewPrivateKey(privBytes)
	if err != nil {
		h := sha256.Sum256(privBytes)
		privKey, err = ecdh.P256().NewPrivateKey(h[:])
		if err != nil {
			return nil, fmt.Errorf("failed to initialize telemetry ecdh private key: %w", err)
		}
	}

	pubKey := privKey.PublicKey()
	pubRaw := pubKey.Bytes() // 65 bytes uncompressed: 0x04 || X || Y

	return &CryptoManager{
		privKey:   privKey,
		pubKey:    pubKey,
		pubKeyHex: hex.EncodeToString(pubRaw),
		pubKeyB64: base64.StdEncoding.EncodeToString(pubRaw),
	}, nil
}

func (cm *CryptoManager) PublicKeyHex() string {
	if cm == nil {
		return ""
	}
	return cm.pubKeyHex
}

func (cm *CryptoManager) PublicKeyBase64() string {
	if cm == nil {
		return ""
	}
	return cm.pubKeyB64
}

// EncryptedPayload represents the JSON envelope sent by the frontend
type EncryptedPayload struct {
	Version   int    `json:"v"`
	EpkBase64 string `json:"epk"`
	IVBase64  string `json:"iv"`
	Data      string `json:"d"`
}

// Decrypt unpacks an encrypted telemetry envelope, or returns raw bytes if it's plaintext
func (cm *CryptoManager) Decrypt(body []byte) ([]byte, error) {
	if cm == nil || cm.privKey == nil || len(body) == 0 {
		return body, nil
	}

	var env EncryptedPayload
	if err := json.Unmarshal(body, &env); err != nil || env.Version != 1 || env.EpkBase64 == "" || env.IVBase64 == "" || env.Data == "" {
		// Plaintext fallback
		return body, nil
	}

	epkBytes, err := base64.StdEncoding.DecodeString(env.EpkBase64)
	if err != nil {
		return nil, errors.New("invalid epk encoding")
	}

	clientPub, err := ecdh.P256().NewPublicKey(epkBytes)
	if err != nil {
		return nil, errors.New("invalid client public key")
	}

	sharedSecret, err := cm.privKey.ECDH(clientPub)
	if err != nil {
		return nil, fmt.Errorf("ECDH computation failed: %w", err)
	}

	iv, err := base64.StdEncoding.DecodeString(env.IVBase64)
	if err != nil || len(iv) != 12 {
		return nil, errors.New("invalid iv length (expected 12 bytes)")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(env.Data)
	if err != nil {
		return nil, errors.New("invalid ciphertext base64")
	}

	block, err := aes.NewCipher(sharedSecret)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (MAC mismatch): %w", err)
	}

	return plaintext, nil
}
