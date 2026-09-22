import { useEffect, useRef, useState } from "react";

export function useAudio() {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.2);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio("/audio/bgm.m4a");
    audio.loop = true;
    audio.volume = muted ? 0 : volume;
    audioRef.current = audio;

    const startAudio = () => {
      if (!muted && volume > 0 && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    window.addEventListener("click", startAudio, { once: true });
    window.addEventListener("keydown", startAudio, { once: true });

    if (!muted && volume > 0) {
      audio.play().catch(() => {});
    }

    return () => {
      window.removeEventListener("click", startAudio);
      window.removeEventListener("keydown", startAudio);
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
    if (muted || volume === 0) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }, [muted, volume]);

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    if (newVol > 0 && muted) setMuted(false);
    if (newVol === 0 && !muted) setMuted(true);
  };

  return {
    muted,
    volume,
    toggleMute,
    setVolume: handleVolumeChange,
  };
}
