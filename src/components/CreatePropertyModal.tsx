import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { genGpsLink } from "@/lib/utils";

type InitialData = Partial<{
  nom: string;
  type: string;
  localite: string;
  adresse_complete: string;
  capacite: string;
  avantio_code: string | null;
  proprietaire_nom: string;
  proprietaire_telephone: string;
  client: string;
  lien_gps: string;
}>;

export function CreatePropertyModal({ onClose, initialData }: { onClose: (result: { created: boolean; propertyId?: string; propertyName?: string }) => void; initialData?: InitialData }) {
  const [form, setForm] = useState<any>({
    nom: initialData?.nom ?? "",
    type: initialData?.type ?? "Villa",
    localite: initialData?.localite ?? "",
    adresse_complete: initialData?.adresse_complete ?? "",
    capacite: initialData?.capacite ?? "",
    avantio_code: initialData?.avantio_code ?? "",
    proprietaire_nom: initialData?.proprietaire_nom ?? "",
    proprietaire_telephone: initialData?.proprietaire_telephone ?? "",
    client: initialData?.client ?? "",
    lien_gps: initialData?.lien_gps ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function generateCode(): Promise<string> {
    const { data } = await supabase.from("properties").select("avantio_code").like("avantio_code", "HOMER-%");
    let max = 0;
    (data ?? []).forEach((r: any) => {
      const m = /^HOMER-(\d+)$/.exec(r.avantio_code ?? "");
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `HOMER-${String(max + 1).padStart(3, "0")}`;
  }

  async function save() {
    if (!form.nom || !form.type || !form.localite || !form.adresse_complete) {
      toast.error("Nom, Type, Localité et Adresse sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      const code = form.avantio_code?.trim() || (await generateCode());
      const lien_gps = form.lien_gps?.trim() || genGpsLink(form.adresse_complete);
      const { error } = await supabase.from("properties").insert({
        nom: form.nom.trim(),
        type: form.type,
        localite: form.localite.trim(),
        adresse_complete: form.adresse_complete.trim(),
        capacite: form.capacite ? Number(form.capacite) : null,
        avantio_code: code,
        proprietaire_nom: form.proprietaire_nom?.trim() || null,
        proprietaire_telephone: form.proprietaire_telephone?.trim() || null,
        client: form.client?.trim() || null,
        lien_gps: lien_gps || null,
        statut: "Actif",
      });
      if (error) throw error;
      toast.success(`Maison créée (${code})`);
      onClose(true);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouvelle maison</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <F label="Nom *" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} />
          <div>
            <label className="text-xs text-muted-foreground">Type *</label>
            <select className="w-full border rounded px-2 py-1.5 bg-background" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Villa</option><option>Maison</option><option>Appartement</option>
            </select>
          </div>
          <F label="Localité *" value={form.localite} onChange={(v) => setForm({ ...form, localite: v })} />
          <F label="Capacité" value={form.capacite} onChange={(v) => setForm({ ...form, capacite: v })} />
          <div className="col-span-2">
            <F label="Adresse complète *" value={form.adresse_complete} onChange={(v) => setForm({ ...form, adresse_complete: v })} />
          </div>
          <F label="Code Avantio (auto si vide)" value={form.avantio_code} onChange={(v) => setForm({ ...form, avantio_code: v })} />
          <F label="Client (ex: Auguste)" value={form.client} onChange={(v) => setForm({ ...form, client: v })} />
          <F label="Propriétaire (nom)" value={form.proprietaire_nom} onChange={(v) => setForm({ ...form, proprietaire_nom: v })} />
          <F label="Téléphone propriétaire" value={form.proprietaire_telephone} onChange={(v) => setForm({ ...form, proprietaire_telephone: v })} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
