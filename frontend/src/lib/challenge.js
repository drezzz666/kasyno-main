/**
 * Hidden Anti-Bot & Anti-Replay Browser Challenge Solver
 * Computes single-use cryptographic Proof-of-Work tokens for every request.
 */

// Fast synchronous SHA-256 implementation (avoids WebCrypto microtask overhead during PoW loop)
function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words = [];
  const asciiBitLength = ascii.length * 8;
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (let i = 0; i < asciiBitLength; i += 8) {
    words[i >> 5] |= (ascii.charCodeAt(i / 8) & 0xff) << (24 - (i % 32));
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w = [];
    for (let j = 0; j < 16; j++) w[j] = words[i + j] | 0;
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  let result = "";
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

// Single-use queue of pre-solved proofs
const proofQueue = [];
let isRefilling = false;

function isBrowserEnvironment() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof navigator !== "undefined"
  );
}

/**
 * Solves a PoW challenge and formats the X-Browser-Proof header string:
 * Format: <id>:<salt>:<issued_at>:<difficulty>:<signature>:<nonce>
 */
export function solveChallenge(challengeData) {
  if (!isBrowserEnvironment()) {
    throw new Error("Wymagane środowisko przeglądarki");
  }

  const { id, salt, issued_at, difficulty, signature } = challengeData;
  const targetPrefix = "0".repeat(difficulty);

  let nonce = 0;
  while (true) {
    const candidate = String(nonce);
    const hash = sha256(`${id}:${salt}:${candidate}`);
    if (hash.startsWith(targetPrefix)) {
      return `${id}:${salt}:${issued_at}:${difficulty}:${signature}:${candidate}`;
    }
    nonce++;
  }
}

/**
 * Solves a challenge in the background and enqueues it for instant single-use consumption.
 */
export function queueChallenge(challengeData) {
  if (!challengeData || !challengeData.id) return;
  try {
    const proof = solveChallenge(challengeData);
    if (!proofQueue.includes(proof)) {
      proofQueue.push(proof);
    }
  } catch (e) {
    console.warn("Błąd wstępnego rozwiązywania wyzwania antybotowego:", e);
  }
}

/**
 * Proactively ensures 2-3 pre-solved proofs are buffered in the queue for instantaneous clicks.
 */
export async function ensureChallengeBuffer() {
  if (isRefilling || proofQueue.length >= 3) return;
  isRefilling = true;
  try {
    const res = await fetch("/api/casino/challenge", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      queueChallenge(data);
    }
  } catch {
    // Background refill fails silently without interrupting user
  } finally {
    isRefilling = false;
  }
}

/**
 * Retrieves a single-use browser proof.
 * Filters out any stale/expired tokens (older than 45s),
 * pops a valid pre-solved proof immediately (0ms delay),
 * or fetches a fresh challenge on demand.
 */
export async function getBrowserProof() {
  const now = Math.floor(Date.now() / 1000);

  // Drain and discard any expired proofs from the queue
  while (proofQueue.length > 0) {
    const candidate = proofQueue.shift();
    const parts = candidate.split(":");
    const issuedAt = parseInt(parts[2], 10);
    // Keep only non-expired proofs (younger than 45 seconds, not in future > 60s)
    if (!isNaN(issuedAt) && (now - issuedAt) < 45 && (issuedAt - now) < 60) {
      if (proofQueue.length < 2) {
        setTimeout(() => void ensureChallengeBuffer(), 0);
      }
      return candidate;
    }
  }

  // Queue is empty or had stale proofs: fetch a fresh challenge directly
  const res = await fetch("/api/casino/challenge", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Nie udało się pobrać unikalnego wyzwania antybotowego");
  }
  const challengeData = await res.json();
  const solved = solveChallenge(challengeData);
  setTimeout(() => void ensureChallengeBuffer(), 50);
  return solved;
}

/**
 * Invalidate all cached proofs (called on verification errors or 403 refresh)
 */
export function invalidateBrowserProof() {
  proofQueue.length = 0;
}

