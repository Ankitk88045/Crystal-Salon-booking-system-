import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Loader2, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/** Floating WhatsApp-style support button + inline enquiry form. */
export default function FloatingSupportButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(unwrap(r))).catch(() => {});
  }, []);
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: user.name || f.name, phone: user.phone || f.phone, email: user.email || f.email }));
  }, [user]);

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.message.trim())
      return toast.error("Please add name, phone and message");
    setBusy(true);
    try {
      const r = await api.post("/support/tickets", form);
      const t = unwrap(r);
      setTicket(t);
      toast.success(`Ticket ${t.ticket_number} created`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const openWhatsApp = () => {
    const phone = (settings?.whatsapp || "").replace(/\D/g, "");
    if (!phone) return toast.error("WhatsApp not configured");
    const msg = encodeURIComponent(
      `Hi Crystal Makeover! ${form.subject ? `Query: ${form.subject}. ` : ""}${form.message || "I'd like to know more about your services."}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const closeAll = () => {
    setOpen(false);
    setTimeout(() => { setTicket(null); }, 300);
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        data-testid="support-fab"
        onClick={() => setOpen(true)}
        aria-label="Chat with support"
        className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105"
        style={{ backgroundColor: "#25D366" }}
      >
        <MessageCircle className="w-7 h-7 text-white" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full ring-2 ring-black animate-pulse" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeAll}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:justify-end p-0 md:p-6"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              data-testid="support-drawer"
              className="card-lux w-full md:max-w-md max-h-[85vh] overflow-y-auto rounded-b-none md:rounded-2xl relative"
            >
              {/* Header */}
              <div className="p-5 flex items-start gap-3 border-b border-white/5" style={{ background: "linear-gradient(135deg, rgba(37,211,102,.15), transparent)" }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "#25D366" }}>
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-display text-lg">Crystal Support</div>
                  <div className="text-xs text-white/60">Typically replies within a few hours.</div>
                </div>
                <button onClick={closeAll} className="text-white/50 hover:text-white p-1"><X className="w-4 h-4" /></button>
              </div>

              {!ticket ? (
                <div className="p-5 space-y-3">
                  <p className="text-white/70 text-sm">
                    Share your details and question — we&apos;ll email you a ticket ID and get back to you soon.
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Name</label>
                    <input data-testid="sup-name" className="input-lux mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Phone</label>
                    <input data-testid="sup-phone" className="input-lux mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Email <span className="text-white/40 normal-case">(for ticket confirmation)</span></label>
                    <input data-testid="sup-email" type="email" className="input-lux mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Subject</label>
                    <input data-testid="sup-subject" className="input-lux mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Bridal enquiry, pricing…" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Your query</label>
                    <textarea data-testid="sup-message" className="input-lux mt-1 min-h-[110px]" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" />
                  </div>
                  <button data-testid="sup-submit" disabled={busy} onClick={submit} className="btn-primary rounded-full w-full py-3 flex items-center justify-center gap-2">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send message
                  </button>
                  <button data-testid="sup-whatsapp" onClick={openWhatsApp} className="w-full rounded-full py-3 text-white font-medium" style={{ backgroundColor: "#25D366" }}>
                    <MessageCircle className="inline w-4 h-4 mr-2" /> Continue on WhatsApp
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-14 h-14 text-pink-brand mx-auto" />
                  <div className="font-display text-2xl mt-3">We&apos;ve got your message!</div>
                  <div className="text-white/60 text-sm mt-1">Save this ticket ID for reference.</div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-pink-brand/40 bg-pink-brand/10 px-4 py-2">
                    <span data-testid="sup-ticket-id" className="font-mono font-bold text-pink-brand">{ticket.ticket_number}</span>
                    <button onClick={() => { navigator.clipboard.writeText(ticket.ticket_number); toast.success("Copied"); }}>
                      <Copy className="w-3.5 h-3.5 text-pink-brand" />
                    </button>
                  </div>
                  <p className="text-white/60 text-xs mt-4">
                    {form.email ? `A confirmation email has been sent to ${form.email}.` : "Add an email next time to receive ticket updates."}
                  </p>
                  <div className="flex gap-2 mt-6">
                    <button onClick={closeAll} className="btn-ghost-brand rounded-full py-2.5 flex-1 text-sm">Close</button>
                    <button onClick={openWhatsApp} className="rounded-full py-2.5 flex-1 text-sm text-white font-medium" style={{ backgroundColor: "#25D366" }}>Chat on WhatsApp</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
