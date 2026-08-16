import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("crystalmakeoversalon@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/auth/admin-login", { email, password });
      const d = unwrap(r);
      login(d.token, d.user);
      toast.success("Welcome, admin");
      nav("/admin");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-5">
      <div className="card-lux p-8 max-w-md w-full">
        <div className="h-10 w-10 rounded-full bg-pink-brand flex items-center justify-center text-white font-bold font-display">C</div>
        <h1 className="font-display text-3xl mt-4">Admin Console</h1>
        <p className="text-white/60 text-sm">Sign in to manage the salon.</p>
        <div className="space-y-3 mt-6">
          <input data-testid="admin-email" className="input-lux" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input data-testid="admin-password" type="password" className="input-lux" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <button data-testid="admin-login-btn" onClick={submit} disabled={busy} className="btn-primary rounded-lg w-full py-3 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Login
          </button>
        </div>
      </div>
    </div>
  );
}
