import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";

export default function AdminSmsLogs() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/sms-logs").then((r) => setItems(unwrap(r) || [])); }, []);
  return (
    <div>
      <h1 className="font-display text-3xl">SMS Logs</h1>
      <p className="text-white/60 text-sm mt-1">Every message sent from the platform (currently dev provider).</p>
      <div className="mt-6 card-lux overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0a] text-white/60 text-xs uppercase tracking-widest">
            <tr><th className="text-left px-4 py-3">Time</th><th className="text-left px-4 py-3">Phone</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3 hidden md:table-cell">Message</th></tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="px-4 py-3 text-xs">{new Date(s.sent_at).toLocaleString()}</td>
                <td className="px-4 py-3">{s.phone}</td>
                <td className="px-4 py-3 text-xs">{s.type}</td>
                <td className="px-4 py-3"><span className={s.status === "SENT" ? "text-emerald-400" : "text-red-400"}>{s.status}</span></td>
                <td className="px-4 py-3 hidden md:table-cell text-white/60 text-xs">{s.message}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center px-4 py-10 text-white/50">No SMS yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
