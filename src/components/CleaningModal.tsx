import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatFrDate } from "@/lib/time-utils";
import { genGpsLink } from "@/lib/utils";
import { Copy, MessageCircle, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export function CleaningModal({ cleaningId, onClose }: { cleaningId: string; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
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

  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors-active-modal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contractors")
        .select("id, nom, taux_horaire, statut_recrutement")
        .order("nom");
      return (data ?? []).filter((x) => x.statut_recrutement === "actif" || x.statut_recrutement === "saisonnier");
    },
  });

  useEffect(() => { if (c) setNotes((c as any).notes_homer ?? ""); }, [c]);

  if (!c) return null;
  const p = (c as any).property;
  const ccs: any[] = (c as any).ccs ?? [];

  async function refetchCleaning() {
    await qc.invalidateQueries({ queryKey: ["cleaning", cleaningId] });
    await qc.invalidateQueries({ queryKey: ["planning"] });
  }

  async function saveNotes() {
    await supabase.from("cleanings").update({ notes_homer: notes }).eq("id", cleaningId);
    await qc.invalidateQueries({ queryKey: ["cleaning", cleaningId] });
    toast.success("Consignes enregistrées");
  }

  async function updateCc(ccId: string, patch: any) {
    await supabase.from("cleaning_contractors").update(patch).eq("id", ccId);
    refetchCleaning();
  }

  async function removeCc(ccId: string) {
    await supabase.from("cleaning_contractors").delete().eq("id", ccId);
    refetchCleaning();
    toast.success("Équipe retirée");
  }

  async function addCc() {
    const maxOrdre = ccs.reduce((m: number, cc: any) => Math.max(m, cc.ordre ?? 0), 0);
    await supabase.from("cleaning_contractors").insert({
      cleaning_id: cleaningId,
      contractor_id: null as any,
      ordre: maxOrdre + 1,
      date_intervention: (c as any).date_menage,
    });
    refetchCleaning();
  }

  function normalizePhoneFr(raw: string | null | undefined): string {
    if (!raw) return "";
    let digits = raw.replace(/[^\d+]/g, "");
    digits = digits.replace(/^\+/, "");
    if (digits.startsWith("0")) digits = "33" + digits.slice(1);
    return digits;
  }

  function copyMessageFor(message: string, prenom: string) {
    navigator.clipboard.writeText(message);
    toast.success(`Message pour ${prenom} copié`);
  }
  async function openWaFor(message: string, telRaw: string, ccId: string) {
    const tel = normalizePhoneFr(telRaw);
    if (!tel) {
      toast.error("Numéro de téléphone invalide");
      return;
    }
    await supabase.from("cleaning_contractors").update({ notifie_whatsapp_at: new Date().toISOString() } as any).eq("id", ccId);
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    refetchCleaning();
  }

  async function annulerNotif(ccId: string) {
    await supabase.from("cleaning_contractors").update({ notifie_whatsapp_at: null } as any).eq("id", ccId);
    refetchCleaning();
    toast.success("Notification annulée");
  }

  function formatNotifDate(iso: string): string {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mn = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} à ${hh}:${mn}`;
  }

  const sortedCcs = [...ccs].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

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

          <section className="border rounded p-3 space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Équipes affectées</div>
            {sortedCcs.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Aucune équipe affectée pour l'instant</div>
            ) : (
              <div className="space-y-2">
                {sortedCcs.map((cc: any) => (
                  <div key={cc.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">Éq.{cc.ordre}</span>
                    <select
                      className="border rounded px-2 py-1 bg-background text-sm flex-1 min-w-[140px]"
                      value={cc.contractor_id ?? ""}
                      onChange={(e) => updateCc(cc.id, { contractor_id: e.target.value || null })}
                    >
                      <option value="">— Aucune —</option>
                      {contractors.map((co: any) => (
                        <option key={co.id} value={co.id}>{co.nom}</option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      className="h-8 text-sm"
                      style={{ minWidth: "140px" }}
                      value={cc.date_intervention ?? (c as any).date_menage}
                      onChange={(e) => updateCc(cc.id, { date_intervention: e.target.value || null })}
                      title="Date d'intervention de cette équipe"
                    />
                    <Input
                      type="time"
                      className="h-8 w-24 text-sm"
                      value={cc.heure_arrivee ?? ""}
                      onChange={(e) => updateCc(cc.id, { heure_arrivee: e.target.value || null })}
                      placeholder="Arr"
                    />
                    <Input
                      type="time"
                      className="h-8 w-24 text-sm"
                      value={cc.heure_depart ?? ""}
                      onChange={(e) => updateCc(cc.id, { heure_depart: e.target.value || null })}
                      placeholder="Dép"
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeCc(cc.id)} title="Retirer cette équipe">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {sortedCcs.length < 4 && (
              <Button size="sm" variant="outline" onClick={addCc}>
                <Plus className="h-3 w-3 mr-1" /> Ajouter une équipe
              </Button>
            )}
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1">Consignes ménage</div>
            <textarea
              className="w-full border rounded p-2 bg-background"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions pour l'équipe : matériel à apporter, demandes du client, points d'attention..."
            />
            <Button size="sm" className="mt-2" onClick={saveNotes}>Enregistrer les consignes</Button>
          </section>

          {(() => {
            const ccsWithContractor = ccs.filter((cc: any) => cc.contractor_id && cc.contractor);
            if (ccsWithContractor.length === 0) {
              return (
                <section className="border rounded p-3">
                  <div className="text-xs uppercase text-muted-foreground">Message WhatsApp</div>
                  <div className="text-sm text-muted-foreground italic mt-2">
                    Aucune équipe affectée à ce ménage. Affectez une équipe pour générer un message.
                  </div>
                </section>
              );
            }
            return (
              <section className="space-y-3">
                <div className="text-xs uppercase text-muted-foreground">Message WhatsApp</div>
                {[...ccsWithContractor]
                  .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
                  .map((cc: any) => {
                    const message = composeMessage(c, p, cc);
                    const prenom = cc.contractor?.nom?.split(" ")[0] ?? "";
                    const telRaw = cc.contractor?.telephone ?? "";
                    const telNormalized = normalizePhoneFr(telRaw);
                    const hasTel = telNormalized.length >= 11;
                    return (
                      <div key={cc.id} className="border rounded p-3 space-y-2">
                        <div className="text-xs font-semibold text-primary">
                          Pour {cc.contractor?.nom ?? "—"}
                        </div>
                        <pre className="text-xs whitespace-pre-wrap bg-secondary p-3 rounded">{message}</pre>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => copyMessageFor(message, prenom)}>
                            <Copy className="h-3 w-3 mr-1" /> Copier
                          </Button>
                          {hasTel ? (
                            <Button size="sm" onClick={() => openWaFor(message, telRaw, cc.id)}>
                              <MessageCircle className="h-3 w-3 mr-1" />
                              {cc.notifie_whatsapp_at ? "Renvoyer WhatsApp" : "Ouvrir WhatsApp"} {prenom}
                            </Button>
                          ) : (
                            <span className="text-xs text-destructive flex items-center gap-1">
                              ⚠️ Téléphone manquant pour {prenom} — Ajouter dans la page Équipes
                            </span>
                          )}
                          {cc.notifie_whatsapp_at && (
                            <>
                              <span className="text-xs text-success font-medium">
                                ✓ Notifiée le {formatNotifDate(cc.notifie_whatsapp_at)}
                              </span>
                              <button
                                type="button"
                                onClick={() => annulerNotif(cc.id)}
                                className="text-xs text-muted-foreground hover:text-foreground underline"
                              >
                                ↺ Annuler la notification
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </section>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function composeMessage(c: any, p: any, cc: any): string {
  const contractor = cc?.contractor;
  const prenom = contractor?.nom?.split(" ")[0] ?? "";
  const date = formatFrDate(cc?.date_intervention ?? c.date_menage);
  const lienGps = p?.lien_gps || genGpsLink(p?.adresse_complete) || "";
  const arr = cc?.heure_arrivee;
  const dep = cc?.heure_depart;
  const horaire = (arr && dep) ? `${arr} → ${dep}` : "à confirmer";
  const consignes = (c.notes_homer ?? "").trim();

  // Champs d'accès : affichés seulement si renseignés
  const codePorte = (p?.code_porte ?? "").trim();
  const codeAlarme = (p?.code_alarme ?? "").trim();
  const boiteACles = (p?.boite_a_cles ?? "").trim();
  const wifi = (p?.wifi ?? "").trim();

  // Bloc 1 : identité + date
  const bloc1 = [
    `Bonjour ${prenom},`,
    `Le ${date} : ménage ${p?.nom ?? ""}`,
  ];

  // Bloc 2 : localisation
  const bloc2 = [
    `Adresse : ${p?.adresse_complete ?? ""}`,
    lienGps ? `📍 GPS : ${lienGps}` : "",
  ].filter(Boolean);

  // Bloc 3 : accès (chaque ligne seulement si renseignée)
  const bloc3 = [
    codePorte ? `Code porte : ${codePorte}` : "",
    codeAlarme ? `Code alarme : ${codeAlarme}` : "",
    boiteACles ? `Boîte à clés : ${boiteACles}` : "",
    wifi ? `Wifi : ${wifi}` : "",
  ].filter(Boolean);

  // Bloc 4 : détails du ménage
  const bloc4 = [
    `Horaire prévu : ${horaire}`,
    `Particularités : ${p?.particularites || "RAS"}`,
    consignes ? `📋 Consignes : ${consignes}` : "",
  ].filter(Boolean);

  const blocFin = [`Merci de me confirmer ton arrivée et ton départ.`];

  // Assembler les blocs non vides, séparés par une ligne vide
  return [bloc1, bloc2, bloc3, bloc4, blocFin]
    .filter((bloc) => bloc.length > 0)
    .map((bloc) => bloc.join("\n"))
    .join("\n\n");
}
