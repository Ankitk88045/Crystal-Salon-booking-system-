import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, unwrap } from "@/lib/api";
import { CheckCircle2, MapPin, Phone } from "lucide-react";
import { motion } from "framer-motion";

export default function BookingConfirmation() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get(`/bookings/${bookingId}`).then((r) => setBooking(unwrap(r)));
    api.get("/settings").then((r) => setSettings(unwrap(r)));
  }, [bookingId]);

  if (!booking) return <div className="p-10 text-white/60">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-8 py-10 md:py-16">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
        <div className="h-20 w-20 rounded-full bg-pink-brand/15 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-pink-brand" />
        </div>
      </motion.div>
      <h1 className="font-display text-3xl md:text-4xl text-center mt-6">You&apos;re booked in!</h1>
      <p className="text-center text-white/60 mt-2">A confirmation SMS has been sent to your phone.</p>

      <div className="card-lux p-6 mt-8 space-y-2 text-sm">
        <Row label="Booking #" value={booking.booking_number} testId="conf-booking-number" />
        <Row label="Service" value={booking.service_name_snapshot} />
        <Row label="Date" value={booking.appointment_date} />
        <Row label="Time" value={`${booking.start_time} – ${booking.end_time}`} />
        <div className="divider-hairline my-2" />
        <Row label="Total" value={`₹${Math.round(booking.total_amount)}`} />
        <Row label="Advance Paid" value={`₹${Math.round(booking.advance_amount)}`} highlight />
        <Row label="Pay at Salon" value={`₹${Math.round(booking.remaining_amount)}`} />
      </div>

      {settings && (
        <div className="card-lux p-6 mt-4 text-sm">
          <div className="font-display text-lg mb-2">{settings.salon_name}</div>
          <div className="flex items-center gap-2 text-white/70"><MapPin className="w-4 h-4 text-pink-brand" /> {settings.address}</div>
          <div className="flex items-center gap-2 text-white/70 mt-1"><Phone className="w-4 h-4 text-pink-brand" /> {settings.phone}</div>
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <Link to="/bookings" className="btn-primary rounded-full px-5 py-3 flex-1 text-center">My Bookings</Link>
        <Link to="/services" className="btn-ghost-brand rounded-full px-5 py-3 flex-1 text-center">Book Another</Link>
      </div>
    </div>
  );
}

function Row({ label, value, highlight, testId }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-white/60">{label}</div>
      <div data-testid={testId} className={highlight ? "text-pink-brand font-medium" : "text-white"}>{value}</div>
    </div>
  );
}
