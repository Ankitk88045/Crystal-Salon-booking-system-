import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, unwrap } from "@/lib/api";
import { ArrowRight, Clock } from "lucide-react";

export default function Services() {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [params, setParams] = useSearchParams();
  const catId = params.get("category") || "";

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(unwrap(r) || []));
  }, []);
  useEffect(() => {
    api.get("/services", { params: catId ? { category_id: catId } : {} })
      .then((r) => setServices(unwrap(r) || []));
  }, [catId]);

  const activeName = useMemo(() => categories.find((c) => c.id === catId)?.name, [categories, catId]);

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-10 md:py-16">
      <div className="mb-8">
        <span className="chip">Services</span>
        <h1 className="font-display text-4xl md:text-6xl mt-3">{activeName || "The full menu"}</h1>
        <p className="text-white/60 mt-2">Choose a service to see details and book your slot.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
        <button
          data-testid="cat-all"
          onClick={() => setParams({})}
          className={`px-4 py-2 rounded-full text-sm border transition-colors ${
            !catId ? "bg-pink-brand text-[#050505] border-pink-brand" : "border-white/15 text-white/70 hover:border-pink-brand"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            data-testid={`cat-${c.slug}`}
            onClick={() => setParams({ category: c.id })}
            className={`px-4 py-2 rounded-full text-sm border shrink-0 transition-colors ${
              catId === c.id ? "bg-pink-brand text-[#050505] border-pink-brand" : "border-white/15 text-white/70 hover:border-pink-brand"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {services.length === 0 ? (
        <div className="mt-16 text-center text-white/50">No services available currently.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {services.map((s) => (
            <div key={s.id} className="card-lux overflow-hidden group flex flex-col">
              <Link to={`/services/${s.slug}`} className="block aspect-[4/3] overflow-hidden">
                <img src={s.image_url} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </Link>
              <div className="p-5 flex-1 flex flex-col">
                <div className="text-[11px] uppercase tracking-widest text-white/50">{s.category_name}</div>
                <div className="font-display text-xl mt-1">{s.name}</div>
                <p className="text-sm text-white/60 mt-2 flex-1">{s.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <div>
                    <div className="text-pink-brand text-lg">₹{Math.round(s.offer_price || s.price)}</div>
                    <div className="text-[11px] text-white/50 flex items-center gap-1"><Clock className="w-3 h-3" /> {s.duration_minutes} min</div>
                  </div>
                  <Link
                    to={`/booking?serviceId=${s.id}`}
                    data-testid={`book-service-${s.slug}`}
                    className="btn-primary rounded-full px-4 py-2 text-sm inline-flex items-center gap-1"
                  >
                    Book <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
