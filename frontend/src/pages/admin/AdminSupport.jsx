import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function AdminSupport() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");

  const load = () => api.get("/admin/support").then((r) => setItems(unwrap(r) || []));
  useEffect(load, []);

  const update = async (id, patch) => {
    try {
      await api.patch(`/admin/support/${id}`, patch);
      toast.success("Updated");
      load();
      if (selected?.id === id) setSelected({ ...selected, ...patch });
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    await update(selected.id, { admin_reply: reply, status: selected.status === "OPEN" ? "IN_PROGRESS" : selected.status });
    setReply("");
    toast.success("Reply sent");
  };

  const statusColor = (s) =>
    s === "OPEN" ? "text-pink-brand border-pink-brand/40" :
    s === "IN_PROGRESS" ? "text-amber-300 border-amber-400/40" :
    s === "RESOLVED" ? "text-emerald-400 border-emerald-400/40" :
    "text-white/50 border-white/20";

  return (
    <div>
      <h1 className="font-display text-3xl">Support Tickets</h1>
      <p className="text-white/60 text-sm mt-1">Customer queries from the floating WhatsApp button on the site.</p>

      <div className="mt-6 card-lux overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d0d] text-white/60 text-xs uppercase tracking-widest">
            <tr>
              <th className="text-left px-4 py-3">Ticket</th>
              <th className="text-left px-4 py-3">From</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Subject</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} onClick={() => setSelected(t)} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer" data-testid={`support-row-${t.ticket_number}`}>
                <td className="px-4 py-3 font-mono">{t.ticket_number}</td>
                <td className="px-4 py-3">{t.name}<div className="text-white/50 text-xs">{t.phone}</div></td>
                <td className="px-4 py-3 hidden md:table-cell max-w-[260px] truncate">{t.subject}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] tracking-widest uppercase px-2 py-1 rounded-full border ${statusColor(t.status)}`}>
                    {t.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-white/50">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center px-4 py-10 text-white/50">No tickets yet</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setSelected(null)}>
          <div className="card-lux p-6 w-full md:max-w-lg rounded-b-none md:rounded-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-white/50 uppercase tracking-widest">{selected.ticket_number}</div>
                <div className="font-display text-2xl mt-1">{selected.subject}</div>
                <div className="text-white/60 text-sm">{selected.name} · {selected.phone}{selected.email ? ` · ${selected.email}` : ""}</div>
              </div>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-white/60" /></button>
            </div>

            <div className="mt-4 card-lux p-4 text-sm text-white/80 whitespace-pre-wrap">{selected.message}</div>

            {selected.admin_reply && (
              <div className="mt-3 card-lux p-4 text-sm text-pink-brand/90 whitespace-pre-wrap border-pink-brand/40">
                <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Your reply</div>
                {selected.admin_reply}
              </div>
            )}

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Change status</div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    data-testid={`set-${s}`}
                    onClick={() => update(selected.id, { status: s })}
                    className={`text-xs px-3 py-1.5 rounded-full border ${selected.status === s ? "bg-pink-brand text-white border-pink-brand" : "border-white/15 text-white/70"}`}
                  >
                    {s.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Send reply (emails the customer)</div>
              <textarea data-testid="admin-reply" className="input-lux min-h-[100px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply…" />
              <button data-testid="send-reply" onClick={sendReply} className="btn-primary rounded-full w-full py-2.5 mt-2 text-sm">Send reply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
