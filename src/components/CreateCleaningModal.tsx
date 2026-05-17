import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function CreateCleaningModal({
  onClose,
  lockedPropertyId,
  editCleaningId,
}: {
  onClose: (saved?: boolean) => void;
  lockedPropertyId?: string;
  editCleaningId?: string;
}) {
  const isEdit = !!editCleaningId;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    date_menage: today,
    property_id: lockedPropertyId ?? "",
    type_menage: "voyageur",
    eq: ["", "", "", ""],
    cas_serre: false,
    nb_adultes_voyageurs: "",
    observation: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ["all-properties-create-cleaning"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, nom").eq("statut", "Actif").order("nom");
      return data ?? [];
    },
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors-create-cleaning"],
    queryFn: async () => {
      const { data } = await supabase.from("contractors").select("id, nom, statut_recrutement").order("nom");
      return (data ?? []).filter((c: any) => c.statut_recrutement === "actif" || c.statut_recrutement === "saisonnier");
    },
  });

  const { data: editData } = useQuery({
    queryKey: ["edit-cleaning", editCleaningId],
    queryFn: async () => {
      if (!editCleaningId) return null;
      const { data } = await supabase
        .from("cleanings")
        .select("id, date_menage, property_id, type_menage, cas_serre, nb_adultes_voyageurs, observation, ccs:cleaning_contractors(contractor_id, ordre)")
        .eq("id", editCleaningId)
        .single();
      return data;
    },
    enabled: !!editCleaningId,
  });

  useEffect(() => { if (lockedPropertyId && !isEdit) setForm((f: any) => ({ ...f, property_id: lockedPropertyId })); }, [lockedPropertyId, isEdit]);

  useEffect(() => {
    if (editData) {
      const eq = ["", "", "", ""];
      ((editData as any).ccs ?? [])
        .slice()
        .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
        .forEach((cc: any, idx: number) => {
          if (idx < 4) eq[idx] = cc.contractor_id ?? "";
        });
      setForm({
        date_menage: (editData as any).date_menage,
        property_id: (editData as any).property_id,
        type_menage: (editData as any).type_menage,
        eq,
        cas_serre: !!(editData as any).cas_serre,
        nb_adultes_voyageurs: (editData as any).nb_adultes_voyageurs ?? "",
        observation: (editData as any).observation ?? "",
      });
    }
  }, [editData]);

  async function save() {
    if (!form.date_menage || !form.property_id || !form.type_menage) {
      toast.error("Date, Maison et Type sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("cleanings").update({
          date_menage: form.date_menage,
          property_id: form.property_id,
          type_menage: form.type_menage,
          cas_serre: !!form.cas_serre,
          nb_adultes_voyageurs: form.nb_adultes_voyageurs ? Number(form.nb_adultes_voyageurs) : null,
          observation: form.observation?.trim() || null,
        }).eq("id", editCleaningId!);
        if (error) throw error;

        const { data: existingCcs } = await supabase
          .from("cleaning_contractors")
          .select("id, ordre, date_intervention")
          .eq("cleaning_id", editCleaningId!);

        for (let i = 0; i < 4; i++) {
          const ordre = i + 1;
          const contractorId = form.eq[i] || null;
          const existing = (existingCcs ?? []).find((cc: any) => cc.ordre === ordre);
          if (contractorId && existing) {
            await supabase.from("cleaning_contractors")
              .update({ contractor_id: contractorId })
              .eq("id", existing.id);
          } else if (contractorId && !existing) {
            await supabase.from("cleaning_contractors")
              .insert({ cleaning_id: editCleaningId!, contractor_id: contractorId, ordre, date_intervention: form.date_menage });
          } else if (!contractorId && existing) {
            await supabase.from("cleaning_contractors").delete().eq("id", existing.id);
          }
        }
        toast.success("Ménage modifié");
        onClose(true);
      } else {
        const { data: created, error } = await supabase.from("cleanings").insert({
          date_menage: form.date_menage,
          property_id: form.property_id,
          type_menage: form.type_menage,
          statut: "planifie",
          avantio_source: "manuel",
          cas_serre: !!form.cas_serre,
          nb_adultes_voyageurs: form.nb_adultes_voyageurs ? Number(form.nb_adultes_voyageurs) : null,
          observation: form.observation?.trim() || null,
        }).select("id").single();
        if (error) throw error;
        const ccsRows = form.eq
          .map((id: string, idx: number) => id ? { cleaning_id: created.id, contractor_id: id, ordre: idx + 1, date_intervention: form.date_menage } : null)
          .filter(Boolean) as any[];
        if (ccsRows.length) {
          const { error: e2 } = await supabase.from("cleaning_contractors").insert(ccsRows);
          if (e2) throw e2;
        }
        toast.success("Ménage créé");
        onClose(true);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Modifier le ménage" : "Nouveau ménage"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Date *</label>
            <Input type="date" value={form.date_menage} onChange={(e) => setForm({ ...form, date_menage: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Maison *</label>
            <select
              disabled={!!lockedPropertyId}
              className="w-full border rounded px-2 py-1.5 bg-background disabled:opacity-60"
              value={form.property_id}
              onChange={(e) => setForm({ ...form, property_id: e.target.value })}
            >
              <option value="">—</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Type *</label>
            <select className="w-full border rounded px-2 py-1.5 bg-background" value={form.type_menage} onChange={(e) => setForm({ ...form, type_menage: e.target.value })}>
              <option value="voyageur">🛏️ Voyageur</option>
              <option value="proprietaire">🏠 Propriétaire</option>
              <option value="bloque_a_arbitrer">🔒 Bloqué à arbitrer</option>
              <option value="a_verifier">⚠️ À vérifier</option>
            </select>
          </div>
          {[0,1,2,3].map((i) => (
            <div key={i}>
              <label className="text-xs text-muted-foreground">Équipe {i+1}</label>
              <select className="w-full border rounded px-2 py-1.5 bg-background" value={form.eq[i]} onChange={(e) => {
                const eq = [...form.eq]; eq[i] = e.target.value; setForm({ ...form, eq });
              }}>
                <option value="">—</option>
                {contractors.map((c: any) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground">Adultes prévus</label>
            <Input type="number" value={form.nb_adultes_voyageurs} onChange={(e) => setForm({ ...form, nb_adultes_voyageurs: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={form.cas_serre} onChange={(e) => setForm({ ...form, cas_serre: e.target.checked })} />
            <span>Cas serré ?</span>
          </label>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Observation</label>
            <textarea className="w-full border rounded px-2 py-1.5 bg-background" rows={2} value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1 italic">Note interne au bureau — non transmise aux femmes de ménage.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
