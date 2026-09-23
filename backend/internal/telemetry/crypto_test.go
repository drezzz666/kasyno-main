package telemetry

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"testing"
)

func TestCryptoManager_Roundtrip(t *testing.T) {
	secret := "my_test_secret_for_telemetry_123"
	cm, err := NewCryptoManager(secret)
	if err != nil {
		t.Fatalf("failed to create crypto manager: %v", err)
	}

	pubHex := cm.PublicKeyHex()
	if len(pubHex) != 130 { // 65 bytes * 2
		t.Fatalf("expected 130 hex chars for P-256 uncompressed public key, got %d", len(pubHex))
	}

	// 1. Simulate browser WebCrypto client encryption
	serverPubBytes, _ := hex.DecodeString(pubHex)
	serverPub, err := ecdh.P256().NewPublicKey(serverPubBytes)
	if err != nil {
		t.Fatalf("failed to parse server public key: %v", err)
	}

	clientPriv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate client ephemeral key: %v", err)
	}
	clientPub := clientPriv.PublicKey()

	sharedSecret, err := clientPriv.ECDH(serverPub)
	if err != nil {
		t.Fatalf("failed client ECDH: %v", err)
	}

	block, err := aes.NewCipher(sharedSecret)
	if err != nil {
		t.Fatalf("failed to create AES cipher: %v", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatalf("failed to create GCM: %v", err)
	}

	iv := make([]byte, 12)
	_, _ = io.ReadFull(rand.Reader, iv)

	originalJSON := `{"error_type":"UNHANDLED_EXCEPTION","message":"Test message for encryption"}`
	ciphertext := gcm.Seal(nil, iv, []byte(originalJSON), nil)

	env := EncryptedPayload{
		Version:   1,
		EpkBase64: base64.StdEncoding.EncodeToString(clientPub.Bytes()),
		IVBase64:  base64.StdEncoding.EncodeToString(iv),
		Data:      base64.StdEncoding.EncodeToString(ciphertext),
	}

	envBytes, _ := json.Marshal(env)

	// 2. Server Decryption
	decrypted, err := cm.Decrypt(envBytes)
	if err != nil {
		t.Fatalf("server failed to decrypt payload: %v", err)
	}

	if string(decrypted) != originalJSON {
		t.Fatalf("expected decrypted string %q, got %q", originalJSON, string(decrypted))
	}

	// 3. Tamper detection: alter 1 byte in ciphertext
	badCiphertext := append([]byte(nil), ciphertext...)
	badCiphertext[0] ^= 0xFF
	badEnv := EncryptedPayload{
		Version:   1,
		EpkBase64: base64.StdEncoding.EncodeToString(clientPub.Bytes()),
		IVBase64:  base64.StdEncoding.EncodeToString(iv),
		Data:      base64.StdEncoding.EncodeToString(badCiphertext),
	}
	badEnvBytes, _ := json.Marshal(badEnv)

	_, err = cm.Decrypt(badEnvBytes)
	if err == nil {
		t.Fatalf("expected error on tampered payload, got nil")
	}

	// 4. Plaintext fallback
	plainInput := []byte(`{"plain":"text"}`)
	plainOut, err := cm.Decrypt(plainInput)
	if err != nil || string(plainOut) != string(plainInput) {
		t.Fatalf("expected plaintext to pass through unchanged, got: %s (err=%v)", string(plainOut), err)
	}
}

func TestCryptoManager_DeterministicKey(t *testing.T) {
	secret := "secret_reproducibility_test_xyz"
	cm1, err := NewCryptoManager(secret)
	if err != nil {
		t.Fatalf("failed cm1: %v", err)
	}
	cm2, err := NewCryptoManager(secret)
	if err != nil {
		t.Fatalf("failed cm2: %v", err)
	}

	if cm1.PublicKeyHex() != cm2.PublicKeyHex() {
		t.Fatalf("expected identical public key from identical secret: %s vs %s", cm1.PublicKeyHex(), cm2.PublicKeyHex())
	}
	if cm1.PublicKeyBase64() != cm2.PublicKeyBase64() {
		t.Fatalf("expected identical base64 public key: %s vs %s", cm1.PublicKeyBase64(), cm2.PublicKeyBase64())
	}
}

func TestCryptoManager_InvalidAndCorruptedEnvelopes(t *testing.T) {
	cm, _ := NewCryptoManager("test_secret_invalid_envelopes")

	invalidCases := []struct {
		name    string
		payload string
	}{
		{
			name:    "Invalid EPK Base64",
			payload: `{"v":1,"epk":"@@@invalid_base64@@@","iv":"dGVzdGl2MTIzNDU2","d":"Y2lwaGVydGV4dA=="}`,
		},
		{
			name:    "Wrong curve point (invalid P-256 public key)",
			payload: `{"v":1,"epk":"dGVzdA==","iv":"dGVzdGl2MTIzNDU2","d":"Y2lwaGVydGV4dA=="}`,
		},
		{
			name:    "Short IV (8 bytes instead of 12)",
			payload: `{"v":1,"epk":"BC92x367sM3G3A9D1X8C4e...","iv":"dGVzdGl2","d":"Y2lwaGVydGV4dA=="}`,
		},
		{
			name:    "Corrupted ciphertext base64",
			payload: `{"v":1,"epk":"BC92x367sM3G3A9D1X8C4e...","iv":"dGVzdGl2MTIzNDU2","d":"!!!not_base64!!!"}`,
		},
	}

	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := cm.Decrypt([]byte(tc.payload))
			if err == nil {
				t.Fatalf("expected error for case %q, got nil", tc.name)
			}
		})
	}
}
