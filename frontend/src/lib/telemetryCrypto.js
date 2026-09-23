// Asymmetric client-side ECIES encryption for telemetry and error reports (P-256 ECDH + AES-256-GCM)
// Ensures users/attackers inspecting DevTools Network tab cannot view telemetry diagnostics or breadcrumbs.

let cachedServerCryptoKey = null;
let keyFetchPromise = null;

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function hexToBytes(hex) {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Retrieves and caches the server public ECDH key.
 */
export async function getServerPublicKey() {
  if (cachedServerCryptoKey) {
    return cachedServerCryptoKey;
  }

  if (keyFetchPromise) {
    return keyFetchPromise;
  }

  keyFetchPromise = (async () => {
    try {
      if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
        return null;
      }

      const res = await fetch("/api/telemetry/key", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.pubkey) return null;

      const rawBytes = hexToBytes(data.pubkey);
      const imported = await window.crypto.subtle.importKey(
        "raw",
        rawBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );

      cachedServerCryptoKey = imported;
      return imported;
    } catch (err) {
      console.warn("[Telemetry] Failed to load server encryption key:", err);
      return null;
    } finally {
      keyFetchPromise = null;
    }
  })();

  return keyFetchPromise;
}

/**
 * Encrypts a telemetry / error payload object.
 * Returns a JSON string of { v: 1, epk: "...", iv: "...", d: "..." }
 * If WebCrypto is not available or fails, returns standard JSON.stringify(payload).
 */
export async function encryptTelemetry(payload) {
  try {
    if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
      return JSON.stringify(payload);
    }

    const serverKey = await getServerPublicKey();
    if (!serverKey) {
      return JSON.stringify(payload);
    }

    // 1. Generate client ephemeral P-256 keypair
    const ephemeral = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"]
    );

    // 2. Derive 256-bit AES-GCM shared key
    const aesKey = await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: serverKey },
      ephemeral.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // 3. Export ephemeral public key (65 bytes raw uncompressed)
    const epkRaw = await window.crypto.subtle.exportKey("raw", ephemeral.publicKey);

    // 4. Encrypt payload with random 12-byte IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const jsonStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    const encoded = new TextEncoder().encode(jsonStr);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encoded
    );

    // 5. Package encrypted envelope
    const envelope = {
      v: 1,
      epk: bufferToBase64(epkRaw),
      iv: bufferToBase64(iv),
      d: bufferToBase64(ciphertext),
    };

    return JSON.stringify(envelope);
  } catch (err) {
    console.warn("[Telemetry] Encryption fallback to plaintext:", err);
    return JSON.stringify(payload);
  }
}
