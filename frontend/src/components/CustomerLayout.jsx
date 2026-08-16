import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home as HomeIcon, Instagram, Facebook, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import LiquidBottomNav from "@/components/LiquidBottomNav";
import PromoModal from "@/components/PromoModal";
import ProfileCompletionModal from "@/components/ProfileCompletionModal";
import FloatingSupportButton from "@/components/FloatingSupportButton";

export default function CustomerLayout() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(unwrap(r))).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white overflow-x-hidden">
      {/* Fixed header */}
      <header className="glass-nav fixed top-0 inset-x-0 z-40">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-3 flex items-center justify-between">
          <Link to="/" data-testid="brand-link" className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Crystal Makeover" className="h-11 md:h-12 w-auto object-contain" />
            ) : (
              <div className="font-display text-lg text-pink-brand">Crystal Makeover</div>
            )}
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Home</NavLink>
            <NavLink to="/services" className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Services</NavLink>
            <NavLink to="/academy" className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Academy</NavLink>
            <NavLink to="/bookings" className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Bookings</NavLink>
            <NavLink to="/profile" className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Profile</NavLink>
          </nav>
          <button
            data-testid="header-cta-book"
            onClick={() => nav("/booking?mode=bridal")}
            className="btn-primary rounded-full px-4 md:px-5 py-2 text-sm font-medium"
          >
            Book Bridal
          </button>
        </div>
      </header>

      {/* header spacer */}
      <div aria-hidden className="h-[68px] md:h-[76px]" />

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="hidden md:block border-t border-white/5 mt-16 py-12 text-sm text-white/60">
        <div className="max-w-6xl mx-auto px-8 grid md:grid-cols-4 gap-8">
          <div>
            <div className="font-display text-2xl text-white mb-2">Crystal Makeover</div>
            <p className="max-w-xs">A premium salon & academy dedicated to bringing your best self forward.</p>
          </div>
          <div>
            <div className="text-white/80 uppercase text-xs tracking-widest mb-3">Explore</div>
            <ul className="space-y-2">
              <li><Link to="/services" className="hover:text-pink-brand">Services</Link></li>
              <li><Link to="/booking?mode=bridal" className="hover:text-pink-brand">Bridal Booking</Link></li>
              <li><Link to="/bookings" className="hover:text-pink-brand">My Bookings</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-white/80 uppercase text-xs tracking-widest mb-3">Visit</div>
            <a
              href={settings?.maps_url || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(settings?.address || "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 hover:text-pink-brand"
              data-testid="footer-address"
            >
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{settings?.address}</span>
            </a>
            <a href={`tel:${(settings?.phone || "").replace(/\s/g, "")}`} className="flex items-center gap-2 mt-2 hover:text-pink-brand">
              <Phone className="w-4 h-4" /> {settings?.phone}
            </a>
          </div>
          <div>
            <div className="text-white/80 uppercase text-xs tracking-widest mb-3">Follow</div>
            <div className="flex gap-3">
              <a href={settings?.social_instagram} className="hover:text-pink-brand"><Instagram className="w-5 h-5" /></a>
              <a href={settings?.social_facebook} className="hover:text-pink-brand"><Facebook className="w-5 h-5" /></a>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-8 mt-10 text-xs text-white/40">© {new Date().getFullYear()} Crystal Makeover Salon & Academy.</div>
      </footer>

      {/* Liquid mobile bottom nav */}
      <LiquidBottomNav />
      <PromoModal />
      <FloatingSupportButton />
      {user && <ProfileCompletionModal />}
    </div>
  );
}
