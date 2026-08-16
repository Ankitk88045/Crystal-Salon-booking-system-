import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";
import { Star } from "lucide-react";

export default function AdminReviews() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/reviews").then((r) => setItems(unwrap(r) || []));
  useEffect(() => { load(); }, []);

  const update = async (id, patch) => {
    await api.patch(`/admin/reviews/${id}`, patch); toast.success("Updated"); load();
  };

  return (
    <div>
      <h1 className="font-display text-3xl">Reviews</h1>
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {items.map((r) => (
          <div key={r.id} className="card-lux p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{r.customer_name}</div>
                <div className="text-white/50 text-xs">{r.service_name}</div>
              </div>
              <div className="flex gap-1 text-pink-brand">
                {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
              </div>
            </div>
            <p className="text-white/70 text-sm mt-3">{r.review_text}</p>
            <div className="mt-3 flex gap-2 text-xs">
              <span className="text-white/50">Status: {r.status}</span>
              <button onClick={() => update(r.id, { status: r.status === "APPROVED" ? "HIDDEN" : "APPROVED" })} className="text-pink-brand">
                {r.status === "APPROVED" ? "Hide" : "Approve"}
              </button>
              <button onClick={() => update(r.id, { is_featured: !r.is_featured })} className="text-pink-brand">
                {r.is_featured ? "Unfeature" : "Feature"}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-white/50">No reviews yet.</div>}
      </div>
    </div>
  );
}
