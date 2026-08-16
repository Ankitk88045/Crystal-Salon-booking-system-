import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, Loader2, Store, MessageCircle, Sparkles,
  Home as HomeIcon, Clock, Search, Plus, Trash2, ShoppingBag, CreditCard, Store as StoreIcon,
} from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STEPS = ["Location", "Services", "Date & Time", "Details", "Payment", "Confirmed"];

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (base, days) => {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function Booking() {
  const [params] = useSearchParams();
  const bridalMode = params.get("mode") === "bridal";
  const preselectId = params.get("serviceId");
  const nav = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(bridalMode ? 1 : 0);
  const [location, setLocation] = useState("salon");
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(preselectId ? [preselectId] : []);
  const [showCart, setShowCart] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [gender, setGender] = useState("female");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [settings, setSettings] = useState(null);
  const [paymentOption, setPaymentOption] = useState("advance_online");
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(user?.name || ""), [user]);
  useEffect(() => {
    api.get("/settings").then((r) => setSettings(unwrap(r)));
    api.get("/services").then((r) => setServices(unwrap(r) || []));
    api.get("/categories").then((r) => setCategories(unwrap(r) || []));
  }, []);

  const filteredCatalog = useMemo(() => {
    let list = services;
    if (bridalMode) list = list.filter((s) => s.category_name === "Bridal");
    if (activeCat !== "all") list = list.filter((s) => s.category_id === activeCat);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
    return list;
  }, [services, bridalMode, activeCat, query]);

  const selectedServices = useMemo(
    () => selectedIds.map((id) => services.find((s) => s.id === id)).filter(Boolean),
    [selectedIds, services]
  );

  const totalPrice = selectedServices.reduce((a, s) => a + (s.offer_price || s.price), 0);
  const totalDuration = selectedServices.reduce((a, s) => a + s.duration_minutes + (s.buffer_minutes || 0), 0);
  const advancePct = settings?.advance_percentage ?? 10;
  const advanceAmount = Math.round(totalPrice * advancePct / 100);
  const remainingAfterAdvance = Math.round(totalPrice - advanceAmount);

  const canPayAtCentre = !!user?.can_pay_at_centre;

  useEffect(() => {
    // Ensure paymentOption is allowed for this customer
    if (paymentOption === "pay_at_centre" && !canPayAtCentre) setPaymentOption("advance_online");
  }, [canPayAtCentre, paymentOption]);

  useEffect(() => {
    if (selectedIds.length === 0 || location !== "salon" || step < 2) return;
    setSlotsLoading(true);
    api.get("/availability", { params: { service_ids: selectedIds.join(","), date_str: date } })
      .then((r) => setSlots(unwrap(r).slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedIds, date, location, step]);

  const toggleService = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setStartTime("");
  };
  const removeService = (id) => setSelectedIds((prev) => prev.filter((x) => x !== id));

  const goToWhatsApp = () => {
    const phone = (settings?.whatsapp || "").replace(/\D/g, "");
    if (!phone) return toast.error("WhatsApp number not configured");
    const msg = encodeURIComponent(
      "Hi Crystal Makeover! I'd like to book a home / doorstep service in Lucknow. Please share available dates and pricing."
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const goNext = () => {
    if (step === 0 && location === "home") return goToWhatsApp();
    if (step === 1 && selectedIds.length === 0) return toast.error("Please add at least one service");
    if (step === 2 && !startTime) return toast.error("Please pick a time slot");
    if (step === 3 && !name.trim()) return toast.error("Please enter your name");
    setStep((s) => Math.min(s + 1, 5));
  };
  const goBack = () => {
    if (bridalMode && step === 1) return;
    setStep((s) => Math.max(0, s - 1));
  };

  const requireLogin = () => {
    if (!user) {
      toast.info("Please verify your mobile to continue");
      nav(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return true;
    }
    return false;
  };

  const submit = async () => {
    if (requireLogin()) return;
    const anyFemaleOnly = selectedServices.some((s) => s.gender_policy === "female_only");
    if (anyFemaleOnly && gender !== "female") return toast.error("Some services are for female guests only.");
    setBusy(true);
    try {
      const bRes = await api.post("/bookings", {
        service_ids: selectedIds, location: "salon",
        appointment_date: date, start_time: startTime,
        customer_notes: notes, customer_gender: gender, customer_name: name,
        payment_option: paymentOption,
      });
      const booking = unwrap(bRes);
      if (paymentOption === "pay_at_centre") {
        toast.success("Booking confirmed! Pay at the centre after your service.");
        nav(`/booking/success/${booking.id}`);
        return;
      }
      const oRes = await api.post(`/payments/create-order?booking_id=${booking.id}`);
      const order = unwrap(oRes);
      const vRes = await api.post("/payments/verify", {
        booking_id: booking.id,
        razorpay_order_id: order.order_id,
        razorpay_payment_id: "pay_mock_" + Math.random().toString(36).slice(2, 12),
        razorpay_signature: "sig_mock_ok",
      });
      const paid = unwrap(vRes);
      toast.success("Payment verified & booking confirmed!");
      nav(`/booking/success/${paid.booking.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not complete booking");
    } finally { setBusy(false); }
  };

  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));
  const visibleSteps = bridalMode ? STEPS.slice(1) : STEPS;
  const effectiveStep = bridalMode ? step - 1 : step;

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-12">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {visibleSteps.map((s, i) => (
          <div key={s} className="flex-1 flex items-center">
            <div
              data-testid={`step-${i}`}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= effectiveStep ? "bg-pink-brand text-white" : "border border-white/15 text-white/50"
              }`}
            >
              {i < effectiveStep ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < visibleSteps.length - 1 && <div className={`flex-1 h-[2px] mx-2 ${i < effectiveStep ? "bg-pink-brand" : "bg-white/10"}`} />}
          </div>
        ))}
      </div>
      <div className="text-center text-white/70 mb-6 text-sm">
        Step {effectiveStep + 1}: <span className="text-white">{visibleSteps[effectiveStep]}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
          {step === 0 && !bridalMode && (
            <div className="max-w-3xl mx-auto">
              <h2 className="font-display text-2xl mb-2">Where would you like the service?</h2>
              <p className="text-white/60 text-sm mb-6">Book online for the salon. Home service requests are handled personally on WhatsApp.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <button data-testid="loc-salon" onClick={() => setLocation("salon")}
                  className={`card-lux p-5 text-left flex gap-4 items-start ${location === "salon" ? "border-pink-brand" : "hover:border-white/20"}`}>
                  <div className="w-11 h-11 rounded-xl bg-pink-brand/15 flex items-center justify-center"><Store className="w-5 h-5 text-pink-brand" /></div>
                  <div className="flex-1">
                    <div className="font-display text-lg">At Salon (Centre)</div>
                    <div className="text-white/60 text-xs mt-1">{settings?.address}</div>
                    <div className="text-[10px] uppercase tracking-widest text-pink-brand mt-2">Book online</div>
                  </div>
                </button>
                <button data-testid="loc-home" onClick={() => setLocation("home")}
                  className={`card-lux p-5 text-left flex gap-4 items-start ${location === "home" ? "border-pink-brand" : "hover:border-white/20"}`}>
                  <div className="w-11 h-11 rounded-xl bg-pink-brand/15 flex items-center justify-center"><HomeIcon className="w-5 h-5 text-pink-brand" /></div>
                  <div className="flex-1">
                    <div className="font-display text-lg">At Home (Doorstep)</div>
                    <div className="text-white/60 text-xs mt-1">{settings?.home_service_area || "Available in Lucknow, UP only"}</div>
                    <div className="text-[10px] uppercase tracking-widest text-pink-brand mt-2">Chat on WhatsApp</div>
                  </div>
                </button>
              </div>
              {location === "home" && (
                <div className="mt-6 card-lux p-5 border-pink-brand/40">
                  <div className="flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-pink-brand shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Home service is coordinated on WhatsApp</div>
                      <div className="text-white/60 text-sm mt-1">Chat with our team — they&apos;ll confirm availability, pricing and send a payment link.</div>
                      <button data-testid="whatsapp-redirect-btn" onClick={goToWhatsApp} className="btn-primary rounded-full inline-flex items-center gap-2 px-5 py-2.5 text-sm mt-4">
                        <MessageCircle className="w-4 h-4" /> Open WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
              {/* Catalog */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input data-testid="svc-search" value={query} onChange={(e) => setQuery(e.target.value)} className="input-lux pl-9" placeholder="Search services…" />
                  </div>
                  <button data-testid="open-cart-btn" onClick={() => setShowCart(true)} className="lg:hidden relative btn-ghost-brand rounded-full h-11 w-11 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                    {selectedIds.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink-brand text-white text-[10px] font-bold flex items-center justify-center">{selectedIds.length}</span>
                    )}
                  </button>
                </div>

                {!bridalMode && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-2">
                    <button onClick={() => setActiveCat("all")} className={`px-3 py-1.5 rounded-full text-xs border shrink-0 ${activeCat === "all" ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}>All</button>
                    {categories.map((c) => (
                      <button key={c.id} onClick={() => setActiveCat(c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border shrink-0 ${activeCat === c.id ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="max-h-[560px] overflow-y-auto pr-1 space-y-3">
                  {filteredCatalog.map((s) => {
                    const isOn = selectedIds.includes(s.id);
                    return (
                      <div key={s.id} data-testid={`service-row-${s.slug}`} className="card-lux p-3 flex gap-3 items-center">
                        <img src={s.image_url} alt={s.name} className="w-16 h-16 rounded-xl object-cover" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="text-[11px] text-white/50 flex items-center gap-2 mt-0.5">
                            <span>{s.category_name}</span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            <span>{s.duration_minutes} min</span>
                          </div>
                          <div className="text-pink-brand text-sm mt-1">₹{Math.round(s.offer_price || s.price)}</div>
                        </div>
                        <button
                          data-testid={`toggle-${s.slug}`}
                          onClick={() => toggleService(s.id)}
                          className={`shrink-0 rounded-full text-xs font-medium px-3 py-2 inline-flex items-center gap-1 transition-colors ${
                            isOn ? "bg-white/10 text-white/70" : "bg-pink-brand text-white"
                          }`}
                        >
                          {isOn ? <><Check className="w-3.5 h-3.5" /> Added</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
                        </button>
                      </div>
                    );
                  })}
                  {filteredCatalog.length === 0 && <div className="text-white/50 text-sm py-8 text-center">No services match your search.</div>}
                </div>
              </div>

              {/* Cart (desktop) */}
              <aside className="hidden lg:block sticky top-24 h-fit">
                <CartCard selected={selectedServices} onRemove={removeService} totalPrice={totalPrice} totalDuration={totalDuration} />
              </aside>

              {/* Cart (mobile drawer) */}
              {showCart && (
                <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end" onClick={() => setShowCart(false)}>
                  <div className="w-full card-lux rounded-b-none p-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <CartCard selected={selectedServices} onRemove={removeService} totalPrice={totalPrice} totalDuration={totalDuration} onClose={() => setShowCart(false)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-display text-2xl mb-2">Choose date & time</h2>
              <p className="text-white/60 text-sm mb-4">Total duration: {totalDuration} min · {selectedServices.length} service{selectedServices.length > 1 ? "s" : ""}</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
                {dates.map((d) => {
                  const dt = new Date(d);
                  const isActive = d === date;
                  return (
                    <button key={d} data-testid={`date-${d}`} onClick={() => { setDate(d); setStartTime(""); }}
                      className={`shrink-0 rounded-2xl px-4 py-3 border text-center ${isActive ? "bg-pink-brand text-white border-pink-brand" : "border-white/10 text-white/80"}`}>
                      <div className="text-[10px] uppercase tracking-widest opacity-70">{dt.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                      <div className="font-display text-xl">{dt.getDate()}</div>
                      <div className="text-[10px] opacity-70">{dt.toLocaleDateString("en-IN", { month: "short" })}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                {slotsLoading ? (
                  <div className="text-white/60 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading slots…</div>
                ) : slots.length === 0 ? <div className="text-white/60">Salon is closed on this day.</div> : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {slots.map((sl) => (
                      <button key={sl.start_time} data-testid={`slot-${sl.start_time}`} disabled={!sl.available} onClick={() => setStartTime(sl.start_time)}
                        className={`py-2.5 rounded-lg border text-sm ${
                          startTime === sl.start_time ? "bg-pink-brand text-white border-pink-brand" :
                          sl.available ? "border-white/10 hover:border-pink-brand text-white/85" : "border-white/5 text-white/25 line-through cursor-not-allowed"
                        }`}>
                        {sl.start_time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-xl">
              <h2 className="font-display text-2xl mb-4">Your details</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-widest text-white/50">Name</label>
                  <input data-testid="input-name" className="input-lux mt-1" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-white/50">Gender</label>
                  <div className="mt-2 flex gap-2">
                    {["female", "male"].map((g) => {
                      const anyFemaleOnly = selectedServices.some((s) => s.gender_policy === "female_only");
                      const disabled = anyFemaleOnly && g === "male";
                      return (
                        <button key={g} data-testid={`gender-${g}`} disabled={disabled} onClick={() => setGender(g)}
                          className={`px-4 py-2 rounded-full border text-sm capitalize ${
                            gender === g ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"
                          } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>{g}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-white/50">Notes (optional)</label>
                  <textarea data-testid="input-notes" className="input-lux mt-1 min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 4 && selectedServices.length > 0 && (
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl mb-4">Payment</h2>

              {/* Payment options */}
              <div className="space-y-3">
                <PayOption
                  active={paymentOption === "advance_online"}
                  onClick={() => setPaymentOption("advance_online")}
                  testId="pay-advance"
                  icon={CreditCard}
                  title={`Pay ${advancePct}% Advance Online`}
                  subtitle={`Pay ₹${advanceAmount} now, ₹${remainingAfterAdvance} at the salon after your service.`}
                  badge="Recommended"
                />
                <PayOption
                  active={paymentOption === "full_online"}
                  onClick={() => setPaymentOption("full_online")}
                  testId="pay-full"
                  icon={CreditCard}
                  title="Pay Full Amount Online"
                  subtitle={`Pay ₹${Math.round(totalPrice)} now. No payment needed at the salon.`}
                />
                <PayOption
                  active={paymentOption === "pay_at_centre"}
                  onClick={() => canPayAtCentre ? setPaymentOption("pay_at_centre") : null}
                  testId="pay-centre"
                  icon={StoreIcon}
                  title="Pay at Centre"
                  subtitle={canPayAtCentre
                    ? `Pay ₹${Math.round(totalPrice)} at the salon after your service.`
                    : "Available after your first completed visit."}
                  disabled={!canPayAtCentre}
                />
              </div>

              {/* Summary */}
              <div className="card-lux p-6 space-y-2 mt-6">
                <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Summary</div>
                {selectedServices.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div className="text-white/80">{s.name} <span className="text-white/40 text-xs">· {s.duration_minutes} min</span></div>
                    <div className="text-white">₹{Math.round(s.offer_price || s.price)}</div>
                  </div>
                ))}
                <div className="divider-hairline" />
                <Row label="Date" value={date} />
                <Row label="Time" value={startTime} />
                <Row label="Total" value={`₹${Math.round(totalPrice)}`} />
                {paymentOption === "advance_online" && <>
                  <Row label={`Pay Now (${advancePct}%)`} value={`₹${advanceAmount}`} highlight />
                  <Row label="Pay at Salon" value={`₹${remainingAfterAdvance}`} />
                </>}
                {paymentOption === "full_online" && <Row label="Pay Now" value={`₹${Math.round(totalPrice)}`} highlight />}
                {paymentOption === "pay_at_centre" && <Row label="Pay at Salon" value={`₹${Math.round(totalPrice)}`} highlight />}
              </div>

              <button data-testid="pay-now-btn" onClick={submit} disabled={busy}
                className="btn-primary rounded-full mt-6 w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {paymentOption === "pay_at_centre" ? "Confirm Booking" : `Pay ₹${paymentOption === "full_online" ? Math.round(totalPrice) : advanceAmount} & Confirm`}
              </button>
              {paymentOption !== "pay_at_centre" && (
                <div className="text-[11px] text-white/50 mt-3 text-center">Payment simulated in demo mode. Razorpay activates the moment keys are added.</div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {step < 4 && !(step === 0 && location === "home") && (
        <div className="flex justify-between mt-8">
          <button data-testid="back-btn" onClick={goBack} disabled={step === 0 || (bridalMode && step === 1)}
            className="btn-ghost-brand rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button data-testid="next-btn" onClick={goNext} className="btn-primary rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CartCard({ selected, onRemove, totalPrice, totalDuration, onClose }) {
  return (
    <div className="card-lux p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-lg flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-pink-brand" /> Your cart</div>
        {onClose && <button onClick={onClose} className="text-white/60 text-sm">Close</button>}
      </div>
      {selected.length === 0 ? (
        <div className="text-white/50 text-sm py-6 text-center">Add services to see your cart.</div>
      ) : (
        <>
          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {selected.map((s) => (
              <div key={s.id} className="flex gap-3" data-testid={`cart-item-${s.slug}`}>
                <img src={s.image_url} alt={s.name} className="w-14 h-14 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-white/50 flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_minutes} min</div>
                  <div className="text-pink-brand text-sm mt-0.5">₹{Math.round(s.offer_price || s.price)}</div>
                </div>
                <button data-testid={`cart-remove-${s.slug}`} onClick={() => onRemove(s.id)} className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="divider-hairline my-4" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">{selected.length} service{selected.length > 1 ? "s" : ""} · {totalDuration} min</span>
            <span className="font-display text-xl text-pink-brand">₹{Math.round(totalPrice)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function PayOption({ active, onClick, testId, icon: Icon, title, subtitle, badge, disabled }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`w-full card-lux p-4 flex gap-4 items-start text-left transition-colors ${
        active ? "border-pink-brand" : disabled ? "opacity-50 cursor-not-allowed" : "hover:border-white/20"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-pink-brand/20" : "bg-white/[0.04]"}`}>
        <Icon className={`w-5 h-5 ${active ? "text-pink-brand" : "text-white/70"}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="font-medium">{title}</div>
          {badge && <span className="text-[9px] uppercase tracking-widest bg-pink-brand/15 text-pink-brand border border-pink-brand/30 rounded-full px-2 py-0.5">{badge}</span>}
        </div>
        <div className="text-white/60 text-xs mt-1">{subtitle}</div>
      </div>
      <div className={`w-5 h-5 rounded-full border ${active ? "border-pink-brand bg-pink-brand" : "border-white/25"} flex items-center justify-center`}>
        {active && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-white/60 text-sm">{label}</div>
      <div className={highlight ? "text-pink-brand font-medium" : "text-white"}>{value}</div>
    </div>
  );
}
