import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreatePropertyModal } from "@/components/CreatePropertyModal";
import { CreateCleaningModal } from "@/components/CreateCleaningModal";
import { toast } from "sonner";

export const Route = createFileRoute("/maisons")({ component: () => <RequireAuth><MaisonsPage /></RequireAuth> });

function MaisonsPage() {
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: properties = [], refetch } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*, equipe:equipe_habituelle_id(nom)").order("nom");
      return data ?? [];
    },
  });

  const clients = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p: any) => { if (p.client) set.add(p.client); });
    return [...set].sort();
  }, [properties]);

  const filtered = properties.filter((p: any) => {
    if (clientFilter === "__homer__" && p.client) return false;
    if (clientFilter && clientFilter !== "__homer__" && p.client !== clientFilter) return false;
    const q = search.toLowerCase();
    if (q && !(p.nom?.toLowerCase().includes(q) || p.localite?.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Rechercher une maison ou une localité…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          <select className="border rounded px-2 py-1.5 bg-background text-sm" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">Tous les clients</option>
            <option value="__homer__">Homer (sans client)</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Nouvelle maison</Button>
      </div>
      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Maison</th>
              <th className="p-2 text-left">Localité</th>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-right">Cap.</th>
              <th className="p-2 text-left">Adresse</th>
              <th className="p-2 text-left">Drive</th>
              <th className="p-2 text-left">Codes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const accessOk = p.code_porte || p.boite_a_cles;
              const codesOk = p.adresse_complete && accessOk;
              return (
                <tr key={p.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setOpenId(p.id)}>
                  <td className="p-2 font-medium">{p.nom}</td>
                  <td className="p-2">{p.localite}</td>
                  <td className="p-2">{p.client ?? "—"}</td>
                  <td className="p-2">{p.type}</td>
                  <td className="p-2 text-right">{p.capacite}</td>
                  <td className="p-2 max-w-[260px]">
                    <span className="block truncate" title={p.adresse_complete ?? ""}>{p.adresse_complete ?? "—"}</span>
                  </td>
                  <td className="p-2">
                    {p.lien_drive_photos ? (
                      <a
                        href={p.lien_drive_photos}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        📁 Ouvrir
                      </a>
                    ) : "—"}
                  </td>
                  <td className="p-2">{codesOk ? "✅" : <span className="text-warning">⚠️ incomplet</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openId && <PropertyModal id={openId} onClose={() => { setOpenId(null); refetch(); }} />}
      {createOpen && <CreatePropertyModal onClose={(created) => { setCreateOpen(false); if (created) refetch(); }} />}
    </div>
  );
}

function PropertyModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { data: property } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      return data;
    },
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors-actifs-modal"],
    queryFn: async () => {
      const { data } = await supabase.from("contractors").select("id, nom, statut_recrutement").order("nom");
      return (data ?? []).filter((c: any) => c.statut_recrutement === "actif" || c.statut_recrutement === "saisonnier");
    },
  });
  const [form, setForm] = useState<any>(null);
  if (property && !form) setForm(property);

  async function save() {
    const { error } = await supabase.from("properties").update({
      proprietaire_telephone: form.proprietaire_telephone,
      code_porte: form.code_porte,
      code_alarme: form.code_alarme,
      wifi: form.wifi,
      boite_a_cles: form.boite_a_cles,
      equipe_habituelle_id: form.equipe_habituelle_id || null,
      duree_standard_h: form.duree_standard_h ? Number(form.duree_standard_h) : null,
      nb_personnes_recommande: form.nb_personnes_recommande ? Number(form.nb_personnes_recommande) : null,
      particularites: form.particularites,
      lien_drive_photos: form.lien_drive_photos,
      notes: form.notes,
      client: form.client?.trim() || null,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Enregistré"); onClose(); }
  }

  if (!form) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.nom}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <section className="bg-secondary rounded p-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">Synchronisé Avantio (lecture seule)</div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Code :</span> {form.avantio_code}</div>
              <div><span className="text-muted-foreground">Type :</span> {form.type}</div>
              <div><span className="text-muted-foreground">Capacité :</span> {form.capacite}</div>
              <div><span className="text-muted-foreground">Localité :</span> {form.localite}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Adresse :</span> {form.adresse_complete}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Propriétaire :</span> {form.proprietaire_nom}</div>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-3">
            <Field label="Client" value={form.client} onChange={(v) => setForm({ ...form, client: v })} />
            <Field label="Téléphone propriétaire" value={form.proprietaire_telephone} onChange={(v) => setForm({ ...form, proprietaire_telephone: v })} />
            <Field label="Code porte" value={form.code_porte} onChange={(v) => setForm({ ...form, code_porte: v })} />
            <Field label="Code alarme" value={form.code_alarme} onChange={(v) => setForm({ ...form, code_alarme: v })} />
            <Field label="Wifi" value={form.wifi} onChange={(v) => setForm({ ...form, wifi: v })} />
            <Field label="Boîte à clés" value={form.boite_a_cles} onChange={(v) => setForm({ ...form, boite_a_cles: v })} />
            <div>
              <label className="text-xs text-muted-foreground">Équipe habituelle</label>
              <select className="w-full border rounded px-2 py-1.5 bg-background" value={form.equipe_habituelle_id ?? ""} onChange={(e) => setForm({ ...form, equipe_habituelle_id: e.target.value })}>
                <option value="">—</option>
                {contractors.map((c: any) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <Field label="Durée standard (h)" value={form.duree_standard_h ?? ""} onChange={(v) => setForm({ ...form, duree_standard_h: v })} />
            <Field label="Nb personnes recommandé" value={form.nb_personnes_recommande ?? ""} onChange={(v) => setForm({ ...form, nb_personnes_recommande: v })} />
            <Field label="Lien Drive photos" value={form.lien_drive_photos} onChange={(v) => setForm({ ...form, lien_drive_photos: v })} />
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Particularités</label>
              <textarea className="w-full border rounded px-2 py-1.5 bg-background" rows={2} value={form.particularites ?? ""} onChange={(e) => setForm({ ...form, particularites: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea className="w-full border rounded px-2 py-1.5 bg-background" rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </section>
          <div className="flex gap-2">
            <Button onClick={save}>Enregistrer</Button>
            <Button variant="outline" onClick={() => setScheduleOpen(true)}>+ Programmer un ménage</Button>
          </div>
        </div>
        {scheduleOpen && <CreateCleaningModal lockedPropertyId={id} onClose={() => setScheduleOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
