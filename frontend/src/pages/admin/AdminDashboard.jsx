import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from "recharts";
import { CalendarCheck, IndianRupee, Users, Star, TrendingUp, Clock } from "lucide-react";

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then((r) => setD(unwrap(r))); }, []);
  if (!d) return <div className="text-white/60">Loading…</div>;

  const cards = [
    { icon: CalendarCheck, label: "Today's Bookings", value: d.today_bookings, testId: "kpi-today" },
    { icon: Clock, label: "Upcoming", value: d.upcoming_bookings },
    { icon: IndianRupee, label: "Today's Revenue", value: `₹${Math.round(d.today_revenue)}` },
    { icon: TrendingUp, label: "Advance Collected", value: `₹${Math.round(d.advance_collected)}` },
    { icon: IndianRupee, label: "Pending at Salon", value: `₹${Math.round(d.pending_salon_payments)}` },
    { icon: Users, label: "Customers", value: d.total_customers },
    { icon: Star, label: "Avg Rating", value: d.average_rating },
    { icon: CalendarCheck, label: "Completed", value: d.completed_bookings },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl">Dashboard</h1>
      <p className="text-white/60 text-sm mt-1">Snapshot of today&apos;s salon activity.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {cards.map((c) => (
          <div key={c.label} className="card-lux p-4" data-testid={c.testId}>
            <c.icon className="w-4 h-4 text-pink-brand" />
            <div className="text-2xl font-display mt-2">{c.value}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="card-lux p-5">
          <div className="uppercase text-xs tracking-widest text-white/50">Revenue · 7 days</div>
          <div className="h-64 mt-3">
            <ResponsiveContainer>
              <LineChart data={d.trend}>
                <XAxis dataKey="date" stroke="#666" fontSize={10} />
                <YAxis stroke="#666" fontSize={10} />
                <Tooltip contentStyle={{ background: "#0d0d0d", border: "1px solid #262626" }} />
                <Line dataKey="revenue" stroke="#BF7AAB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-lux p-5">
          <div className="uppercase text-xs tracking-widest text-white/50">Bookings · 7 days</div>
          <div className="h-64 mt-3">
            <ResponsiveContainer>
              <BarChart data={d.trend}>
                <XAxis dataKey="date" stroke="#666" fontSize={10} />
                <YAxis stroke="#666" fontSize={10} />
                <Tooltip contentStyle={{ background: "#0d0d0d", border: "1px solid #262626" }} />
                <Bar dataKey="bookings" fill="#BF7AAB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
