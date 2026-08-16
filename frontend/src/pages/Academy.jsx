import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Sparkles,
  Award,
  BookOpen,
  Users,
} from "lucide-react";
import { api, unwrap } from "@/lib/api";

const HERO =
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1600&q=80";

const HIGHLIGHTS = [
  { icon: Award, title: "Industry Certified", text: "Government-recognised certifications & placement support." },
  { icon: BookOpen, title: "Hands-on Studio", text: "Real client sessions, portfolio shoots and live evaluations." },
  { icon: Users, title: "Small Batches", text: "Max 8 students per batch for personalised mentoring." },
];

export default function Academy() {
  const [courses, setCourses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(null); // course to enquire about
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/courses").then((r) => setCourses(unwrap(r) || []));
    api.get("/settings").then((r) => setSettings(unwrap(r)));
  }, []);

  const submitEnquiry = async () => {
    if (!form.name || !form.phone) return toast.error("Name and phone are required");
    setBusy(true);
    try {
      await api.post("/academy/enquiry", { ...form, course: open?.name });
      toast.success("Thanks! Our academy team will reach out shortly.");
      setOpen(null); setForm({ name: "", phone: "", email: "", message: "" });
    } catch { toast.error("Could not submit enquiry"); } finally { setBusy(false); }
  };

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[60vh] md:min-h-[70vh] flex items-end">
        <img src={HERO} alt="Crystal Academy" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-vignette" />
        <div className="relative z-10 max-w-6xl mx-auto w-full px-5 md:px-8 pb-14">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <span className="chip">Crystal Academy</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl mt-4 max-w-3xl leading-tight">
              Turn your passion into a <span className="text-pink-brand">profession.</span>
            </h1>
            <p className="mt-4 text-white/70 max-w-xl">
              Learn professional bridal makeup, hair styling and Korean skincare from industry specialists. Certified courses with placement assistance.
            </p>
            <div className="flex gap-3 mt-7">
              <a href="#courses" className="btn-primary rounded-full px-6 py-3 inline-flex items-center gap-2">
                Browse Courses <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : "#"}
                className="btn-ghost-brand rounded-full px-6 py-3 inline-flex items-center gap-2"
                data-testid="academy-hero-whatsapp"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Highlights */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-12">
        <div className="grid md:grid-cols-3 gap-4">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="card-lux p-6 flex gap-4 items-start">
              <div className="w-11 h-11 rounded-xl bg-pink-brand/15 flex items-center justify-center shrink-0">
                <h.icon className="w-5 h-5 text-pink-brand" />
              </div>
              <div>
                <div className="font-display text-lg">{h.title}</div>
                <div className="text-white/60 text-sm mt-1">{h.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="max-w-6xl mx-auto px-5 md:px-8 pb-16">
        <div className="mb-8">
          <span className="chip inline-flex"><Sparkles className="w-3.5 h-3.5" /> Programmes</span>
          <h2 className="font-display text-3xl md:text-4xl mt-3">Certified courses at Crystal Academy</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {courses.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="card-lux overflow-hidden flex flex-col md:flex-row"
              data-testid={`course-${c.slug}`}
            >
              <img src={c.image_url} alt={c.name} className="md:w-56 h-52 md:h-auto object-cover" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="text-[10px] uppercase tracking-widest text-white/50">{c.duration}</div>
                <div className="font-display text-xl mt-1">{c.name}</div>
                <p className="text-sm text-white/60 mt-2 flex-1">{c.description}</p>
                <ul className="mt-3 space-y-1.5">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/70">
                      <CheckCircle2 className="w-3.5 h-3.5 text-pink-brand" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between mt-5">
                  <div className="text-pink-brand text-lg font-display">₹{Math.round(c.price).toLocaleString("en-IN")}</div>
                  <button
                    data-testid={`enquire-${c.slug}`}
                    onClick={() => setOpen(c)}
                    className="btn-primary rounded-full px-4 py-2 text-sm inline-flex items-center gap-1"
                  >
                    Enquire <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
          {courses.length === 0 && <div className="text-white/50">No courses listed yet.</div>}
        </div>
      </section>

      {/* Enquiry Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="card-lux p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl">Enquire · {open.name}</div>
            <div className="text-white/60 text-sm mt-1">Share your details, we&apos;ll call you back within a day.</div>
            <div className="space-y-3 mt-5">
              <input data-testid="enq-name" className="input-lux" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input data-testid="enq-phone" className="input-lux" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input data-testid="enq-email" className="input-lux" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <textarea data-testid="enq-message" className="input-lux min-h-[100px]" placeholder="Anything you'd like us to know?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setOpen(null)} className="btn-ghost-brand rounded-full px-5 py-2 flex-1 text-sm">Cancel</button>
              <button data-testid="enq-submit" disabled={busy} onClick={submitEnquiry} className="btn-primary rounded-full px-5 py-2 flex-1 text-sm">
                {busy ? "Sending…" : "Send Enquiry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
