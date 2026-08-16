import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";
import { Star, Loader2 } from "lucide-react";

const TABS = [
  { key: "upcoming", label: "Upcoming", statuses: ["PENDING_PAYMENT", "CONFIRMED", "CUSTOMER_ARRIVED", "IN_SERVICE", "RESCHEDULED"] },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED", "NO_SHOW", "PAYMENT_FAILED"] },
];

export default function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [tab, setTab] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null); // booking obj
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/bookings").then((r) => setBookings(unwrap(r) || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = bookings.filter((b) => TABS.find((t) => t.key === tab).statuses.includes(b.booking_status));

  const cancel = async (id) => {
    try {
      await api.post(`/bookings/${id}/cancel`);
      toast.success("Booking cancelled");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Could not cancel"); }
  };

  const submitReview = async () => {
    try {
      await api.post("/reviews", { booking_id: reviewing.id, rating, review_text: text });
      toast.success("Thanks for your review!");
      setReviewing(null); setText(""); setRating(5);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Could not submit"); }
  };

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8 md:py-12">
      <h1 className="font-display text-3xl md:text-5xl">My Bookings</h1>
      <div className="mt-6 flex gap-2 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm relative transition-colors ${tab === t.key ? "text-pink-brand" : "text-white/60 hover:text-white"}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute -bottom-px inset-x-0 h-[2px] bg-pink-brand" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-white/60 mt-10 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-white/50 py-16">Your appointments will appear here.</div>
      ) : (
        <div className="mt-6 grid gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="card-lux p-5 flex flex-col md:flex-row gap-5" data-testid={`booking-card-${b.booking_number}`}>
              <img src={b.image_url} alt={b.service_name_snapshot} className="w-full md:w-40 h-32 rounded-xl object-cover" />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/50">{b.booking_number}</div>
                    <div className="font-display text-xl mt-1">{b.service_name_snapshot}</div>
                    <div className="text-sm text-white/60 mt-1">{b.appointment_date} · {b.start_time}–{b.end_time}</div>
                  </div>
                  <span className={`text-[10px] tracking-widest uppercase px-2 py-1 rounded-full border ${statusColor(b.booking_status)}`}>{prettyStatus(b.booking_status)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-white/60">Total: <span className="text-white">₹{Math.round(b.total_amount)}</span></span>
                  <span className="text-white/60">Advance: <span className="text-pink-brand">₹{Math.round(b.advance_amount)}</span></span>
                  <span className="text-white/60">Balance: <span className="text-white">₹{Math.round(b.remaining_amount)}</span></span>
                </div>
                <div className="mt-4 flex gap-2">
                  {["CONFIRMED", "PENDING_PAYMENT"].includes(b.booking_status) && (
                    <button data-testid={`cancel-${b.booking_number}`} onClick={() => cancel(b.id)} className="btn-ghost-brand rounded-full px-4 py-2 text-xs">Cancel</button>
                  )}
                  {b.booking_status === "COMPLETED" && (
                    <button data-testid={`review-${b.booking_number}`} onClick={() => setReviewing(b)} className="btn-primary rounded-full px-4 py-2 text-xs">Leave Review</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setReviewing(null)}>
          <div className="card-lux p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl">Leave a review</div>
            <div className="text-white/60 text-sm mt-1">{reviewing.service_name_snapshot}</div>
            <div className="flex gap-1 mt-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} data-testid={`star-${n}`} onClick={() => setRating(n)}>
                  <Star className={`w-8 h-8 ${n <= rating ? "text-pink-brand fill-current" : "text-white/25"}`} />
                </button>
              ))}
            </div>
            <textarea data-testid="review-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us about your visit" className="input-lux mt-4 min-h-[100px]" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setReviewing(null)} className="btn-ghost-brand rounded-full px-5 py-2 flex-1 text-sm">Cancel</button>
              <button data-testid="submit-review" onClick={submitReview} className="btn-primary rounded-full px-5 py-2 flex-1 text-sm">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function prettyStatus(s) { return s.replaceAll("_", " ").toLowerCase(); }
function statusColor(s) {
  if (s === "CONFIRMED") return "border-pink-brand/40 text-pink-brand";
  if (s === "COMPLETED") return "border-emerald-500/40 text-emerald-400";
  if (["CANCELLED", "NO_SHOW", "PAYMENT_FAILED"].includes(s)) return "border-red-500/30 text-red-300";
  return "border-white/15 text-white/70";
}
