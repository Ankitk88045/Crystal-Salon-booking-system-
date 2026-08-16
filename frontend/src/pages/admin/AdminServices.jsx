import { useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { toast } from "sonner";
import { Plus, X, Pencil } from "lucide-react";

const EMPTY = {
  name: "", category_id: "", description: "", price: 1000, offer_price: null,
  duration_minutes: 60, buffer_minutes: 15, image_url: "", is_active: true,
  is_featured: false, display_order: 0, gender_policy: "female_only", terms: "",
};

export default function AdminServices() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => {
    api.get("/admin/services").then((r) => setItems(unwrap(r) || []));
    api.get("/admin/categories").then((r) => setCats(unwrap(r) || []));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, category_id: cats[0]?.id || "" }); };
  const openEdit = (s) => { setEditing(s.id); setForm({ ...EMPTY, ...s }); };

  const save = async () => {
    try {
      const payload = { ...form, price: Number(form.price), duration_minutes: Number(form.duration_minutes), buffer_minutes: Number(form.buffer_minutes), display_order: Number(form.display_order) };
      if (payload.offer_price === "" || payload.offer_price === null) payload.offer_price = null;
      else payload.offer_price = Number(payload.offer_price);
      if (editing === "new") await api.post("/admin/services", payload);
      else await api.patch(`/admin/services/${editing}`, payload);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => {
    if (!confirm("Disable this service?")) return;
    await api.delete(`/admin/services/${id}`); toast.success("Disabled"); load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Services</h1>
        <button data-testid="new-service-btn" onClick={openNew} className="btn-primary rounded-full px-4 py-2 text-sm inline-flex items-center gap-2"><Plus className="w-4 h-4" /> New</button>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {items.map((s) => (
          <div key={s.id} className={`card-lux p-4 flex gap-4 ${!s.is_active ? "opacity-50" : ""}`}>
            <img src={s.image_url} alt="" className="w-20 h-20 rounded-lg object-cover" />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/50">{s.category_name}</div>
                  <div className="font-medium">{s.name}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-2 hover:bg-white/5 rounded-lg"><Pencil className="w-4 h-4 text-white/60" /></button>
                  <button onClick={() => del(s.id)} className="p-2 hover:bg-white/5 rounded-lg"><X className="w-4 h-4 text-white/60" /></button>
                </div>
              </div>
              <div className="text-sm mt-1">₹{Math.round(s.price)} · {s.duration_minutes}min · {s.gender_policy}</div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="card-lux p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl mb-4">{editing === "new" ? "New service" : "Edit service"}</div>
            <div className="space-y-3 text-sm">
              <Field label="Name"><input className="input-lux" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Category">
                <select className="input-lux" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Description"><textarea className="input-lux min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price ₹"><input type="number" className="input-lux" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
                <Field label="Offer price ₹"><input type="number" className="input-lux" value={form.offer_price ?? ""} onChange={(e) => setForm({ ...form, offer_price: e.target.value })} /></Field>
                <Field label="Duration (min)"><input type="number" className="input-lux" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
                <Field label="Buffer (min)"><input type="number" className="input-lux" value={form.buffer_minutes} onChange={(e) => setForm({ ...form, buffer_minutes: e.target.value })} /></Field>
              </div>
              <Field label="Image URL"><input className="input-lux" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></Field>
              <Field label="Gender">
                <select className="input-lux" value={form.gender_policy} onChange={(e) => setForm({ ...form, gender_policy: e.target.value })}>
                  <option value="female_only">Female only</option>
                  <option value="all">Female & Male</option>
                </select>
              </Field>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-white/70"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
                <label className="flex items-center gap-2 text-white/70"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Featured</label>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="btn-ghost-brand rounded-lg px-4 py-2 flex-1">Cancel</button>
              <button data-testid="save-service" onClick={save} className="btn-primary rounded-lg px-4 py-2 flex-1">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-white/50">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
