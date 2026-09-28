// Web Audio API Procedural Casino Sound Effects (No external audio file dependency issues)

class CasinoSoundEngine {
  constructor() {
    this.ctx = null;
    this.lastWin = 0;
    this.lastLoss = 0;
    this.lastPush = 0;
    this.muted = false;
    try {
      this.muted = localStorage.getItem("fgt_muted") === "true";
    } catch {}
    // BGM Web Audio state (using Web Audio API to prevent Android media notification)
    this.bgmBuffer = null;
    this.bgmLoading = null;
    this.bgmSource = null;
    this.bgmGain = null;
    this.bgmStartedAt = 0;
    this.bgmPausedAt = 0;
    this.bgmVolume = 0.2;
    this.bgmIsPlaying = false;
    this.bgmStarting = false;

    this.cleanupMediaSession();
  }

  cleanupMediaSession() {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        const actions = ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack", "skipad"];
        actions.forEach((act) => {
          try {
            navigator.mediaSession.setActionHandler(act, null);
          } catch {}
        });
      } catch {}
    }
  }

  getContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(val) {
    this.muted = Boolean(val);
    try {
      localStorage.setItem("fgt_muted", String(this.muted));
    } catch {}
    if (this.moneyRainAudio) {
      this.moneyRainAudio.volume = this.muted ? 0 : 0.75;
    }
    if (this.muted) {
      this.pauseBgm();
    } else {
      if (this.bgmIsPlaying || !this.bgmSource) {
        this.resumeBgm();
      }
    }
  }

  init() {
    if (this.muted) return;
    this.getContext();
  }

  async loadBgm() {
    if (this.bgmBuffer) return this.bgmBuffer;
    if (this.bgmLoading) return this.bgmLoading;

    this.bgmLoading = (async () => {
      try {
        const ctx = this.getContext();
        if (!ctx) return null;
        const res = await fetch("/audio/bgm.m4a");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        this.bgmBuffer = buffer;
        return buffer;
      } catch (err) {
        this.bgmLoading = null;
        return null;
      }
    })();

    return this.bgmLoading;
  }

  async playBgm(volume = this.bgmVolume) {
    this.bgmIsPlaying = true;
    this.bgmVolume = volume;
    if (this.muted || volume <= 0) return;

    if (this.bgmSource || this.bgmStarting) return;
    this.bgmStarting = true;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {}
      }

      const buffer = await this.loadBgm();
      if (!buffer || !this.bgmIsPlaying || this.muted || this.bgmVolume <= 0 || this.bgmSource) return;

      if (!this.bgmGain) {
        this.bgmGain = ctx.createGain();
        this.bgmGain.connect(ctx.destination);
      }
      this.bgmGain.gain.cancelScheduledValues(ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, ctx.currentTime);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.bgmGain);

      const offset = (this.bgmPausedAt || 0) % buffer.duration;
      source.start(0, offset);
      this.bgmStartedAt = ctx.currentTime - offset;
      this.bgmSource = source;
      this.cleanupMediaSession();
    } catch (e) {
      this.bgmSource = null;
    } finally {
      this.bgmStarting = false;
    }
  }

  pauseBgm() {
    if (this.bgmSource && this.ctx) {
      try {
        const elapsed = this.ctx.currentTime - this.bgmStartedAt;
        const duration = this.bgmBuffer?.duration || 1;
        this.bgmPausedAt = ((elapsed % duration) + duration) % duration;
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {}
      this.bgmSource = null;
    }
    this.cleanupMediaSession();
  }

  resumeBgm() {
    if (!this.muted && this.bgmVolume > 0 && !this.bgmSource) {
      this.playBgm(this.bgmVolume);
    }
  }

  setBgmVolume(val) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    if (this.ctx && this.bgmGain) {
      try {
        this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgmGain.gain.setValueAtTime(this.muted ? 0 : this.bgmVolume, this.ctx.currentTime);
      } catch {}
    }
    if (this.bgmVolume === 0) {
      this.pauseBgm();
    } else if (!this.muted && !this.bgmSource && this.bgmIsPlaying) {
      this.resumeBgm();
    }
  }

  stopBgm() {
    this.bgmIsPlaying = false;
    this.pauseBgm();
    this.bgmPausedAt = 0;
  }

  playMoneyRainMusic() {
    this.moneyRainActive = true;
    this.pauseBgm();

    if (!this.moneyRainAudio) {
      this.moneyRainAudio = new Audio("/audio/money.m4a");
      this.moneyRainAudio.loop = true;
    }

    this.moneyRainAudio.volume = this.muted ? 0 : 0.75;
    this.moneyRainAudio.currentTime = 0;

    const promise = this.moneyRainAudio.play();
    if (promise !== undefined) {
      promise.catch(() => {
        // If browser autoplay policy blocked, auto-play on next interaction
        const unlock = () => {
          if (this.moneyRainActive && this.moneyRainAudio) {
            this.moneyRainAudio.play().catch(() => {});
          }
        };
        const events = ["click", "keydown", "touchstart", "pointerdown"];
        events.forEach((evt) => window.addEventListener(evt, unlock, { once: true }));
      });
    }
  }

  stopMoneyRainMusic() {
    this.moneyRainActive = false;
    if (this.moneyRainAudio) {
      try {
        this.moneyRainAudio.pause();
        this.moneyRainAudio.currentTime = 0;
      } catch {}
    }
    if (!this.muted && this.bgmIsPlaying) {
      this.resumeBgm();
    }
  }

  playWin(multiplier = 2) {
    if (this.muted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastWin < 600) return; // Prevent duplicate overlap
    this.lastWin = nowMs;

    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Arpeggio chords
      const freqs = multiplier >= 10
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98] // C5 Major fanfare
        : multiplier >= 3
          ? [523.25, 659.25, 783.99, 1046.5] // C5 Major
          : [659.25, 783.99, 1046.5]; // Quick cheer

      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = multiplier >= 10 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.45);
      });
    } catch (e) {
      // Audio autoplay policy catch
    }
  }

  playBigWin() {
    this.playWin(10);
  }

  playClick() {
    this.playTileClick();
  }

  playCaseTick() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(750 + Math.random() * 90, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  playCoins() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1800 + Math.random() * 800, now + i * 0.05);

        gain.gain.setValueAtTime(0.12, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.09);
      }
    } catch (e) {}
  }

  playCoinToss() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // High resonance ring
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(2400, now);
      osc1.frequency.exponentialRampToValueAtTime(3200, now + 0.4);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.7);

      // Whirring spin harmonic
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1200, now);
      osc2.frequency.exponentialRampToValueAtTime(1800, now + 0.3);
      gain2.gain.setValueAtTime(0.08, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.4);
    } catch (e) {}
  }

  playCoinLand() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Crisp impact clink
      [3100, 2600, 1950].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.02);
        gain.gain.setValueAtTime(0.2 - i * 0.04, now + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.02 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.02);
        osc.stop(now + i * 0.02 + 0.28);
      });
    } catch (e) {}
  }

  playPegTick() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  playCardDeal() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Realistic card snap / swish sound using noise buffer
      const bufferSize = this.ctx.sampleRate * 0.06;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400 + Math.random() * 300, now);
      filter.Q.setValueAtTime(2.5, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
    } catch (e) {}
  }

  playCardFlip() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  playLoss() {
    if (this.muted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastLoss < 600) return; // Prevent duplicate overlap
    this.lastLoss = nowMs;

    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [350, 300, 240];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.1, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.28);
      });
    } catch (e) {}
  }

  playTileClick() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(800 + Math.random() * 200, now);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  playGemReveal(pitchMultiplier = 1) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const baseFreq = 587.33 * Math.min(2.0, pitchMultiplier); // D5 scaled

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  playExplosion() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  }

  playPush() {
    if (this.muted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastPush < 600) return; // Prevent duplicate overlap
    this.lastPush = nowMs;

    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }
}

export const sounds = new CasinoSoundEngine();

