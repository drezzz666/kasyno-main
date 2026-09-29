import { useEffect, useState } from "react";
import { sounds } from "../lib/sounds";

export function useAudio() {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem("fgt_muted") === "true";
    } catch {
      return false;
    }
  });
  const [volume, setVolume] = useState(0.2);

  useEffect(() => {
    sounds.setMuted(muted);
    sounds.cleanupMediaSession();

    const startAudio = () => {
      sounds.getContext();
      sounds.cleanupMediaSession();
      if (!muted && volume > 0) {
        sounds.playBgm(volume);
      }
    };

    // User gesture unlock for browser autoplay policy
    const events = ["click", "keydown", "touchstart", "pointerdown"];
    events.forEach((evt) => {
      window.addEventListener(evt, startAudio, { once: true });
    });

    if (!muted && volume > 0) {
      sounds.playBgm(volume);
    }

    // Handle tab visibility (pause when tab hidden / mobile app switched, resume when back)
    const handleVisibility = () => {
      if (document.hidden) {
        sounds.pauseBgm();
      } else {
        if (!muted && volume > 0) {
          sounds.resumeBgm();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, startAudio);
      });
      document.removeEventListener("visibilitychange", handleVisibility);
      sounds.stopBgm();
    };
  }, []);

  useEffect(() => {
    sounds.setMuted(muted);
    sounds.setBgmVolume(volume);
    if (muted || volume === 0) {
      sounds.pauseBgm();
    } else {
      sounds.resumeBgm();
    }
  }, [muted, volume]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      sounds.setMuted(next);
      return next;
    });
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    sounds.setBgmVolume(newVol);
    if (newVol > 0 && muted) {
      setMuted(false);
      sounds.setMuted(false);
    }
    if (newVol === 0 && !muted) {
      setMuted(true);
      sounds.setMuted(true);
    }
  };

  const handleSetMuted = (val) => {
    setMuted(val);
    sounds.setMuted(val);
    try {
      localStorage.setItem("fgt_muted", String(val));
    } catch {}
  };

  return {
    muted,
    volume,
    toggleMute,
    setVolume: handleVolumeChange,
    setMuted: handleSetMuted,
  };
}
