import React, { useState, useEffect, useRef } from "react";
import { RefreshCw, Sparkles, CheckCircle, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";
import { toast } from "sonner";
import { postCasinoAction } from "../lib/api";

export function CaptchaMinigame({ syncBalance, currentBalance, onClose }) {
  const isBalanceLocked = typeof currentBalance === "number" && currentBalance >= 2000;
  const [captchaData, setCaptchaData] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successAnim, setSuccessAnim] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const inputRef = useRef(null);
  const currentObjectUrlRef = useRef(null);

  // Fetch server-generated pure binary PNG captcha image
  const fetchCaptcha = async (preserveError = false) => {
    if (isBalanceLocked) return;
    setLoading(true);
    if (!preserveError) {
      setErrorMsg("");
    }
    try {
      const res = await fetch("/api/casino/captcha", { cache: "no-store" });
      if (!res.ok) {
        let errText = "Nie udało się pobrać Captcha";
        try {
          const errData = await res.json();
          if (errData?.error) errText = errData.error;
        } catch (_) {}
        setErrorMsg(errText);
        return;
      }

      const id = res.headers.get("X-Captcha-ID");
      const signature = res.headers.get("X-Captcha-Signature");
      const issuedAt = res.headers.get("X-Captcha-Issued-At");
      const type = res.headers.get("X-Captcha-Type") || "text";

      const blob = await res.blob();
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
      const imageUrl = URL.createObjectURL(blob);
      currentObjectUrlRef.current = imageUrl;

      setCaptchaData({
        id,
        signature,
        issued_at: issuedAt ? parseInt(issuedAt, 10) : Math.floor(Date.now() / 1000),
        type,
        image: imageUrl,
      });
      setInputVal("");
    } catch (err) {
      setErrorMsg("Błąd połączenia z serwerem");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isBalanceLocked) {
      fetchCaptcha(false);
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isBalanceLocked]);

  useEffect(() => {
    return () => {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || loading || !captchaData || isBalanceLocked) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await postCasinoAction(
        {
          action: "solve_captcha",
          id: captchaData.id,
          answer: inputVal.trim(),
          signature: captchaData.signature,
          issued_at: captchaData.issued_at,
        },
        { silent: true }
      );

      if (res && res.ok) {
        sounds.playCoins();
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#fbbf24", "#10b981", "#38bdf8"],
        });

        if (typeof res.balance === "number" && syncBalance) {
          syncBalance(res.balance, res.xp, res.level);
        }

        setSessionCount((prev) => prev + 1);
        setSessionEarned((prev) => prev + (res.amount || 80));
        setSuccessAnim(true);
        toast.success(`+${res.amount || 80} ₽ za rozwiązanie Captcha!`);

        setTimeout(() => setSuccessAnim(false), 1200);
        await fetchCaptcha(false);
      } else {
        sounds.playLoss();
        const msg = res?.error || "Niepoprawny kod. Pobrano nowy obrazek.";
        setErrorMsg(msg);
        await fetchCaptcha(true);
      }
    } catch (err) {
      sounds.playLoss();
      let msg = err.message || "Błąd weryfikacji captcha";
      const lower = msg.toLowerCase();
      if (lower.includes("nieprawidłowy kod") || lower.includes("niepoprawn")) {
        msg = "Niepoprawny kod captcha. Pobrano nowy obrazek.";
      } else if (lower.includes("został już wykorzystany")) {
        msg = "Kod został już wykorzystany. Pobrano nowy obrazek.";
      } else if (lower.includes("wygasła") || lower.includes("wygasł")) {
        msg = "Kod wygasł. Pobrano nowy obrazek.";
      }
      setErrorMsg(msg);
      await fetchCaptcha(true);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  return (
    <div className="captcha-minigame-container">
      {/* Server-Side Rendered Distorted PNG Image or Balance Lock Info */}
      <div className="captcha-canvas-wrap">
        {isBalanceLocked ? (
          <div className="h-[75px] w-[280px] flex items-center justify-center text-center px-4 text-xs text-slate-300 font-medium leading-relaxed select-none">
            Captcha jest dostępna tylko, gdy Twoje saldo wynosi poniżej 2 000 ₽
          </div>
        ) : captchaData?.image ? (
          <img
            src={captchaData.image}
            alt="Captcha"
            className={`captcha-img ${successAnim ? "success-glow" : ""}`}
          />
        ) : (
          <div className="h-[75px] w-[280px] flex items-center justify-center text-slate-500 text-xs font-mono">
            {loading ? "Ładowanie..." : "Brak obrazu"}
          </div>
        )}

        {!isBalanceLocked && (
          <button
            type="button"
            onClick={() => fetchCaptcha(false)}
            disabled={loading}
            className="captcha-refresh-btn"
            title="Odśwież kod"
            aria-label="Odśwież kod"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-amber-400" : "text-slate-300"} />
          </button>
        )}
      </div>

      {/* Form & Input */}
      <form onSubmit={handleSubmit} className="captcha-form">
        <div className="captcha-input-wrap">
          <input
            ref={inputRef}
            type="text"
            maxLength={10}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder={captchaData?.type === "math" ? "Wynik działania" : "Wpisz kod"}
            value={inputVal}
            disabled={loading || isBalanceLocked}
            onChange={(e) => {
              setInputVal(e.target.value.toUpperCase());
              if (errorMsg) setErrorMsg("");
            }}
            className={`captcha-text-input ${errorMsg ? "input-error" : ""}`}
          />
        </div>

        {!isBalanceLocked && errorMsg && (
          <div className="captcha-status-msg error">
            <AlertCircle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successAnim && (
          <div className="captcha-status-msg success">
            <CheckCircle size={15} className="shrink-0" />
            <span>+80 ₽ dodano do salda</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || isBalanceLocked || !inputVal.trim()}
          className="captcha-submit-btn"
        >
          {loading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Weryfikacja...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Odbierz 80 ₽</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
