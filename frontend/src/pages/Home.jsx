import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Heart,
  Star,
  ShieldCheck,
  PackageCheck,
  Home as HomeIcon,
  MapPin,
  Phone,
  Sparkles,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { api, unwrap } from "@/lib/api";

const HERO_IMG =
  "https://i.ibb.co/LdhcMS0k/gurpreet-singh-Po-ngg-Qqpl-E-unsplash.jpg";
const PRODUCT_IMG =
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1400&q=80";
const ACADEMY_IMG =
  "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1400&q=80";

const WHY_CARDS = [
  {
    icon: ShieldCheck,
    badge: "Verified & Safe",
    title: "Expert Verified Stylists",
    text:
      "Background checked, police verified & rigorously trained beauty artists equipped with complete hygiene protocol gear.",
    features: ["100% Police Verified", "Temperature Checks", "Masks & Gloves Kit"],
  },
  {
    icon: PackageCheck,
    badge: "100% Original",
    title: "Single-Use Sealed Kits",
    text:
      "100% genuine branded cosmetics opened directly in front of you. Zero re-used or diluted salon products guaranteed.",
    features: ["Mono-Dose Sachet Kits", "Sealed Cosmetic Packs", "Top Global Brands"],
  },
  {
    icon: HomeIcon,
    badge: "Maximum Luxury",
    title: "Salon Comfort At Home",
    text:
      "Enjoy complete head-to-toe salon makeover treatments in the sanctuary, privacy, and cozy comfort of your own home.",
    features: ["No Waiting / Traffic", "Mess-Free Cleanup", "Doorstep Convenience"],
  },
];

const STATS = [
  { value: "15,000+", label: "Happy Clients" },
  { value: "4.9", label: "Average Rating", star: true },
  { value: "100%", label: "Sealed Cosmetics" },
  { value: "50+", label: "Certified Stylists" },
];

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/services", { params: { featured: true } }).then((r) => setFeatured(unwrap(r) || []));
    api.get("/categories").then((r) => setCategories(unwrap(r) || []));
    api.get("/google-reviews").then((r) => {
      const d = unwrap(r);
      setReviews(d?.reviews || []);
    }).catch(() => setReviews([]));
    api.get("/settings").then((r) => setSettings(unwrap(r)));
  }, []);

  const heroTitle = settings?.home_hero_title || "Premium Beauty At Your Doorstep.";
  const heroSubtitle = settings?.home_hero_subtitle ||
    "Your ultimate A–Z beauty parlour experience at home. From everyday grooming to premium Bridal Makeup, Hair Care, and advanced Korean Skincare treatments. Safe, hygienic and affordable.";
  const heroChip = settings?.home_hero_chip || "#1 Beauty & Academy Services";
  const whyTitle = settings?.home_why_title || "Why Choose Crystal Makeover?";
  const whySubtitle = settings?.home_why_subtitle || "Redefining home salon services with uncompromising hygiene standards, certified beauticians and guaranteed 100% genuine sealed single-use product kits.";
  const stats = (settings?.home_stats && settings.home_stats.length ? settings.home_stats : STATS);

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[85vh] flex items-end">
        <img src={HERO_IMG} alt="Crystal Makeover" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-vignette" />
        <div className="relative z-10 max-w-6xl mx-auto w-full px-5 md:px-8 pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="chip">{heroChip}</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl mt-5 max-w-3xl leading-[1.05]">
              {heroTitle.split(" ").length > 2
                ? (<>{heroTitle.split(" ").slice(0, -2).join(" ")} <br className="hidden sm:block" /><span className="text-pink-brand">{heroTitle.split(" ").slice(-2).join(" ")}</span></>)
                : heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-white/75 text-base md:text-lg leading-relaxed">
              {heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                data-testid="hero-book-bridal"
                onClick={() => nav("/booking?mode=bridal")}
                className="btn-primary rounded-full px-7 py-3.5 font-medium inline-flex items-center gap-2"
              >
                <Heart className="w-4 h-4" /> Book Bridal Appointment
              </button>
              <Link
                to="/services"
                data-testid="hero-explore-services"
                className="btn-ghost-brand rounded-full px-7 py-3.5 inline-flex items-center gap-2"
              >
                Explore Services <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-white/80">
              <Star className="w-5 h-5 text-pink-brand fill-current" />
              <div>
                <span className="font-semibold">4.9/5</span>
                <span className="text-white/50 ml-2 text-xs">10k+ Reviews</span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-white/20 mx-2" />
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-4 h-4 text-pink-brand" /> 100% Genuine Products
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="chip">Explore Premium Categories</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">Choose your indulgence</h2>
            <p className="text-white/50 text-sm mt-2">A wide range of at-home beauty treatments.</p>
          </div>
          <Link to="/services" className="hidden md:inline text-sm text-pink-brand">All services →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/services?category=${c.id}`}
              data-testid={`category-${c.slug}`}
              className="group relative overflow-hidden rounded-2xl border border-white/5"
            >
              <img src={c.image_url} alt={c.name} className="h-40 md:h-52 w-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute bottom-4 left-4">
                <div className="font-display text-xl md:text-2xl">{c.name}</div>
                <div className="text-xs text-white/60 flex items-center gap-1 mt-1">Explore <ArrowRight className="w-3 h-3" /></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured services */}
      <section className="bg-[#0d0d0d] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
          <span className="chip">Our Premium Services</span>
          <h2 className="font-display text-3xl md:text-5xl mt-3 mb-8">Featured picks</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {featured.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="card-lux overflow-hidden group"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={s.image_url} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5">
                  <div className="text-[11px] uppercase tracking-widest text-white/50">{s.category_name}</div>
                  <div className="font-display text-xl mt-1">{s.name}</div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-pink-brand text-lg">₹{Math.round(s.offer_price || s.price)}</div>
                    <Link
                      to={`/services/${s.slug}`}
                      data-testid={`featured-view-${s.slug}`}
                      className="text-sm text-white/70 hover:text-pink-brand inline-flex items-center gap-1"
                    >
                      View <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-pink-brand/10 rounded-full blur-[120px] pointer-events-none opacity-70" />
        <div className="max-w-6xl mx-auto px-5 md:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="chip inline-flex"><Sparkles className="w-3.5 h-3.5" /> About Crystal Makeover</span>
            <h2 className="font-display text-3xl md:text-5xl mt-4">
              {whyTitle}
            </h2>
            <p className="text-white/60 mt-4 text-sm md:text-base leading-relaxed">
              {whySubtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {WHY_CARDS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="card-lux p-7 md:p-8 relative overflow-hidden flex flex-col group"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <c.icon className="w-7 h-7 text-pink-brand" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/[0.04] text-white/60 border border-white/10">
                    {c.badge}
                  </span>
                </div>
                <h3 className="font-display text-xl">{c.title}</h3>
                <p className="text-white/60 text-sm mt-3 leading-relaxed flex-1">{c.text}</p>
                <div className="mt-5 pt-4 border-t border-white/5 space-y-2">
                  {c.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-white/70">
                      <CheckCircle2 className="w-3.5 h-3.5 text-pink-brand shrink-0" /> {f}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-14 card-lux p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-y md:divide-y-0 md:divide-x divide-white/5">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center justify-center p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-3xl md:text-4xl text-pink-brand">{s.value}</span>
                  {s.star && <Star className="w-5 h-5 text-pink-brand fill-current" />}
                </div>
                <span className="text-[10px] font-bold text-white/60 mt-1 uppercase tracking-widest">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Academy */}
      <section className="relative overflow-hidden border-y border-white/5 bg-[#0d0d0d]">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="relative rounded-3xl overflow-hidden border border-white/5 order-2 md:order-1">
            <img src={ACADEMY_IMG} alt="Crystal Academy" className="w-full h-[420px] object-cover" />
          </div>
          <div className="order-1 md:order-2">
            <span className="chip">Crystal Academy</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">
              Learn the craft from <span className="text-pink-brand">working masters.</span>
            </h2>
            <p className="mt-4 text-white/70">
              Certified bridal makeup, hair styling and Korean skincare courses. Hands-on studio time, portfolio-ready projects and placement assistance.
            </p>
            <div className="flex gap-3 mt-6">
              <Link
                to="/academy"
                data-testid="academy-explore"
                className="btn-primary rounded-full inline-flex items-center gap-2 px-6 py-3"
              >
                Explore Courses <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : "#"}
                data-testid="academy-whatsapp"
                className="btn-ghost-brand rounded-full inline-flex items-center gap-2 px-6 py-3"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews */}
      {reviews.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
          <span className="chip">Google & Client Reviews</span>
          <h2 className="font-display text-3xl md:text-5xl mt-3 mb-8">Guests love us.</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {reviews.slice(0, 3).map((r) => (
              <div key={r.id} className="card-lux p-6">
                <div className="flex gap-1 text-pink-brand mb-3">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-white/80 text-sm">&ldquo;{r.review_text || "Loved the experience!"}&rdquo;</p>
                <div className="mt-4 text-xs text-white/50">— {r.customer_name} · {r.service_name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contact */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20 grid md:grid-cols-2 gap-10">
          <div>
            <span className="chip">Say Hello</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">We come to you.</h2>
            <div className="mt-6 space-y-3 text-white/75">
              <a
                href={settings?.maps_url || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(settings?.address || "")}`}
                target="_blank"
                rel="noreferrer"
                data-testid="tap-address"
                className="flex items-start gap-3 hover:text-pink-brand"
              >
                <MapPin className="w-4 h-4 text-pink-brand shrink-0 mt-0.5" />
                <span className="underline-offset-4 hover:underline">{settings?.address}</span>
              </a>
              <a href={`tel:${(settings?.phone || "").replace(/\s/g, "")}`} className="flex items-center gap-3 hover:text-pink-brand">
                <Phone className="w-4 h-4 text-pink-brand" />{settings?.phone}
              </a>
            </div>
            <div className="flex gap-3 mt-6">
              <a
                href={`tel:${settings?.phone?.replace(/\s/g, "") || ""}`}
                className="btn-primary rounded-full inline-flex px-6 py-3"
                data-testid="cta-call"
              >
                Call Now
              </a>
              <a
                href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : "#"}
                className="btn-ghost-brand rounded-full inline-flex px-6 py-3 items-center gap-2"
                data-testid="cta-whatsapp"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
          <div className="card-lux p-6">
            <div className="font-display text-2xl mb-3">Service Hours</div>
            <div className="text-white/70 text-sm">Available daily · {settings?.opening_time} – {settings?.closing_time}</div>
            <div className="divider-hairline my-5" />
            <div className="text-white/60 text-sm">Same-day bookings possible. Bridal & academy consultations by prior appointment.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
