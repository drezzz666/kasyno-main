import React, { useState, useEffect, useRef } from "react";
import { ShieldCheck, RefreshCw, Sparkles, CheckCircle, AlertCircle, X, Coins, Lock } from "lucide-react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";
import { money, format } from "../lib/formatters";
import { toast } from "sonner";
import { postCasinoAction } from "../lib/api";

export function CaptchaModal({ isOpen, onClose, syncBalance, currentBalance }) {
  const [captchaData, setCaptchaData] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successAnim, setSuccessAnim] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const inputRef = useRef(null);
  const currentObjectUrlRef = useRef(null);

  // Fetch server-generated pure binary PNG captcha image (0% base64 payload overhead)
  const fetchCaptcha = async () => {
    setLoading(true);
    setErrorMsg("");
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
    if (isOpen) {
      fetchCaptcha();
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setSuccessAnim(false);
      setErrorMsg("");
    }
  }, [isOpen]);

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
    if (!inputVal.trim() || loading || !captchaData) return;

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
          syncBalance(res.balance);
        }

        setSessionCount((prev) => prev + 1);
        setSessionEarned((prev) => prev + (res.amount || 25));
        setSuccessAnim(true);
        toast.success(`+${res.amount || 25} $FGT za rozwiązanie Captcha!`);

        setTimeout(() => setSuccessAnim(false), 1200);
        fetchCaptcha();
      } else {
        sounds.playLoss();
        setErrorMsg(res?.error || "Niepoprawna odpowiedź. Spróbuj ponownie.");
        fetchCaptcha();
      }
    } catch (err) {
      setErrorMsg(err.message || "Błąd weryfikacji captcha");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop captcha-modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-dialog captcha-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="captcha-modal-header">
          <div className="captcha-header-title">
            <div className="captcha-icon-wrap">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Mini-gra: Rozwiąż Captcha</h2>
              <span className="text-xs text-slate-400 font-medium">
                Bezpieczna weryfikacja serwerowa • <b className="text-amber-400">+25 $FGT</b> za grę
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="captcha-close-btn" aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        {/* Reward Pill Banner */}
        <div className="captcha-reward-banner">
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-amber-400 animate-bounce" />
            <span className="text-xs font-bold text-amber-300">Nagroda za poprawne rozwiązanie:</span>
          </div>
          <span className="font-mono font-extrabold text-sm text-amber-400 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40">
            +25 $FGT
          </span>
        </div>

        {/* Server-Side Rendered Distorted PNG Image */}
        <div className="captcha-canvas-wrap">
          {captchaData?.image ? (
            <img
              src={captchaData.image}
              alt="Server Captcha Image"
              className={`captcha-img ${successAnim ? "success-glow" : ""}`}
            />
          ) : (
            <div className="h-[75px] w-[280px] flex items-center justify-center text-slate-500 text-xs font-mono">
              {loading ? "Generowanie bezpiecznego obrazu..." : "Brak obrazu"}
            </div>
          )}

          <button
            type="button"
            onClick={fetchCaptcha}
            disabled={loading}
            className="captcha-refresh-btn"
            title="Wylosuj nowy obraz captcha"
            aria-label="Odśwież kod captcha"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-amber-400" : "text-slate-300"} />
          </button>
        </div>

        {/* Prompt label */}
        <div className="text-center text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-1.5">
          <Lock size={12} className="text-emerald-400" />
          {captchaData?.type === "math" ? (
            <span>Oblicz i wpisz <b className="text-white font-bold">wynik działania</b> z obrazka:</span>
          ) : (
            <span>Przepisz <b className="text-white font-bold">znaki z obrazka</b> (nieczułe na wielkość):</span>
          )}
        </div>

        {/* Form & Input */}
        <form onSubmit={handleSubmit} className="captcha-form">
          <div className="captcha-input-group">
            <input
              ref={inputRef}
              type="text"
              maxLength={10}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder={captchaData?.type === "math" ? "Wpisz wynik" : "Wpisz kod"}
              value={inputVal}
              disabled={loading}
              onChange={(e) => setInputVal(e.target.value.toUpperCase())}
              className={`captcha-text-input ${errorMsg ? "input-error" : ""}`}
            />
            <button
              type="submit"
              disabled={loading || !inputVal.trim()}
              className="captcha-submit-btn"
            >
              {loading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Odbierz 25 $FGT</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="captcha-status-msg error">
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successAnim && (
            <div className="captcha-status-msg success">
              <CheckCircle size={14} className="shrink-0" />
              <span>Poprawnie! Przyznano +25 $FGT do salda.</span>
            </div>
          )}
        </form>

        {/* Session Stats */}
        <div className="captcha-stats-row">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Rozwiązano w tej sesji:</span>
            <b className="text-white font-mono">{sessionCount}</b>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Zdobyto:</span>
            <b className="text-emerald-400 font-mono">+{format(sessionEarned)} $FGT</b>
          </div>
        </div>
      </div>
    </div>
  );
}
