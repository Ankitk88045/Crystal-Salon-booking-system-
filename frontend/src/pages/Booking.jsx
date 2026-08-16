import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Check, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

const STEPS = ["Service", "Date & Time", "Details", "Payment", "Confirmed"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(base, days) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Booking() {
  const [params] = useSearchParams();
  const bridalMode = params.get("mode") === "bridal";
  const serviceIdParam = params.get("serviceId");
  const nav = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState(serviceIdParam || "");
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [gender, setGender] = useState(bridalMode ? "female" : "female");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(user?.name || ""), [user]);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);

  useEffect(() => {
    const params = bridalMode ? {} : {};
    api.get("/services", { params }).then((r) => {
      let list = unwrap(r) || [];
      if (bridalMode) list = list.filter((s) => s.category_name === "Bridal");
      setServices(list);
      if (!serviceId && list.length && bridalMode) setServiceId(list[0].id);
    });
  }, [bridalMode]);

  useEffect(() => {
    if (!serviceId) return;
    setSlotsLoading(true);
    api.get("/availability", { params: { service_id: serviceId, date_str: date } })
      .then((r) => setSlots(unwrap(r).slots || []))
      .finally(() => setSlotsLoading(false));
  }, [serviceId, date]);

  const goNext = () => {
    if (step === 0 && !serviceId) return toast.error("Please select a service");
    if (step === 1 && !startTime) return toast.error("Please pick a time slot");
    if (step === 2 && !name.trim()) return toast.error("Please enter your name");
    setStep((s) => Math.min(s + 1, 4));
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const requireLogin = () => {
    if (!user) {
      toast.info("Please verify your mobile to continue");
      nav(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return true;
    }
    return false;
  };

  const createAndPay = async () => {
    if (requireLogin()) return;
    if (!service) return;
    if (service.gender_policy === "female_only" && gender !== "female") {
      return toast.error("This service is available only for female customers.");
    }
    setBusy(true);
    try {
      const bRes = await api.post("/bookings", {
        service_id: service.id,
        appointment_date: date,
        start_time: startTime,
        customer_notes: notes,
        customer_gender: gender,
        customer_name: name,
      });
      const booking = unwrap(bRes);
      const oRes = await api.post(`/payments/create-order?booking_id=${booking.id}`);
      const order = unwrap(oRes);
      // Mock Razorpay flow — verify immediately
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
    } finally {
      setBusy(false);
    }
  };

  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));
  const price = service ? (service.offer_price || service.price) : 0;
  const advance = Math.round(price * 0.1);
  const remaining = Math.round(price - advance);

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 md:py-12">
      {/* progress */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 flex items-center">
            <div
              data-testid={`step-${i}`}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= step ? "bg-pink-brand text-[#050505]" : "border border-white/15 text-white/50"
              }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-[2px] mx-2 ${i < step ? "bg-pink-brand" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="text-center text-white/70 mb-6 text-sm">Step {step + 1}: <span className="text-white">{STEPS[step]}</span></div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
        >
          {step === 0 && (
            <div>
              <h2 className="font-display text-2xl mb-4">{bridalMode ? "Choose a bridal package" : "Pick a service"}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {services.map((s) => (
                  <button
                    key={s.id}
                    data-testid={`select-service-${s.slug}`}
                    onClick={() => setServiceId(s.id)}
                    className={`card-lux p-4 flex gap-4 text-left transition-colors ${
                      serviceId === s.id ? "border-pink-brand" : "hover:border-white/20"
                    }`}
                  >
                    <img src={s.image_url} alt={s.name} className="w-20 h-20 rounded-xl object-cover" />
                    <div className="flex-1">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-white/50">{s.duration_minutes} min</div>
                      <div className="text-pink-brand mt-1">₹{Math.round(s.offer_price || s.price)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-display text-2xl mb-4">Choose date & time</h2>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
                {dates.map((d) => {
                  const dt = new Date(d);
                  const isActive = d === date;
                  return (
                    <button
                      key={d}
                      data-testid={`date-${d}`}
                      onClick={() => { setDate(d); setStartTime(""); }}
                      className={`shrink-0 rounded-2xl px-4 py-3 border text-center transition-colors ${
                        isActive ? "bg-pink-brand text-[#050505] border-pink-brand" : "border-white/10 hover:border-pink-brand text-white/80"
                      }`}
                    >
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
                ) : slots.length === 0 ? (
                  <div className="text-white/60">Salon is closed on this day.</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map((sl) => (
                      <button
                        key={sl.start_time}
                        data-testid={`slot-${sl.start_time}`}
                        disabled={!sl.available}
                        onClick={() => setStartTime(sl.start_time)}
                        className={`py-2.5 rounded-lg border text-sm transition-colors ${
                          startTime === sl.start_time
                            ? "bg-pink-brand text-[#050505] border-pink-brand"
                            : sl.available
                              ? "border-white/10 hover:border-pink-brand text-white/85"
                              : "border-white/5 text-white/25 line-through cursor-not-allowed"
                        }`}
                      >
                        {sl.start_time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
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
                      const disabled = service?.gender_policy === "female_only" && g === "male";
                      return (
                        <button
                          key={g}
                          data-testid={`gender-${g}`}
                          disabled={disabled}
                          onClick={() => setGender(g)}
                          className={`px-4 py-2 rounded-full border text-sm capitalize ${
                            gender === g ? "bg-pink-brand text-[#050505] border-pink-brand" : "border-white/15 text-white/70"
                          } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  {service?.gender_policy === "female_only" && (
                    <div className="text-[11px] text-white/50 mt-1">This service is offered to female guests only.</div>
                  )}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-white/50">Notes (optional)</label>
                  <textarea data-testid="input-notes" className="input-lux mt-1 min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && service && (
            <div>
              <h2 className="font-display text-2xl mb-4">Booking summary</h2>
              <div className="card-lux p-6 space-y-3">
                <Row label="Service" value={service.name} />
                <Row label="Date" value={date} />
                <Row label="Time" value={startTime} />
                <Row label="Duration" value={`${service.duration_minutes} min`} />
                <div className="divider-hairline my-2" />
                <Row label="Total" value={`₹${Math.round(price)}`} />
                <Row label="Pay Now (10%)" value={`₹${advance}`} highlight />
                <Row label="Pay at Salon" value={`₹${remaining}`} />
              </div>
              <button
                data-testid="pay-now-btn"
                onClick={createAndPay}
                disabled={busy}
                className="btn-primary rounded-full mt-6 w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Pay ₹{advance} & Confirm
              </button>
              <div className="text-[11px] text-white/50 mt-3 text-center">Payment simulated in demo mode. Razorpay activates the moment keys are added.</div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {step < 3 && (
        <div className="flex justify-between mt-8">
          <button
            data-testid="back-btn"
            onClick={goBack}
            disabled={step === 0}
            className="btn-ghost-brand rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            data-testid="next-btn"
            onClick={goNext}
            className="btn-primary rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
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
