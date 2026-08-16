import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Sparkles, Users, Star, Settings, LogOut, MessageSquare, LifeBuoy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

const items = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Dashboard", testId: "admin-nav-dashboard" },
  { to: "/admin/bookings", icon: CalendarDays, label: "Bookings", testId: "admin-nav-bookings" },
  { to: "/admin/services", icon: Sparkles, label: "Services", testId: "admin-nav-services" },
  { to: "/admin/customers", icon: Users, label: "Customers", testId: "admin-nav-customers" },
  { to: "/admin/reviews", icon: Star, label: "Reviews", testId: "admin-nav-reviews" },
  { to: "/admin/support", icon: LifeBuoy, label: "Support", testId: "admin-nav-support" },
  { to: "/admin/sms", icon: MessageSquare, label: "SMS Logs", testId: "admin-nav-sms" },
  { to: "/admin/settings", icon: Settings, label: "Settings", testId: "admin-nav-settings" },
];

export default function AdminLayout() {
  const { user, logout, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN"))) {
      nav("/admin/login");
    }
  }, [user, loading, nav]);

  if (loading || !user) return <div className="p-10 text-white/60">Loading…</div>;

  return (
    <div className="min-h-screen bg-black text-white flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-white/5 p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-10">
          <img src="https://i.ibb.co/TMZk10py/IMG-20260721-171158.png" alt="Crystal" className="h-11 w-auto object-contain" />
          <div className="text-[10px] tracking-widest uppercase text-white/50">Admin Console</div>
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  isActive ? "bg-pink-brand/10 text-pink-brand" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          data-testid="admin-logout-btn"
          onClick={() => { logout(); nav("/admin/login"); }}
          className="mt-6 flex items-center gap-2 text-sm text-white/60 hover:text-pink-brand"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 glass-nav z-40 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="https://i.ibb.co/TMZk10py/IMG-20260721-171158.png" alt="Crystal" className="h-8 w-auto object-contain" />
        </div>
        <button onClick={() => { logout(); nav("/admin/login"); }} className="text-xs text-white/60">Logout</button>
      </div>

      <main className="flex-1 md:p-8 pt-20 md:pt-8 px-4 pb-24 md:pb-8 overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="glass-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40">
        <ul className="grid grid-cols-5 text-[10px]">
          {items.slice(0, 5).map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 ${isActive ? "text-pink-brand" : "text-white/60"}`}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
