import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");

  const save = async () => {
    try {
      const r = await api.patch("/auth/profile", { name, email });
      setUser(unwrap(r));
      toast.success("Profile updated");
    } catch { toast.error("Update failed"); }
  };

  return (
    <div className="max-w-md mx-auto px-5 md:px-8 py-8 md:py-12">
      <h1 className="font-display text-3xl md:text-4xl">Profile</h1>
      <div className="card-lux p-6 mt-6 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50">Mobile</label>
          <input className="input-lux mt-1" value={user?.phone || ""} disabled />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50">Name</label>
          <input data-testid="profile-name" className="input-lux mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50">Email</label>
          <input data-testid="profile-email" className="input-lux mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button data-testid="profile-save" onClick={save} className="btn-primary rounded-full w-full py-3 mt-3">Save changes</button>
        <button data-testid="profile-logout" onClick={logout} className="btn-ghost-brand rounded-full w-full py-3">Log out</button>
      </div>
    </div>
  );
}
