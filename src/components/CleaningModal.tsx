import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatFrDate } from "@/lib/time-utils";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function CleaningModal({ cleaningId, onClose }: { cleaningId: string; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const { data: c } = useQuery({
    queryKey: ["cleaning", cleaningId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select(`*, property:property_id(*), ccs:cleaning_contractors(*, contractor:contractor_id(*))`)
        .eq("id", cleaningId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => { if (c) setNotes((c as any).notes_homer ?? ""); }, [c]);

  if (!c) return null;
  const p = (c as any).property;
  const ccs = (c as any).ccs ?? [];
  const eq1 = ccs.find((x: any) => x.ordre === 1);

  const message = composeMessage(c, p, eq1?.contractor);

  async function saveNotes() {
    await supabase.from("cleanings").update({ notes_homer: notes }).eq("id", cleaningId);
    toast.success("Notes enregistrées");
  }

  function copyMsg() { navigator.clipboard.writeText(message); toast.success("Message copié"); }
  function openWa() {
    const tel = (eq1?.contractor?.telephone ?? "").replace(/[^\d]/g, "");
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p?.nom} — {formatFrDate((c as any).date_menage)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <section className="bg-secondary rounded p-3 space-y-1">
            <div className="text-xs uppercase text-muted-foreground">Infos importées</div>
            <div>Source : {(c as any).avantio_source ?? "—"} · N° {(c as any).avantio_reservation_no}</div>
            <div>Adultes : {(c as any).nb_adultes_voyageurs ?? "—"} · Cas serré : {(c as any).cas_serre ? "Oui" : "Non"}</div>
            <div>Équipe Avantio : {(c as any).equipe_avantio_info || "—"}</div>
            {(c as any).observation && <div>Observation : {(c as any).observation}</div>}
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1">Notes Homer</div>
            <textarea
              className="w-full border rounded p-2 bg-background"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button size="sm" className="mt-2" onClick={saveNotes}>Enregistrer notes</Button>
          </section>

          <section className="border rounded p-3 space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Message WhatsApp</div>
            <pre className="text-xs whitespace-pre-wrap bg-secondary p-3 rounded">{message}</pre>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyMsg}><Copy className="h-3 w-3 mr-1" /> Copier</Button>
              <Button size="sm" onClick={openWa}><MessageCircle className="h-3 w-3 mr-1" /> Ouvrir WhatsApp</Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function composeMessage(c: any, p: any, contractor: any): string {
  const prenom = contractor?.nom?.split(" ")[0] ?? "";
  const date = formatFrDate(c.date_menage);
  const typeLabel = c.type_menage === "proprietaire" ? "Propriétaire" : "Voyageur";
  return [
    `Bonjour ${prenom},`,
    `Le ${date} : ménage ${p?.nom ?? ""}`,
    `Adresse : ${p?.adresse_complete ?? ""}`,
    `Code porte : ${p?.code_porte || "à venir"}`,
    `Code alarme : ${p?.code_alarme || "à venir"}`,
    `Wifi : ${p?.wifi || "à venir"}`,
    `Type : ${typeLabel}`,
    `Adultes prévus : ${c.nb_adultes_voyageurs ?? "—"}`,
    `Particularités : ${p?.particularites || "RAS"}`,
    `Merci de me confirmer ton arrivée et ton départ.`,
  ].join("\n");
}
