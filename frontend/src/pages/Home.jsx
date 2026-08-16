import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Scissors, Palette, Heart, Star, ArrowRight, MapPin, Phone } from "lucide-react";
import { api, unwrap } from "@/lib/api";

const HERO_IMG = "https://images.unsplash.com/photo-1684868265714-fd2300637c23?w=1600&q=80";
const SALON_IMG = "https://images.unsplash.com/photo-1626383137804-ff908d2753a2?w=1400&q=80";
const ACADEMY_IMG = "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1200&q=80";

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/services", { params: { featured: true } }).then((r) => setFeatured(unwrap(r) || []));
    api.get("/categories").then((r) => setCategories(unwrap(r) || []));
    api.get("/reviews").then((r) => setReviews(unwrap(r) || []));
    api.get("/settings").then((r) => setSettings(unwrap(r)));
  }, []);

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-end">
        <img src={HERO_IMG} alt="Bridal" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-vignette" />
        <div className="relative z-10 max-w-6xl mx-auto w-full px-5 md:px-8 pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="chip">Salon · Bridal · Academy</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl mt-5 max-w-3xl leading-[1.05]">
              Where every look feels <span className="text-pink-brand">crystal</span> crafted.
            </h1>
            <p className="mt-6 max-w-xl text-white/70 text-base md:text-lg">
              A premium salon & academy specialising in bridal artistry, luxe hair, skin and nails.
              Book your appointment in seconds — pay just 10% online, the rest at the salon.
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
            <div className="mt-8 text-xs text-white/50 tracking-widest uppercase">
              Bridal bookings open to everyone · Salon services for women
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="chip">The Menu</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">Categories crafted with care</h2>
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
      <section className="bg-[#0a0a0a] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
          <span className="chip">Loved by our guests</span>
          <h2 className="font-display text-3xl md:text-5xl mt-3 mb-8">Featured services</h2>
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

      {/* Why choose us */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <span className="chip">Why Crystal</span>
          <h2 className="font-display text-3xl md:text-5xl mt-3">Details that make a difference</h2>
          <ul className="mt-6 space-y-4 text-white/75">
            {[
              { icon: Sparkles, t: "Premium products & tools", d: "Salon-grade brands from around the world." },
              { icon: Scissors, t: "Master artists", d: "Certified professionals with years of experience." },
              { icon: Palette, t: "Bridal expertise", d: "Custom looks designed around your story." },
            ].map((f, i) => (
              <li key={i} className="flex gap-4">
                <div className="h-10 w-10 rounded-full bg-pink-brand/15 flex items-center justify-center shrink-0"><f.icon className="w-5 h-5 text-pink-brand" /></div>
                <div>
                  <div className="font-medium">{f.t}</div>
                  <div className="text-sm text-white/60">{f.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-3xl overflow-hidden border border-white/5">
          <img src={SALON_IMG} alt="Salon" className="w-full h-[420px] object-cover" />
        </div>
      </section>

      {/* Academy */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="relative rounded-3xl overflow-hidden border border-white/5 order-2 md:order-1">
            <img src={ACADEMY_IMG} alt="Academy" className="w-full h-[420px] object-cover" />
          </div>
          <div className="order-1 md:order-2">
            <span className="chip">Crystal Academy</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">Learn the craft from working masters.</h2>
            <p className="mt-4 text-white/70">Professional makeup, hair and beauty courses with hands-on studio time and portfolio-ready mentorship.</p>
            <a
              href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : "#"}
              data-testid="academy-enquire"
              className="btn-ghost-brand rounded-full inline-flex items-center gap-2 px-6 py-3 mt-6"
            >
              Enquire on WhatsApp <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Reviews */}
      {reviews.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
          <span className="chip">Guest Stories</span>
          <h2 className="font-display text-3xl md:text-5xl mt-3 mb-8">Voices from our chairs</h2>
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
            <span className="chip">Visit Us</span>
            <h2 className="font-display text-3xl md:text-5xl mt-3">Come say hello.</h2>
            <div className="mt-6 space-y-3 text-white/75">
              <div className="flex items-center gap-3"><MapPin className="w-4 h-4 text-pink-brand" />{settings?.address}</div>
              <div className="flex items-center gap-3"><Phone className="w-4 h-4 text-pink-brand" />{settings?.phone}</div>
            </div>
            <a
              href={settings?.maps_url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary rounded-full inline-flex px-6 py-3 mt-6"
              data-testid="get-directions"
            >
              Get Directions
            </a>
          </div>
          <div className="card-lux p-6">
            <div className="font-display text-2xl mb-3">Hours</div>
            <div className="text-white/70 text-sm">Open daily · {settings?.opening_time} – {settings?.closing_time}</div>
            <div className="divider-hairline my-5" />
            <div className="text-white/60 text-sm">Walk-ins welcome. Prior booking recommended for bridal and academy consultations.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
