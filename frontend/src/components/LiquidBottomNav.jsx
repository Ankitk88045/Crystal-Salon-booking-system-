import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Home, Scissors, Calendar, User, CalendarCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const ACCENT = "#BF7AAB";

export default function LiquidBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 375
  );

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const tabs = [
    { id: "home", label: "Home", icon: Home, path: "/", testId: "nav-home" },
    { id: "services", label: "Services", icon: Scissors, path: "/services", testId: "nav-services" },
    { id: "book", label: "Book", icon: Calendar, path: "/booking?mode=bridal", testId: "nav-book" },
    { id: "bookings", label: "Bookings", icon: CalendarCheck, path: "/bookings", testId: "nav-bookings" },
    {
      id: "profile",
      label: user ? "Profile" : "Login",
      icon: User,
      path: user ? "/profile" : "/login",
      testId: "nav-profile",
    },
  ];

  useEffect(() => {
    const p = location.pathname;
    const s = location.search;
    if (p === "/") setActiveIndex(0);
    else if (p.startsWith("/services")) setActiveIndex(1);
    else if (p.startsWith("/booking") && !p.startsWith("/bookings")) setActiveIndex(2);
    else if (p.startsWith("/bookings")) setActiveIndex(3);
    else if (p.startsWith("/profile") || p.startsWith("/login")) setActiveIndex(4);
  }, [location.pathname, location.search]);

  const handleTabClick = (index, path) => {
    setActiveIndex(index);
    navigate(path);
  };

  const tabWidth = windowWidth / tabs.length;
  const activeX = activeIndex * tabWidth + tabWidth / 2;
  const svgOffset = activeX - 1500;

  return (
    <>
      <div className="md:hidden h-[90px]" />

      <div className="md:hidden fixed bottom-0 left-0 w-full h-[70px] z-50 pointer-events-none pb-[calc(env(safe-area-inset-bottom,0px))]">
        {/* Liquid Background SVG */}
        <motion.div
          className="absolute top-0 left-0 w-[3000px] h-[70px] pointer-events-auto"
          initial={{ x: svgOffset }}
          animate={{ x: svgOffset }}
          transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
        >
          <svg
            width="3000"
            height="150"
            viewBox="0 0 3000 150"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M 0 0 L 1460 0 C 1475 0, 1475 35, 1500 35 C 1525 35, 1525 0, 1540 0 L 3000 0 L 3000 150 L 0 150 Z"
              fill={ACCENT}
            />
          </svg>
        </motion.div>

        {/* Safe area fill */}
        <div
          className="absolute top-[70px] left-0 w-full h-[env(safe-area-inset-bottom,0px)] pointer-events-auto"
          style={{ backgroundColor: ACCENT }}
        />

        {/* Buttons */}
        <div className="absolute top-0 left-0 w-full h-[70px] flex items-center justify-between pointer-events-auto px-0">
          {tabs.map((tab, index) => {
            const isActive = activeIndex === index;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                data-testid={tab.testId}
                onClick={() => handleTabClick(index, tab.path)}
                className="relative w-full h-full flex flex-col items-center justify-center outline-none border-none bg-transparent group cursor-pointer"
              >
                {/* Floating active bead */}
                <motion.div
                  initial={false}
                  animate={{
                    y: isActive ? -28 : 0,
                    scale: isActive ? 1.15 : 1,
                    opacity: isActive ? 1 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="absolute flex flex-col items-center justify-center w-14 h-14 rounded-full shadow-xl"
                  style={{
                    backgroundColor: "#000000",
                    border: `4px solid ${ACCENT}`,
                    pointerEvents: isActive ? "auto" : "none",
                    zIndex: 10,
                  }}
                >
                  <Icon className="w-5 h-5 text-white" />
                  <span className="text-[8px] font-bold text-white tracking-wide mt-0.5">
                    {tab.label}
                  </span>
                </motion.div>

                {/* Inactive icon + label */}
                <motion.div
                  initial={false}
                  animate={{
                    y: isActive ? 40 : 2,
                    opacity: isActive ? 0 : 1,
                  }}
                  className="flex flex-col items-center gap-1 text-white/95"
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-[10px] font-bold tracking-wide">{tab.label}</span>
                </motion.div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
