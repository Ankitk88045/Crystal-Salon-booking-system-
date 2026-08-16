import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home as HomeIcon, Sparkles, CalendarCheck, User, Instagram, Facebook, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";

const navItems = [
  { to: "/", label: "Home", icon: HomeIcon, testId: "nav-home" },
  { to: "/services", label: "Services", icon: Sparkles, testId: "nav-services" },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck, testId: "nav-bookings" },
  { to: "/profile", label: "Profile", icon: User, testId: "nav-profile" },
];

export default function CustomerLayout() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(unwrap(r))).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white overflow-x-hidden">
      {/* Top header */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <Link to="/" data-testid="brand-link" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-pink-brand flex items-center justify-center text-[#050505] font-bold font-display">
              C
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg md:text-xl">Crystal</div>
              <div className="text-[10px] tracking-[0.25em] text-white/60 uppercase">
                Makeover & Academy
              </div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Home</NavLink>
            <NavLink to="/services" className={({ isActive }) => isActive ? "text-pink-brand" : "text-white/70 hover:text-white"}>Services</NavLink>
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

      <main className="flex-1 pb-24 md:pb-0">
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
            <p className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5" /> {settings?.address}</p>
            <p className="flex items-center gap-2 mt-2"><Phone className="w-4 h-4" /> {settings?.phone}</p>
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

      {/* Mobile bottom nav */}
      <nav data-testid="mobile-bottom-nav" className="glass-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-50">
        <ul className="grid grid-cols-4">
          {navItems.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testId}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? "text-pink-brand" : "text-white/60"}`
                }
              >
                <n.icon className="w-5 h-5" />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
