import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";

export default function AdminCustomers() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/customers").then((r) => setItems(unwrap(r) || [])); }, []);

  return (
    <div>
      <h1 className="font-display text-3xl">Customers</h1>
      <div className="mt-6 card-lux overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d0d] text-white/60 text-xs uppercase tracking-widest">
            <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Mobile</th><th className="text-left px-4 py-3 hidden md:table-cell">Bookings</th><th className="text-left px-4 py-3 hidden md:table-cell">Completed</th><th className="text-left px-4 py-3">Spent</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3 hidden md:table-cell">{c.total_bookings}</td>
                <td className="px-4 py-3 hidden md:table-cell">{c.completed_bookings}</td>
                <td className="px-4 py-3 text-pink-brand">₹{Math.round(c.total_spent)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center px-4 py-10 text-white/50">No customers yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
