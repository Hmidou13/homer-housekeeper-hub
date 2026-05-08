import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/equipes")({ component: () => <RequireAuth><EquipesPage /></RequireAuth> });

function inDaysIso(n: number) { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function todayIso() { return new Date().toISOString().slice(0,10); }

function EquipesPage() {
  const [showCandidates, setShowCandidates] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: contractors = [], refetch } = useQuery({
    queryKey: ["all-contractors"],
    queryFn: async () => {
      const { data } = await supabase.from("contractors").select("*").order("nom");
      return data ?? [];
    },
  });

  const { data: ccs = [] } = useQuery({
    queryKey: ["ccs-7j"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleaning_contractors")
        .select("contractor_id, cleaning:cleaning_id(date_menage, statut)");
      const today = todayIso(); const in7 = inDaysIso(7);
      return (data ?? []).filter((c: any) => c.cleaning && c.cleaning.date_menage >= today && c.cleaning.date_menage <= in7 && c.cleaning.statut !== "annule");
    },
  });

  const counts = new Map<string, number>();
  ccs.forEach((c: any) => counts.set(c.contractor_id, (counts.get(c.contractor_id) ?? 0) + 1));

  const list = contractors.filter((c: any) => showCandidates || c.statut_recrutement !== "candidat");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showCandidates} onChange={(e) => setShowCandidates(e.target.checked)} />
          Afficher les candidates
        </label>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3 w-3 mr-1" /> Nouvelle équipe</Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Nom</th>
              <th className="p-2 text-left">Statut</th>
              <th className="p-2 text-right">€/h</th>
              <th className="p-2 text-left">Téléphone</th>
              <th className="p-2 text-right">7j</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-medium">{c.nom}</td>
                <td className="p-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded ${c.statut_recrutement === "actif" ? "bg-success/15 text-success" : c.statut_recrutement === "saisonnier" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                    {c.statut_recrutement}
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">{c.taux_horaire ?? "—"}</td>
                <td className="p-2">{c.telephone ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">{counts.get(c.id) ?? 0}</td>
                <td className="p-2 text-right"><button onClick={() => setEditId(c.id)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editId || creating) && (
        <ContractorModal
          id={editId}
          onClose={() => { setEditId(null); setCreating(false); refetch(); }}
        />
      )}
    </div>
  );
}

function ContractorModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: existing } = useQuery({
    queryKey: ["contractor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("contractors").select("*").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const [form, setForm] = useState<any>({ nom: "", taux_horaire: 25, statut_recrutement: "actif", telephone: "", couleur: "#3498db" });
  if (id && existing && form.nom === "") setForm(existing);

  async function save() {
    if (!form.nom) { toast.error("Nom requis"); return; }
    const payload = {
      nom: form.nom,
      taux_horaire: form.taux_horaire ? Number(form.taux_horaire) : null,
      statut_recrutement: form.statut_recrutement,
      telephone: form.telephone || null,
      email: form.email || null,
      couleur: form.couleur || "#3498db",
      notes_internes: form.notes_internes || null,
    };
    const { error } = id
      ? await supabase.from("contractors").update(payload).eq("id", id)
      : await supabase.from("contractors").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Enregistré"); onClose(); }
  }

  async function remove() {
    if (!id) return;
    if (!confirm("Supprimer cette équipe ?")) return;
    const { error } = await supabase.from("contractors").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimé"); onClose(); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{id ? "Modifier" : "Nouvelle équipe"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.nom ?? ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">€/h</label><Input type="number" value={form.taux_horaire ?? ""} onChange={(e) => setForm({ ...form, taux_horaire: e.target.value })} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Statut</label>
              <select className="w-full border rounded px-2 py-1.5 bg-background" value={form.statut_recrutement ?? "actif"} onChange={(e) => setForm({ ...form, statut_recrutement: e.target.value })}>
                <option value="actif">actif</option>
                <option value="saisonnier">saisonnier</option>
                <option value="candidat">candidat</option>
              </select>
            </div>
          </div>
          <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.telephone ?? ""} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="+33..." /></div>
          <div><label className="text-xs text-muted-foreground">Notes internes</label><textarea className="w-full border rounded px-2 py-1.5 bg-background" rows={2} value={form.notes_internes ?? ""} onChange={(e) => setForm({ ...form, notes_internes: e.target.value })} /></div>
          <div className="flex gap-2 justify-between">
            <Button onClick={save}>Enregistrer</Button>
            {id && <Button variant="destructive" onClick={remove}>Supprimer</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
