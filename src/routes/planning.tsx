import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CleaningModal } from "@/components/CleaningModal";
import { combineDateAndTime, formatFrDate, nowHHMM, timeFromTs } from "@/lib/time-utils";
import { Clock } from "lucide-react";

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

function PlanningPage() {
  const saved = loadFilters();
  const [from, setFrom] = useState(saved?.from ?? todayIso());
  const [to, setTo] = useState(saved?.to ?? inDaysIso(7));
  const [equipeFilter, setEquipeFilter] = useState<string>(saved?.equipe ?? "");
  const [typeFilter, setTypeFilter] = useState<string>(saved?.type ?? "");
  const [statutFilter, setStatutFilter] = useState<string>(saved?.statut ?? "");
  const [search, setSearch] = useState(saved?.search ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();

  // persist filters
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
        .select(`id, date_menage, type_menage, statut, cas_serre, observation, notes_homer, nb_adultes_voyageurs, equipe_avantio_info, avantio_reservation_no, heure_certification,
          property:property_id(id, nom, adresse_complete, code_porte, code_alarme, wifi, particularites, proprietaire_telephone),
          ccs:cleaning_contractors(id, ordre, contractor_id, heure_arrivee, heure_depart, contractor:contractor_id(id, nom, telephone))`)
        .gte("date_menage", from)
        .lte("date_menage", to)
        .order("date_menage");
      return data ?? [];
    },
  });

  const filtered = cleanings.filter((c: any) => {
    if (typeFilter && c.type_menage !== typeFilter) return false;
    if (statutFilter && c.statut !== statutFilter) return false;
    if (equipeFilter && !c.ccs.some((cc: any) => cc.contractor_id === equipeFilter)) return false;
    if (search && !c.property?.nom?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function setEquipe(cleaning: any, ordre: 1 | 2, contractorId: string | null) {
    const existing = cleaning.ccs.find((c: any) => c.ordre === ordre);
    if (!contractorId) {
      if (existing) await supabase.from("cleaning_contractors").delete().eq("id", existing.id);
    } else if (existing) {
      await supabase.from("cleaning_contractors").update({ contractor_id: contractorId }).eq("id", existing.id);
    } else {
      await supabase.from("cleaning_contractors").insert({ cleaning_id: cleaning.id, contractor_id: contractorId, ordre });
    }
    refetch();
  }

  async function setHeure(cleaning: any, ccId: string, field: "heure_arrivee" | "heure_depart", hhmm: string) {
    const ts = hhmm ? combineDateAndTime(cleaning.date_menage, hhmm) : null;
    const update: any = { [field]: ts };
    await supabase.from("cleaning_contractors").update(update).eq("id", ccId);
    refetch();
  }

  async function setStatut(cleaning: any, statut: string) {
    const update: any = { statut };
    if (statut === "prete") update.heure_certification = new Date().toISOString();
    if (cleaning.statut === "prete" && statut !== "prete") update.heure_certification = null;
    await supabase.from("cleanings").update(update).eq("id", cleaning.id);
    refetch();
  }

  async function setType(cleaning: any, t: string) {
    await supabase.from("cleanings").update({ type_menage: t }).eq("id", cleaning.id);
    refetch();
  }

  function rowBg(statut: string) {
    if (statut === "en_cours") return "bg-row-running";
    if (statut === "prete") return "bg-row-ready";
    if (statut === "annule") return "bg-row-cancelled line-through";
    return "";
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

      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Maison</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Éq. 1</th>
              <th className="text-left p-2">Éq. 2</th>
              <th className="text-left p-2">Arr1</th>
              <th className="text-left p-2">Dép1</th>
              <th className="text-left p-2">Arr2</th>
              <th className="text-left p-2">Dép2</th>
              <th className="text-left p-2">Statut</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Aucun ménage sur cette plage.</td></tr>
            )}
            {filtered.map((c: any) => {
              const eq1 = c.ccs.find((x: any) => x.ordre === 1);
              const eq2 = c.ccs.find((x: any) => x.ordre === 2);
              const t = TYPE_LABEL[c.type_menage] ?? TYPE_LABEL.voyageur;
              const noEq1 = !eq1 && c.statut !== "annule";
              return (
                <tr key={c.id} className={`border-t ${rowBg(c.statut)}`}>
                  <td className="p-2 whitespace-nowrap">{formatFrDate(c.date_menage)}</td>
                  <td className="p-2 font-medium">
                    <button className="hover:underline text-left" onClick={() => setOpenId(c.id)}>
                      {c.property?.nom}
                    </button>
                    {c.cas_serre && <span title="Cas serré" className="ml-1.5 text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">⚠️</span>}
                  </td>
                  <td className={`p-2 ${t.cls}`}>
                    <select className="bg-transparent text-xs" value={c.type_menage} onChange={(e) => setType(c, e.target.value)}>
                      <option value="voyageur">🛏️ Voyageur</option>
                      <option value="proprietaire">🏠 Propriétaire</option>
                      <option value="bloque_a_arbitrer">🔒 Bloqué</option>
                      <option value="a_verifier">⚠️ À vérifier</option>
                    </select>
                  </td>
                  <td className={`p-2 ${noEq1 ? "bg-row-cancelled/60" : ""}`}>
                    <EquipeSelect contractors={contractors} value={eq1?.contractor_id ?? ""} onChange={(v) => setEquipe(c, 1, v || null)} />
                  </td>
                  <td className="p-2">
                    <EquipeSelect contractors={contractors} value={eq2?.contractor_id ?? ""} onChange={(v) => setEquipe(c, 2, v || null)} />
                  </td>
                  <td className="p-2"><TimeCell disabled={!eq1} value={timeFromTs(eq1?.heure_arrivee)} onChange={(v) => eq1 && setHeure(c, eq1.id, "heure_arrivee", v)} /></td>
                  <td className="p-2"><TimeCell disabled={!eq1} value={timeFromTs(eq1?.heure_depart)} onChange={(v) => eq1 && setHeure(c, eq1.id, "heure_depart", v)} /></td>
                  <td className="p-2"><TimeCell disabled={!eq2} value={timeFromTs(eq2?.heure_arrivee)} onChange={(v) => eq2 && setHeure(c, eq2.id, "heure_arrivee", v)} /></td>
                  <td className="p-2"><TimeCell disabled={!eq2} value={timeFromTs(eq2?.heure_depart)} onChange={(v) => eq2 && setHeure(c, eq2.id, "heure_depart", v)} /></td>
                  <td className="p-2">
                    <select className="bg-transparent text-xs" value={c.statut} onChange={(e) => setStatut(c, e.target.value)}>
                      <option value="planifie">Planifié</option>
                      <option value="en_cours">En cours</option>
                      <option value="prete">✅ Prête</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </td>
                  <td className="p-2"><button onClick={() => setOpenId(c.id)} className="text-muted-foreground hover:text-foreground">⋯</button></td>
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
    </div>
  );
}

function EquipeSelect({ contractors, value, onChange }: { contractors: any[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="bg-transparent text-xs w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {contractors.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
    </select>
  );
}

function TimeCell({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="time"
        disabled={disabled}
        className="bg-transparent text-xs w-20 disabled:opacity-30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {!disabled && (
        <button type="button" onClick={() => onChange(nowHHMM())} title="Maintenant" className="text-muted-foreground hover:text-foreground">
          <Clock className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
