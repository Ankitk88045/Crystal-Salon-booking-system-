import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, unwrap } from "@/lib/api";
import { Clock, ShieldCheck, ArrowRight } from "lucide-react";

export default function ServiceDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/services/${slug}`).then((r) => setData(unwrap(r)));
  }, [slug]);

  if (!data) return <div className="p-10 text-white/60">Loading…</div>;
  const s = data.service;

  return (
    <div>
      <div className="relative h-[50vh] md:h-[65vh]">
        <img src={s.image_url} alt={s.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-vignette" />
        <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-8 h-full flex items-end pb-10">
          <div>
            <span className="chip">{s.category_name}</span>
            <h1 className="font-display text-4xl md:text-6xl mt-3 max-w-2xl">{s.name}</h1>
            <div className="mt-3 flex items-center gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-pink-brand" /> {s.duration_minutes} min</span>
              <span className="text-pink-brand text-lg font-medium">₹{Math.round(s.offer_price || s.price)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 md:px-8 py-12 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <h2 className="font-display text-2xl mb-3">About this service</h2>
          <p className="text-white/70">{s.description}</p>

          <div className="mt-8 card-lux p-6">
            <div className="flex items-center gap-2 text-pink-brand"><ShieldCheck className="w-4 h-4" /> <span className="uppercase text-xs tracking-widest">Terms</span></div>
            <p className="mt-2 text-white/70 text-sm">{s.terms || "Standard booking terms apply."}</p>
          </div>

          {data.related.length > 0 && (
            <div className="mt-10">
              <div className="uppercase text-xs tracking-widest text-white/50 mb-3">Related</div>
              <div className="grid sm:grid-cols-2 gap-4">
                {data.related.map((r) => (
                  <Link key={r.id} to={`/services/${r.slug}`} className="card-lux p-4 flex gap-4 hover:border-pink-brand/40 transition-colors">
                    <img src={r.image_url} alt={r.name} className="w-20 h-20 rounded-xl object-cover" />
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-white/50">{r.duration_minutes} min</div>
                      <div className="text-pink-brand text-sm mt-1">₹{Math.round(r.offer_price || r.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="card-lux p-6 h-fit sticky top-24">
          <div className="text-3xl font-display text-pink-brand">₹{Math.round(s.offer_price || s.price)}</div>
          <div className="text-xs text-white/50">Pay only 10% online now.</div>
          <Link
            to={`/booking?serviceId=${s.id}`}
            data-testid="detail-book-now"
            className="btn-primary rounded-full mt-5 py-3 flex items-center justify-center gap-2"
          >
            Book Appointment <ArrowRight className="w-4 h-4" />
          </Link>
          <div className="divider-hairline my-5" />
          <div className="text-xs text-white/60 space-y-2">
            <div>• Advance: ₹{Math.round((s.offer_price || s.price) * 0.1)}</div>
            <div>• Balance ₹{Math.round((s.offer_price || s.price) * 0.9)} at salon</div>
            <div>• Cancellable up to 4 hours before appointment</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
