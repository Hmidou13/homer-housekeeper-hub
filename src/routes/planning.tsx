import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CleaningModal } from "@/components/CleaningModal";
import { CreateCleaningModal } from "@/components/CreateCleaningModal";
import { formatFrDate } from "@/lib/time-utils";
import { Pencil } from "lucide-react";
import { validerBlocageEnProprietaire, annulerBlocage } from "@/lib/blocage-actions";
import { marquerVu, marquerTousVus } from "@/lib/nouveau-actions";

export const Route = createFileRoute("/planning")({ component: () => <RequireAuth><PlanningPage /></RequireAuth> });

const TYPE_LABEL: Record<string, { emoji: string; label: string; cls: string }> = {
  voyageur: { emoji: "🛏️", label: "Voyageur", cls: "" },
  proprietaire: { emoji: "🏠", label: "Propriétaire", cls: "bg-type-owner" },
  bloque_a_arbitrer: { emoji: "🔒", label: "Bloqué", cls: "bg-type-blocked" },
  a_verifier: { emoji: "⚠️", label: "À vérifier", cls: "bg-type-verify" },
};

function todayIso() { return new Date().toISOString().slice(0,10); }
function inDaysIso(n: number) { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

const FILTERS_KEY = "homer_planning_filters";

function loadFilters() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "null"); } catch { return null; }
}

type Intervention = {
  cleaning_id: string;
  cleaning: any;
  cc: any | null;
  date_menage: string;
  property: any;
  type_menage: string;
  ordre: number;
  total_in_group: number;
  is_add_button: boolean;
};

function blockRowClass(iv: Intervention, isNewGroup: boolean): string {
  return [
    "border-l-4",
    iv.total_in_group > 1 ? "border-l-primary/40 bg-muted/30" : "border-l-transparent",
    isNewGroup ? "border-t-2 border-t-border" : "border-t border-t-border/20",
  ].join(" ");
}

function PlanningPage() {
  const saved = loadFilters();
  const [from, setFrom] = useState(saved?.from ?? todayIso());
  const [to, setTo] = useState(saved?.to ?? inDaysIso(7));
  const [equipeFilter, setEquipeFilter] = useState<string>(saved?.equipe ?? "");
  const [typeFilter, setTypeFilter] = useState<string>(saved?.type ?? "");
  const [statutFilter, setStatutFilter] = useState<string>(saved?.statut ?? "");
  const [search, setSearch] = useState(saved?.search ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCleaningId, setEditCleaningId] = useState<string | null>(null);
  const qc = useQueryClient();

  useMemo(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ from, to, equipe: equipeFilter, type: typeFilter, statut: statutFilter, search }));
  }, [from, to, equipeFilter, typeFilter, statutFilter, search]);

  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors-active"],
    queryFn: async () => {
      const { data } = await supabase.from("contractors").select("id, nom, taux_horaire, statut_recrutement, telephone").order("nom");
      return (data ?? []).filter((c) => c.statut_recrutement === "actif" || c.statut_recrutement === "saisonnier");
    },
  });

  const { data: cleanings = [], refetch } = useQuery({
    queryKey: ["planning", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select(`id, date_menage, type_menage, statut, cas_serre, observation, notes_homer, nb_adultes_voyageurs, equipe_avantio_info, avantio_reservation_no, heure_certification, validation_requise,
          property:property_id(id, nom, client, adresse_complete, code_porte, code_alarme, wifi, particularites, proprietaire_telephone),
          ccs:cleaning_contractors(id, ordre, contractor_id, date_intervention, heure_arrivee, heure_depart, notifie_whatsapp_at, contractor:contractor_id(id, nom, telephone))`)
        .gte("date_menage", from)
        .lte("date_menage", to)
        .order("date_menage");
      return data ?? [];
    },
  });

  const cleaningsFiltered = cleanings.filter((c: any) => {
    if (typeFilter && c.type_menage !== typeFilter) return false;
    if (statutFilter && c.statut !== statutFilter) return false;
    if (search && !c.property?.nom?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const interventions: Intervention[] = useMemo(() => {
    const out: Intervention[] = [];
    cleaningsFiltered.forEach((c: any) => {
      const ccs = (c.ccs ?? []).slice().sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0));
      const realCount = ccs.length;
      if (realCount === 0) {
        out.push({
          cleaning_id: c.id, cleaning: c, cc: null, date_menage: c.date_menage,
          property: c.property, type_menage: c.type_menage, ordre: 0, total_in_group: 1,
          is_add_button: false,
        });
      } else {
        ccs.forEach((cc: any, idx: number) => {
          out.push({
            cleaning_id: c.id, cleaning: c, cc, date_menage: c.date_menage,
            property: c.property, type_menage: c.type_menage,
            ordre: cc.ordre ?? (idx + 1), total_in_group: realCount,
            is_add_button: false,
          });
        });
      }
      if (realCount < 4) {
        const maxOrdre = ccs.reduce((m: number, cc: any) => Math.max(m, cc.ordre ?? 0), 0);
        out.push({
          cleaning_id: c.id, cleaning: c, cc: null, date_menage: c.date_menage,
          property: c.property, type_menage: c.type_menage,
          ordre: maxOrdre + 1, total_in_group: realCount,
          is_add_button: true,
        });
      }
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanings, typeFilter, statutFilter, search]);

  const interventionsFiltered = useMemo(() => {
    if (!equipeFilter) return interventions;
    const matchingCleaningIds = new Set(
      interventions
        .filter((iv) => !iv.is_add_button && iv.cc?.contractor_id === equipeFilter)
        .map((iv) => iv.cleaning_id)
    );
    return interventions.filter((iv) => {
      if (iv.is_add_button) return matchingCleaningIds.has(iv.cleaning_id);
      return iv.cc?.contractor_id === equipeFilter;
    });
  }, [interventions, equipeFilter]);

  async function addEquipeToCleaning(cleaning_id: string, ordre: number, dateMenage: string) {
    await supabase.from("cleaning_contractors").insert({
      cleaning_id, contractor_id: null as any, ordre, date_intervention: dateMenage,
    });
    refetch();
  }

  async function updateDateIntervention(ccId: string, date: string) {
    await supabase.from("cleaning_contractors")
      .update({ date_intervention: date || null })
      .eq("id", ccId);
    refetch();
  }

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="bg-card border rounded-lg p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
        <div>
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Équipe</label>
          <select className="w-full border rounded px-2 py-1.5 bg-background" value={equipeFilter} onChange={(e) => setEquipeFilter(e.target.value)}>
            <option value="">Toutes</option>
            {contractors.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <select className="w-full border rounded px-2 py-1.5 bg-background" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="voyageur">🛏️ Voyageur</option>
            <option value="proprietaire">🏠 Propriétaire</option>
            <option value="bloque_a_arbitrer">🔒 Bloqué</option>
            <option value="a_verifier">⚠️ À vérifier</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Statut</label>
          <select className="w-full border rounded px-2 py-1.5 bg-background" value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="planifie">Planifié</option>
            <option value="en_cours">En cours</option>
            <option value="prete">Prête</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Maison</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ Nouveau ménage</Button>
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2 text-left" style={{ minWidth: "110px" }}>Date</th>
              <th className="p-2 text-left" style={{ minWidth: "180px" }}>Maison</th>
              <th className="p-2 text-left" style={{ minWidth: "130px" }}>Type</th>
              <th className="p-2 text-left" style={{ minWidth: "180px" }}>Équipe</th>
              <th className="p-2 text-left" style={{ minWidth: "100px" }}>Arr</th>
              <th className="p-2 text-left" style={{ minWidth: "100px" }}>Dép</th>
              <th className="p-2 text-left" style={{ minWidth: "130px" }}>Statut</th>
              <th className="p-2" style={{ width: "50px" }}></th>
            </tr>
          </thead>
          <tbody>
            {interventionsFiltered.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Aucun ménage sur cette plage.</td></tr>
            )}
            {interventionsFiltered.map((iv, idx) => {
              const prev = idx > 0 ? interventionsFiltered[idx - 1] : null;
              const isNewGroup = !prev || prev.cleaning_id !== iv.cleaning_id;
              const typeInfo = TYPE_LABEL[iv.type_menage] ?? TYPE_LABEL.voyageur;

              if (iv.is_add_button) {
                return (
                  <tr
                    key={`${iv.cleaning_id}-add`}
                    className={`hover:bg-muted/40 ${blockRowClass(iv, isNewGroup)}`}
                  >
                    <td className="p-2"></td>
                    <td className="p-2"></td>
                    <td className="p-2"></td>
                    <td className="p-2" colSpan={3}>
                      <button
                        onClick={() => addEquipeToCleaning(iv.cleaning_id, iv.ordre, iv.date_menage)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Ajouter une équipe
                      </button>
                    </td>
                    <td className="p-2"></td>
                    <td className="p-2"></td>
                  </tr>
                );
              }

              return (
                <tr
                  key={`${iv.cleaning_id}-${iv.ordre}`}
                  className={`hover:bg-muted/40 ${blockRowClass(iv, isNewGroup)}`}
                >
                  <td className="p-2 whitespace-nowrap">
                    {iv.cc ? (
                      <div className="flex flex-col gap-0.5">
                        {isNewGroup && (
                          <span className="text-[10px] text-muted-foreground">Avantio : {formatFrDate(iv.date_menage)}</span>
                        )}
                        <input
                          type="date"
                          className="border rounded px-2 py-1 bg-background text-sm"
                          value={iv.cc.date_intervention ?? iv.date_menage}
                          onChange={(e) => updateDateIntervention(iv.cc.id, e.target.value)}
                        />
                      </div>
                    ) : (
                      <span>{formatFrDate(iv.date_menage)}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {isNewGroup ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button className="font-medium hover:underline text-left" onClick={() => setOpenId(iv.cleaning_id)}>
                          {iv.property?.nom}
                        </button>
                        {iv.cleaning.cas_serre && <span title="Cas serré" className="text-warning">⚠️</span>}
                        {iv.property?.client && (
                          <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground whitespace-nowrap">
                            🏢 {iv.property.client}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs italic">↳ même ménage</span>
                    )}
                  </td>
                  <td className="p-2">
                    {isNewGroup && (
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap inline-block w-fit ${typeInfo.cls}`}>
                          {typeInfo.emoji} {typeInfo.label}
                        </span>
                        {iv.cleaning.validation_requise && (
                          <>
                            <span className="px-2 py-0.5 rounded text-xs whitespace-nowrap inline-block w-fit bg-warning/20 text-warning-foreground border border-warning/40">
                              🔔 À valider
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                onClick={async () => { if (await validerBlocageEnProprietaire(iv.cleaning_id)) refetch(); }}
                              >
                                ✓ Propriétaire
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-2"
                                onClick={async () => { if (await annulerBlocage(iv.cleaning_id)) refetch(); }}
                              >
                                ✗ Annuler
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-2">
                    <EquipeSelector cleaning={iv.cleaning} cc={iv.cc} ordre={iv.ordre} contractors={contractors} onChange={refetch} />
                  </td>
                  <td className="p-2">
                    <HeureInput cc={iv.cc} field="heure_arrivee" onChange={refetch} disabled={!iv.cc} />
                  </td>
                  <td className="p-2">
                    <HeureInput cc={iv.cc} field="heure_depart" onChange={refetch} disabled={!iv.cc} />
                  </td>
                  <td className="p-2">
                    {isNewGroup && (
                      <div className="flex flex-col gap-1 items-start">
                        <StatutSelector cleaning={iv.cleaning} onChange={refetch} />
                        <NotifBadge ccs={iv.cleaning.ccs ?? []} />
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {isNewGroup && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditCleaningId(iv.cleaning_id)} title="Modifier le ménage">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(iv.cleaning_id)}>⋯</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && (
        <CleaningModal
          cleaningId={openId}
          onClose={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["planning"] }); }}
        />
      )}
      {createOpen && (
        <CreateCleaningModal
          onClose={(created) => { setCreateOpen(false); if (created) refetch(); }}
        />
      )}
      {editCleaningId && (
        <CreateCleaningModal
          editCleaningId={editCleaningId}
          onClose={(saved) => { setEditCleaningId(null); if (saved) refetch(); }}
        />
      )}
    </div>
  );
}

function EquipeSelector({ cleaning, cc, ordre, contractors, onChange }: any) {
  async function handleChange(contractor_id: string) {
    if (cc) {
      if (!contractor_id) {
        await supabase.from("cleaning_contractors").delete().eq("id", cc.id);
      } else {
        await supabase.from("cleaning_contractors").update({ contractor_id }).eq("id", cc.id);
      }
    } else if (contractor_id) {
      await supabase.from("cleaning_contractors").insert({
        cleaning_id: cleaning.id, contractor_id, ordre: ordre || 1,
      });
    }
    onChange();
  }
  return (
    <select
      className="border rounded px-2 py-1 bg-background text-sm w-full"
      style={{ minWidth: "160px" }}
      value={cc?.contractor_id ?? ""}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="">— Aucune —</option>
      {contractors.map((c: any) => (
        <option key={c.id} value={c.id}>{c.nom}</option>
      ))}
    </select>
  );
}

function HeureInput({ cc, field, onChange, disabled }: any) {
  const [val, setVal] = useState<string>(cc?.[field] ?? "");
  useEffect(() => { setVal(cc?.[field] ?? ""); }, [cc, field]);
  async function save() {
    if (!cc) return;
    if (val === (cc[field] ?? "")) return;
    await supabase.from("cleaning_contractors").update({ [field]: val || null } as any).eq("id", cc.id);
    onChange();
  }
  return (
    <Input
      type="time"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      disabled={disabled}
      className="h-8 text-sm"
      style={{ minWidth: "90px" }}
    />
  );
}

function StatutSelector({ cleaning, onChange }: any) {
  async function setStatut(statut: string) {
    const update: any = { statut };
    if (statut === "prete") update.heure_certification = new Date().toISOString();
    if (cleaning.statut === "prete" && statut !== "prete") update.heure_certification = null;
    await supabase.from("cleanings").update(update).eq("id", cleaning.id);
    onChange();
  }
  return (
    <select
      className="border rounded px-2 py-1 bg-background text-sm"
      style={{ minWidth: "120px" }}
      value={cleaning.statut}
      onChange={(e) => setStatut(e.target.value)}
    >
      <option value="planifie">Planifié</option>
      <option value="en_cours">En cours</option>
      <option value="prete">Prête</option>
      <option value="annule">Annulé</option>
    </select>
  );
}

function NotifBadge({ ccs }: { ccs: any[] }) {
  const affectees = (ccs ?? []).filter((cc) => cc.contractor_id);
  const total = affectees.length;
  if (total === 0) return null;
  const notifiees = affectees.filter((cc) => cc.notifie_whatsapp_at).length;
  if (notifiees === 0) {
    return <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap bg-muted text-muted-foreground">📨 Non notifié</span>;
  }
  if (notifiees < total) {
    return <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap text-white" style={{ backgroundColor: "#E67E22" }}>📨 {notifiees}/{total} notifiées</span>;
  }
  return <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap text-white" style={{ backgroundColor: "#27AE60" }}>📨 Notifié</span>;
}
