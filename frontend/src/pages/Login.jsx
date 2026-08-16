import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { login } = useAuth();
  const [params] = useSearchParams();

  const sendOtp = async () => {
    if (phone.trim().length < 8) return toast.error("Enter a valid phone");
    setBusy(true);
    try {
      const r = await api.post("/auth/request-otp", { phone });
      const d = unwrap(r);
      setDevOtp(d.dev_otp);
      setStep(2);
      toast.success(`OTP sent (dev): ${d.dev_otp}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not send OTP");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const r = await api.post("/auth/verify-otp", { phone, code, name: name || undefined });
      const d = unwrap(r);
      login(d.token, d.user);
      toast.success("Welcome!");
      nav(params.get("next") || "/");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not verify");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-14">
      <div className="card-lux p-6">
        <h1 className="font-display text-3xl">Welcome</h1>
        <p className="text-white/60 mt-1 text-sm">Sign in to book, track & review your appointments.</p>

        {step === 1 ? (
          <div className="mt-6 space-y-3">
            <label className="text-xs uppercase tracking-widest text-white/50">Mobile Number</label>
            <input
              data-testid="login-phone"
              className="input-lux"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="text-xs uppercase tracking-widest text-white/50">Name (optional)</label>
            <input
              data-testid="login-name"
              className="input-lux"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              data-testid="send-otp-btn"
              disabled={busy}
              onClick={sendOtp}
              className="btn-primary rounded-full w-full py-3 mt-2 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send OTP
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <label className="text-xs uppercase tracking-widest text-white/50">Enter OTP</label>
            <input
              data-testid="login-otp"
              className="input-lux tracking-[0.4em] text-center text-lg"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {devOtp && (
              <div className="text-xs text-white/50">Dev OTP: <span className="text-pink-brand">{devOtp}</span></div>
            )}
            <button
              data-testid="verify-otp-btn"
              disabled={busy}
              onClick={verify}
              className="btn-primary rounded-full w-full py-3 mt-2 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify & Continue
            </button>
            <button className="text-xs text-white/60 mx-auto block mt-2" onClick={() => setStep(1)}>Change number</button>
          </div>
        )}
      </div>
    </div>
  );
}
