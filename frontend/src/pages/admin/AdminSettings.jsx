import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(unwrap(r))); }, []);
  if (!s) return <div className="text-white/60">Loading…</div>;

  const set = (k, v) => setS({ ...s, [k]: v });
  const toggleDay = (i) => {
    const wd = new Set(s.working_days || []);
    if (wd.has(i)) wd.delete(i); else wd.add(i);
    set("working_days", Array.from(wd).sort());
  };

  const save = async () => {
    try {
      await api.patch("/admin/settings", s);
      toast.success("Settings saved");
    } catch { toast.error("Failed to save"); }
  };

  return (
    <div>
      <h1 className="font-display text-3xl">Settings</h1>
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <Section title="Salon Info">
          <F label="Salon name"><input className="input-lux" value={s.salon_name || ""} onChange={(e) => set("salon_name", e.target.value)} /></F>
          <F label="Phone"><input className="input-lux" value={s.phone || ""} onChange={(e) => set("phone", e.target.value)} /></F>
          <F label="WhatsApp"><input className="input-lux" value={s.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></F>
          <F label="Address"><input className="input-lux" value={s.address || ""} onChange={(e) => set("address", e.target.value)} /></F>
          <F label="Maps URL"><input className="input-lux" value={s.maps_url || ""} onChange={(e) => set("maps_url", e.target.value)} /></F>
        </Section>
        <Section title="Business Hours">
          <F label="Opening time"><input className="input-lux" value={s.opening_time || ""} onChange={(e) => set("opening_time", e.target.value)} /></F>
          <F label="Closing time"><input className="input-lux" value={s.closing_time || ""} onChange={(e) => set("closing_time", e.target.value)} /></F>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Working days</label>
            <div className="mt-2 flex gap-2 flex-wrap">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => toggleDay(i)} className={`px-3 py-1.5 rounded-full text-xs border ${s.working_days?.includes(i) ? "bg-pink-brand text-[#050505] border-pink-brand" : "border-white/15 text-white/70"}`}>{d}</button>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Booking Policy">
          <F label="Advance percentage"><input type="number" className="input-lux" value={s.advance_percentage || 10} onChange={(e) => set("advance_percentage", Number(e.target.value))} /></F>
          <F label="Reminder minutes before"><input type="number" className="input-lux" value={s.reminder_minutes_before || 60} onChange={(e) => set("reminder_minutes_before", Number(e.target.value))} /></F>
          <F label="Cancellation window (hours)"><input type="number" className="input-lux" value={s.cancellation_hours || 4} onChange={(e) => set("cancellation_hours", Number(e.target.value))} /></F>
          <F label="Review link"><input className="input-lux" value={s.review_url || ""} onChange={(e) => set("review_url", e.target.value)} /></F>
        </Section>
        <Section title="Social">
          <F label="Instagram"><input className="input-lux" value={s.social_instagram || ""} onChange={(e) => set("social_instagram", e.target.value)} /></F>
          <F label="Facebook"><input className="input-lux" value={s.social_facebook || ""} onChange={(e) => set("social_facebook", e.target.value)} /></F>
        </Section>
      </div>
      <button data-testid="save-settings" onClick={save} className="btn-primary rounded-full px-6 py-3 mt-6">Save Settings</button>
    </div>
  );
}

function Section({ title, children }) {
  return <div className="card-lux p-5 space-y-3"><div className="uppercase text-xs tracking-widest text-white/60">{title}</div>{children}</div>;
}
function F({ label, children }) {
  return <div><label className="text-xs uppercase tracking-widest text-white/50">{label}</label><div className="mt-1">{children}</div></div>;
}
