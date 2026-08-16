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
          <F label="Logo image URL"><input className="input-lux" value={s.logo_url || ""} onChange={(e) => set("logo_url", e.target.value)} /></F>
          <F label="Tagline"><input className="input-lux" value={s.tagline || ""} onChange={(e) => set("tagline", e.target.value)} /></F>
          <F label="Phone"><input className="input-lux" value={s.phone || ""} onChange={(e) => set("phone", e.target.value)} /></F>
          <F label="WhatsApp"><input className="input-lux" value={s.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></F>
          <F label="Contact email (admin gets booking emails here)"><input className="input-lux" value={s.email || ""} onChange={(e) => set("email", e.target.value)} /></F>
          <F label="Salon address (centre)"><textarea className="input-lux min-h-[70px]" value={s.address || ""} onChange={(e) => set("address", e.target.value)} /></F>
          <F label="Home service area (visible on booking)"><input className="input-lux" value={s.home_service_area || ""} onChange={(e) => set("home_service_area", e.target.value)} /></F>
          <F label="Google Maps URL"><input className="input-lux" value={s.maps_url || ""} onChange={(e) => set("maps_url", e.target.value)} /></F>
          <F label="Google Review URL (sent after service)"><input data-testid="google-review-url" className="input-lux" value={s.google_review_url || ""} onChange={(e) => set("google_review_url", e.target.value)} /></F>
        </Section>
        <Section title="Business Hours">
          <F label="Opening time"><input className="input-lux" value={s.opening_time || ""} onChange={(e) => set("opening_time", e.target.value)} /></F>
          <F label="Closing time"><input className="input-lux" value={s.closing_time || ""} onChange={(e) => set("closing_time", e.target.value)} /></F>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50">Working days</label>
            <div className="mt-2 flex gap-2 flex-wrap">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => toggleDay(i)} className={`px-3 py-1.5 rounded-full text-xs border ${s.working_days?.includes(i) ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}>{d}</button>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Booking Policy">
          <F label="Advance percentage"><input type="number" className="input-lux" value={s.advance_percentage || 10} onChange={(e) => set("advance_percentage", Number(e.target.value))} /></F>
          <F label="Reminder minutes before"><input type="number" className="input-lux" value={s.reminder_minutes_before || 60} onChange={(e) => set("reminder_minutes_before", Number(e.target.value))} /></F>
          <F label="Cancellation window (hours)"><input type="number" className="input-lux" value={s.cancellation_hours || 4} onChange={(e) => set("cancellation_hours", Number(e.target.value))} /></F>
        </Section>
        <Section title="Promo Popup (Homepage)">
          <div className="flex items-center gap-2">
            <input id="promo_on" type="checkbox" checked={!!s.promo_enabled} onChange={(e) => set("promo_enabled", e.target.checked)} />
            <label htmlFor="promo_on" className="text-sm text-white/80">Show promo popup on homepage</label>
          </div>
          <F label="Popup image URL"><input className="input-lux" value={s.promo_image_url || ""} onChange={(e) => set("promo_image_url", e.target.value)} /></F>
          <F label="Title"><input className="input-lux" value={s.promo_title || ""} onChange={(e) => set("promo_title", e.target.value)} /></F>
          <F label="Subtitle"><textarea className="input-lux min-h-[60px]" value={s.promo_subtitle || ""} onChange={(e) => set("promo_subtitle", e.target.value)} /></F>
          <F label="Promo code"><input className="input-lux" value={s.promo_code || ""} onChange={(e) => set("promo_code", e.target.value)} /></F>
          <F label="CTA button label"><input className="input-lux" value={s.promo_cta_label || ""} onChange={(e) => set("promo_cta_label", e.target.value)} /></F>
          <F label="CTA link"><input className="input-lux" value={s.promo_cta_url || ""} onChange={(e) => set("promo_cta_url", e.target.value)} /></F>
        </Section>
        <Section title="Home Page Content">
          <F label="Hero chip (small tagline above heading)"><input className="input-lux" value={s.home_hero_chip || ""} onChange={(e) => set("home_hero_chip", e.target.value)} /></F>
          <F label="Hero title"><input className="input-lux" value={s.home_hero_title || ""} onChange={(e) => set("home_hero_title", e.target.value)} /></F>
          <F label="Hero subtitle"><textarea className="input-lux min-h-[100px]" value={s.home_hero_subtitle || ""} onChange={(e) => set("home_hero_subtitle", e.target.value)} /></F>
          <F label="Why-Us title"><input className="input-lux" value={s.home_why_title || ""} onChange={(e) => set("home_why_title", e.target.value)} /></F>
          <F label="Why-Us subtitle"><textarea className="input-lux min-h-[80px]" value={s.home_why_subtitle || ""} onChange={(e) => set("home_why_subtitle", e.target.value)} /></F>
        </Section>
        <Section title="Google Reviews Integration">
          <F label="Google Place ID"><input data-testid="google-place-id" className="input-lux" value={s.google_place_id || ""} onChange={(e) => set("google_place_id", e.target.value)} placeholder="ChIJ..." /></F>
          <F label="Google Places API Key"><input data-testid="google-api-key" type="password" className="input-lux" value={s.google_places_api_key || ""} onChange={(e) => set("google_places_api_key", e.target.value)} placeholder="AIza..." /></F>
          <p className="text-white/50 text-xs">Get these from Google Cloud Console → APIs & Services → Places API. Reviews are cached 12h.</p>
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
