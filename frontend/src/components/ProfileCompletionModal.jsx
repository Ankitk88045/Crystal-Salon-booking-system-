import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { X } from "lucide-react";

/**
 * Shown once after a fresh OTP verify when the profile is missing name/email/gender.
 */
export default function ProfileCompletionModal() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("female");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const incomplete = !user.profile_completed && (!user.name || user.name === "Guest" || !user.email || !user.gender);
    if (incomplete) {
      setName(user.name && user.name !== "Guest" ? user.name : "");
      setEmail(user.email || "");
      setGender(user.gender || "female");
      setOpen(true);
    }
  }, [user]);

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      const r = await api.patch("/auth/profile", { name, email, gender, profile_completed: true });
      setUser(unwrap(r));
      toast.success("Profile saved!");
      setOpen(false);
    } catch {
      toast.error("Could not save profile");
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div data-testid="profile-completion" className="card-lux max-w-md w-full p-6 md:p-8 relative">
        <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        <div className="chip inline-flex">Welcome to Crystal</div>
        <h3 className="font-display text-2xl mt-3">Complete your profile</h3>
        <p className="text-white/60 text-sm mt-1">Just a few details so we can personalise your experience.</p>
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Full name</label>
            <input data-testid="pc-name" className="input-lux mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Email</label>
            <input data-testid="pc-email" className="input-lux mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Needed for invoices" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Gender</label>
            <div className="mt-2 flex gap-2">
              {["female", "male", "other"].map((g) => (
                <button
                  key={g}
                  data-testid={`pc-gender-${g}`}
                  onClick={() => setGender(g)}
                  className={`px-4 py-2 rounded-full border text-sm capitalize ${
                    gender === g ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Phone (verified)</label>
            <input className="input-lux mt-1" value={user?.phone || ""} disabled />
          </div>
        </div>
        <button data-testid="pc-save" disabled={busy} onClick={save} className="btn-primary rounded-full w-full py-3 mt-6">
          {busy ? "Saving…" : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
