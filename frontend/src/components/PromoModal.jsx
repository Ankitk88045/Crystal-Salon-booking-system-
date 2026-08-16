import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { api, unwrap } from "@/lib/api";

const SEEN_KEY = "cm_promo_seen_v1";

export default function PromoModal() {
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => {
      const s = unwrap(r);
      setSettings(s);
      if (s?.promo_enabled && !sessionStorage.getItem(SEEN_KEY)) {
        // small delay so page paints first
        setTimeout(() => setOpen(true), 1200);
      }
    });
  }, []);

  const close = () => {
    setOpen(false);
    sessionStorage.setItem(SEEN_KEY, "1");
  };

  if (!settings?.promo_enabled) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="promo-modal"
            className="relative card-lux overflow-hidden max-w-md w-full"
          >
            <button
              data-testid="promo-close"
              onClick={close}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            {settings.promo_image_url && (
              <div className="aspect-[4/3] overflow-hidden">
                <img src={settings.promo_image_url} alt={settings.promo_title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-6 md:p-7 text-center">
              <div className="inline-flex px-3 py-1 rounded-full text-[10px] tracking-widest uppercase bg-pink-brand/15 text-pink-brand border border-pink-brand/30">
                Special Offer
              </div>
              <h3 className="font-display text-2xl md:text-3xl mt-4">{settings.promo_title}</h3>
              <p className="text-white/70 text-sm mt-3">{settings.promo_subtitle}</p>
              {settings.promo_code && (
                <div className="mt-5 flex items-center justify-center gap-2">
                  <span className="text-xs text-white/50 uppercase tracking-widest">Code</span>
                  <span className="px-3 py-1 rounded-md border border-dashed border-pink-brand text-pink-brand font-mono font-bold tracking-widest">
                    {settings.promo_code}
                  </span>
                </div>
              )}
              <Link
                to={settings.promo_cta_url || "/services"}
                onClick={close}
                data-testid="promo-cta"
                className="btn-primary rounded-full inline-flex px-7 py-3 mt-6 font-medium"
              >
                {settings.promo_cta_label || "Book Now"}
              </Link>
              <button onClick={close} className="block mx-auto mt-3 text-xs text-white/50 hover:text-white">
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
