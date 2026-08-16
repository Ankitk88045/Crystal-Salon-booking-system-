import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

const STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "CUSTOMER_ARRIVED", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"];

export default function AdminBookings() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash");

  const load = () => {
    api.get("/admin/bookings", { params: filter ? { status_filter: filter } : {} }).then((r) => setItems(unwrap(r) || []));
  };
  useEffect(() => { load(); }, [filter]);

  const update = async (id, status) => {
    try {
      await api.patch(`/admin/bookings/${id}`, { status });
      toast.success("Updated");
      load(); if (selected?.id === id) setSelected(null);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const collect = async () => {
    if (!selected) return;
    try {
      await api.post(`/admin/bookings/${selected.id}/payment`, {
        amount: Number(payAmount) || selected.remaining_amount,
        payment_method: payMethod,
      });
      toast.success("Payment recorded");
      load(); setSelected(null);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const doReschedule = async () => {
    if (!selected || !reschedDate || !reschedTime) return toast.error("Pick date & time");
    try {
      await api.post(`/admin/bookings/${selected.id}/reschedule`, {
        appointment_date: reschedDate, start_time: reschedTime,
      });
      toast.success("Booking rescheduled");
      setShowReschedule(false); setSelected(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <h1 className="font-display text-3xl">Bookings</h1>
      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-full text-xs border ${!filter ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}>All</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs border shrink-0 ${filter === s ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}>{s.replaceAll("_", " ")}</button>
        ))}
      </div>

      <div className="mt-6 card-lux overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d0d] text-white/60 text-xs uppercase tracking-widest">
            <tr>
              <th className="text-left px-4 py-3">Booking</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Customer</th>
              <th className="text-left px-4 py-3">Date/Time</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} onClick={() => { setSelected(b); setPayAmount(b.remaining_amount); }} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer" data-testid={`admin-booking-${b.booking_number}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{b.booking_number}</div>
                  <div className="text-white/50 text-xs">{b.service_name_snapshot}</div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">{b.customer_name}<div className="text-white/50 text-xs">{b.customer_phone}</div></td>
                <td className="px-4 py-3">{b.appointment_date}<div className="text-white/50 text-xs">{b.start_time}</div></td>
                <td className="px-4 py-3 hidden md:table-cell">₹{Math.round(b.total_amount)}<div className="text-white/50 text-xs">Adv ₹{Math.round(b.advance_amount)}</div></td>
                <td className="px-4 py-3"><span className="text-[10px] tracking-widest uppercase px-2 py-1 rounded-full border border-white/15">{b.booking_status.replaceAll("_", " ")}</span></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-white/50">No bookings</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setSelected(null)}>
          <div className="card-lux p-6 w-full md:max-w-md rounded-b-none md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-white/50 uppercase tracking-widest">{selected.booking_number}</div>
                <div className="font-display text-2xl mt-1">{selected.service_name_snapshot}</div>
                <div className="text-white/60 text-sm">{selected.customer_name} · {selected.customer_phone}</div>
              </div>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="card-lux p-3"><div className="text-[10px] text-white/50 uppercase">Date</div>{selected.appointment_date}</div>
              <div className="card-lux p-3"><div className="text-[10px] text-white/50 uppercase">Time</div>{selected.start_time}</div>
              <div className="card-lux p-3"><div className="text-[10px] text-white/50 uppercase">Total</div>₹{Math.round(selected.total_amount)}</div>
              <div className="card-lux p-3"><div className="text-[10px] text-white/50 uppercase">Balance</div><span className="text-pink-brand">₹{Math.round(selected.remaining_amount)}</span></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["CONFIRMED", "CUSTOMER_ARRIVED", "IN_SERVICE", "COMPLETED", "NO_SHOW", "CANCELLED"].map((s) => (
                <button key={s} data-testid={`set-${s}`} onClick={() => update(selected.id, s)} className="btn-ghost-brand rounded-full px-3 py-1.5 text-xs">{s.replaceAll("_", " ")}</button>
              ))}
              <button data-testid="reschedule-btn" onClick={() => { setShowReschedule(true); setReschedDate(selected.appointment_date); setReschedTime(selected.start_time); }} className="btn-primary rounded-full px-3 py-1.5 text-xs">Reschedule</button>
            </div>

            {showReschedule && (
              <div className="mt-4 card-lux p-4">
                <div className="uppercase text-xs tracking-widest text-white/60">Move to new slot</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input data-testid="reschedule-date" type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="input-lux" />
                  <input data-testid="reschedule-time" type="time" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="input-lux" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setShowReschedule(false)} className="btn-ghost-brand rounded-full flex-1 py-2 text-xs">Cancel</button>
                  <button data-testid="reschedule-confirm" onClick={doReschedule} className="btn-primary rounded-full flex-1 py-2 text-xs">Confirm</button>
                </div>
              </div>
            )}

            {selected.booking_status === "COMPLETED" && selected.payment_status !== "PAID" && (
              <div className="mt-4 card-lux p-4">
                <div className="uppercase text-xs tracking-widest text-white/60">Collect remaining</div>
                <div className="mt-2 flex gap-2">
                  <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="input-lux" />
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="input-lux">
                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="other">Other</option>
                  </select>
                </div>
                <button data-testid="collect-payment" onClick={collect} className="btn-primary rounded-full w-full mt-3 py-2 text-sm">Record Payment</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
