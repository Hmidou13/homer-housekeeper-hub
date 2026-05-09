import { createFileRoute } from "@tanstack/react-router";
import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { hoursBetween, formatFrDate } from "@/lib/time-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/rapport")({ component: () => <RequireAuth><RapportPage /></RequireAuth> });

const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type CleaningRow = {
  id: string;
  date: string;
  property_nom: string;
  type_menage: string;
  heures: number;
  cout: number;
};

type Stat = {
  id: string;
  nom: string;
  nb: Set<string>;
  v: number;
  p: number;
  heures: number;
  taux: number;
  rows: CleaningRow[];
};

type PropRow = { id: string; date: string; type_menage: string; equipe_noms: string; heures: number; cout: number };
type PropStat = { nom: string; nb: number; v: number; p: number; heures: number; rows: PropRow[] };

function RapportPage() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [vueFilter, setVueFilter] = useState<"tout" | "voyageur" | "proprietaire">("tout");
  const [expandedEq, setExpandedEq] = useState<Set<string>>(new Set());
  const [expandedProp, setExpandedProp] = useState<Set<string>>(new Set());
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);

  const monthStart = `${annee}-${String(mois).padStart(2,"0")}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const monthEnd = `${annee}-${String(mois).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

  const { data: cleanings = [] } = useQuery({
    queryKey: ["rapport-cleanings", mois, annee],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select(`id, date_menage, type_menage, statut,
          property:property_id(nom),
          ccs:cleaning_contractors(contractor_id, heure_arrivee, heure_depart, contractor:contractor_id(nom, taux_horaire))`)
        .gte("date_menage", monthStart)
        .lte("date_menage", monthEnd);
      return data ?? [];
    },
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ["all-contractors-rapport"],
    queryFn: async () => (await supabase.from("contractors").select("id, nom, taux_horaire")).data ?? [],
  });

  const { data: invoices = [], refetch: refetchInv } = useQuery({
    queryKey: ["invoices", mois, annee],
    queryFn: async () => (await supabase.from("monthly_invoices").select("*").eq("mois", mois).eq("annee", annee)).data ?? [],
  });

  const cleaningsFiltered = cleanings.filter((c: any) => {
    if (vueFilter === "voyageur") return c.type_menage === "voyageur" || c.type_menage === "a_verifier";
    if (vueFilter === "proprietaire") return c.type_menage === "proprietaire";
    return true;
  });

  const overall = {
    total: cleaningsFiltered.length,
    voyageur: cleaningsFiltered.filter((c: any) => c.type_menage === "voyageur" || c.type_menage === "a_verifier").length,
    proprietaire: cleaningsFiltered.filter((c: any) => c.type_menage === "proprietaire").length,
    annule: cleaningsFiltered.filter((c: any) => c.statut === "annule").length,
    pretes: cleaningsFiltered.filter((c: any) => c.statut === "prete").length,
  };

  const byContractor = new Map<string, Stat>();
  contractors.forEach((c: any) => byContractor.set(c.id, { id: c.id, nom: c.nom, nb: new Set(), v: 0, p: 0, heures: 0, taux: c.taux_horaire ?? 0, rows: [] }));

  cleaningsFiltered.forEach((c: any) => {
    if (c.statut === "annule") return;
    c.ccs?.forEach((cc: any) => {
      const s = byContractor.get(cc.contractor_id);
      if (!s) return;
      s.nb.add(c.id);
      if (c.type_menage === "proprietaire") s.p++; else s.v++;
      const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
      s.heures += h;
      s.rows.push({
        id: c.id,
        date: c.date_menage,
        property_nom: c.property?.nom ?? "—",
        type_menage: c.type_menage,
        heures: h,
        cout: h * (s.taux ?? 0),
      });
    });
  });
  const byCList = [...byContractor.values()].filter((s) => s.nb.size > 0).sort((a,b) => b.nb.size - a.nb.size);

  const byProp = new Map<string, PropStat>();
  cleaningsFiltered.forEach((c: any) => {
    if (c.statut === "annule") return;
    const nom = c.property?.nom ?? "—";
    const s = byProp.get(nom) ?? { nom, nb: 0, v: 0, p: 0, heures: 0, rows: [] };
    s.nb++;
    if (c.type_menage === "proprietaire") s.p++; else s.v++;
    const heuresMenage = (c.ccs ?? []).reduce((acc: number, cc: any) => acc + hoursBetween(cc.heure_arrivee, cc.heure_depart), 0);
    s.heures += heuresMenage;
    const equipe_noms = (c.ccs ?? []).map((cc: any) => cc.contractor?.nom).filter(Boolean).join(", ") || "—";
    const cout = (c.ccs ?? []).reduce((acc: number, cc: any) => {
      const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
      return acc + h * (cc.contractor?.taux_horaire ?? 0);
    }, 0);
    s.rows.push({ id: c.id, date: c.date_menage, type_menage: c.type_menage, equipe_noms, heures: heuresMenage, cout });
    byProp.set(nom, s);
  });
  const byPropList = [...byProp.values()].sort((a,b) => b.nb - a.nb);

  function invoiceFor(contractorId: string) {
    return invoices.find((i: any) => i.contractor_id === contractorId);
  }

  function toggleEq(id: string) {
    setExpandedEq(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleProp(nom: string) {
    setExpandedProp(prev => { const n = new Set(prev); n.has(nom) ? n.delete(nom) : n.add(nom); return n; });
  }

  async function toggleInvoiceValide(contractorId: string, calc: number, valide: boolean) {
    const existing = invoiceFor(contractorId);
    if (valide) {
      if (existing) {
        await supabase.from("monthly_invoices").update({ valide: true, montant_facture: existing.montant_facture ?? calc }).eq("id", existing.id);
      } else {
        await supabase.from("monthly_invoices").insert({ contractor_id: contractorId, mois, annee, montant_facture: calc, valide: true });
      }
    } else {
      if (existing) await supabase.from("monthly_invoices").delete().eq("id", existing.id);
    }
    refetchInv();
    toast.success(valide ? "Facture validée" : "Facture dévalidée");
  }

  async function updateInvoiceAmount(contractorId: string, val: string) {
    const montant = val === "" ? null : Number(val);
    const existing = invoiceFor(contractorId);
    if (!existing) return;
    await supabase.from("monthly_invoices").update({ montant_facture: montant }).eq("id", existing.id);
    refetchInv();
    setEditingInvoice(null);
  }

  const monthLabel = `${MOIS[mois-1]}_${annee}`;

  function exportEqSynthese() {
    const rows: (string|number)[][] = [["Équipe","Nb ménages","Voyageur","Propriétaire","Heures","Taux €/h","Calculé €","Facturé €","Écart €"]];
    byCList.forEach(s => {
      const calc = s.heures * s.taux;
      const inv = invoiceFor(s.id);
      const isValide = !!inv?.valide;
      const fact = isValide ? (inv?.montant_facture ?? null) : null;
      const ecart = fact != null ? fact - calc : "";
      rows.push([s.nom, s.nb.size, s.v, s.p, s.heures.toFixed(2), s.taux, calc.toFixed(2), fact?.toFixed(2) ?? "", typeof ecart === "number" ? ecart.toFixed(2) : ""]);
    });
    downloadCsv(`Homer_Synthese_Equipes_${monthLabel}.csv`, rows);
  }

  function exportEqDetail() {
    const rows: (string|number)[][] = [["Équipe","Date","Maison","Type","Heures","Coût €"]];
    byCList.forEach(s => {
      [...s.rows].sort((a,b) => a.date.localeCompare(b.date)).forEach(r => {
        rows.push([s.nom, formatFrDate(r.date), r.property_nom, r.type_menage, r.heures.toFixed(2), r.cout.toFixed(2)]);
      });
    });
    downloadCsv(`Homer_Detail_Equipes_${monthLabel}.csv`, rows);
  }

  function exportPropSynthese() {
    const rows: (string|number)[][] = [["Maison","Nb ménages","Voyageur","Propriétaire","Heures totales"]];
    byPropList.forEach(s => rows.push([s.nom, s.nb, s.v, s.p, s.heures.toFixed(2)]));
    downloadCsv(`Homer_Synthese_Maisons_${monthLabel}.csv`, rows);
  }

  function exportPropDetail() {
    const rows: (string|number)[][] = [["Maison","Date","Type","Équipe(s)","Heures","Coût €"]];
    byPropList.forEach(s => {
      [...s.rows].sort((a,b) => a.date.localeCompare(b.date)).forEach(r => {
        rows.push([s.nom, formatFrDate(r.date), r.type_menage, r.equipe_noms, r.heures.toFixed(2), r.cout.toFixed(2)]);
      });
    });
    downloadCsv(`Homer_Detail_Maisons_${monthLabel}.csv`, rows);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">Mois</label>
          <select className="border rounded px-2 py-1.5 bg-background block" value={mois} onChange={(e) => setMois(Number(e.target.value))}>
            {MOIS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Année</label>
          <select className="border rounded px-2 py-1.5 bg-background block" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
            {[annee-1, annee, annee+1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">🎯 Vue</label>
          <select className="border rounded px-2 py-1.5 bg-background block" value={vueFilter} onChange={(e) => setVueFilter(e.target.value as any)}>
            <option value="tout">Tout</option>
            <option value="voyageur">🛏️ Voyageur uniquement</option>
            <option value="proprietaire">🏠 Propriétaire uniquement</option>
          </select>
        </div>
      </div>

      <section className="bg-card border rounded-lg p-5 grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total ménages" v={overall.total} />
        <Stat label="🛏️ Voyageur" v={overall.voyageur} />
        <Stat label="🏠 Propriétaire" v={overall.proprietaire} />
        <Stat label="✅ Certifiés Prête" v={overall.pretes} />
        <Stat label="Annulés" v={overall.annule} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-primary mb-2">Détail par équipe</h2>
        <div className="bg-card border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2 text-left">Équipe</th>
                <th className="p-2 text-right">Nb</th>
                <th className="p-2 text-right">V</th>
                <th className="p-2 text-right">P</th>
                <th className="p-2 text-right">Heures</th>
                <th className="p-2 text-right">€/h</th>
                <th className="p-2 text-right">Calculé</th>
                <th className="p-2 text-center">✓</th>
                <th className="p-2 text-right">Facturé</th>
                <th className="p-2 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {byCList.map((s) => {
                const calc = s.heures * s.taux;
                const inv = invoiceFor(s.id);
                const isValide = !!inv?.valide;
                const fact = inv?.montant_facture ?? null;
                const ecart = isValide && fact != null ? fact - calc : null;
                const ecartCls =
                  ecart == null ? "" :
                  ecart >= 0 ? "text-success" :
                  Math.abs(ecart) > 0.05 * calc ? "text-destructive" :
                  "text-foreground";
                const isOpen = expandedEq.has(s.id);
                const isEditing = editingInvoice === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-t">
                      <td className="p-2 text-center">
                        <button onClick={() => toggleEq(s.id)} className="text-muted-foreground hover:text-foreground" title={isOpen ? "Replier" : "Déplier"}>
                          {isOpen ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="p-2 font-medium">{s.nom}</td>
                      <td className="p-2 text-right tabular-nums">{s.nb.size}</td>
                      <td className="p-2 text-right tabular-nums">{s.v}</td>
                      <td className="p-2 text-right tabular-nums">{s.p}</td>
                      <td className="p-2 text-right tabular-nums">{s.heures.toFixed(1)}</td>
                      <td className="p-2 text-right tabular-nums">{s.taux}</td>
                      <td className="p-2 text-right tabular-nums">{calc.toFixed(2)} €</td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isValide}
                          onChange={(e) => toggleInvoiceValide(s.id, calc, e.target.checked)}
                          className="h-4 w-4 cursor-pointer"
                          title={isValide ? "Facture validée" : "Cocher quand la facture est reçue"}
                        />
                      </td>
                      <td className="p-2 text-right">
                        {!isValide ? (
                          <span className="text-muted-foreground italic tabular-nums">{calc.toFixed(2)} €</span>
                        ) : isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            autoFocus
                            defaultValue={fact ?? calc}
                            className="h-7 w-24 ml-auto text-right"
                            onBlur={(e) => updateInvoiceAmount(s.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <span className="font-semibold tabular-nums">{(fact ?? calc).toFixed(2)} €</span>
                            <button onClick={() => setEditingInvoice(s.id)} className="text-muted-foreground hover:text-foreground text-xs" title="Modifier">✎</button>
                          </span>
                        )}
                      </td>
                      <td className={`p-2 text-right tabular-nums ${ecartCls}`}>
                        {ecart != null ? `${ecart.toFixed(2)} €` : "—"}
                      </td>
                    </tr>
                    {isOpen && s.rows.length > 0 && (
                      <tr className="bg-muted/30">
                        <td></td>
                        <td colSpan={10} className="p-2">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="p-1 text-left">Date</th>
                                <th className="p-1 text-left">Maison</th>
                                <th className="p-1 text-left">Type</th>
                                <th className="p-1 text-right">Heures</th>
                                <th className="p-1 text-right">Coût</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...s.rows].sort((a,b) => a.date.localeCompare(b.date)).map((r) => (
                                <tr key={r.id} className="border-t border-border/50">
                                  <td className="p-1">{formatFrDate(r.date)}</td>
                                  <td className="p-1">{r.property_nom}</td>
                                  <td className="p-1">{r.type_menage === "proprietaire" ? "🏠" : r.type_menage === "a_verifier" ? "⚠️" : "🛏️"}</td>
                                  <td className="p-1 text-right tabular-nums">{r.heures.toFixed(1)}</td>
                                  <td className="p-1 text-right tabular-nums">{r.cout.toFixed(2)} €</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={exportEqSynthese}>📥 Export Synthèse</Button>
          <Button variant="outline" size="sm" onClick={exportEqDetail}>📥 Export Détaillé</Button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-primary mb-2">Détail par maison</h2>
        <div className="bg-card border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2 text-left">Maison</th>
                <th className="p-2 text-right">Nb</th>
                <th className="p-2 text-right">Voyageur</th>
                <th className="p-2 text-right">Propriétaire</th>
                <th className="p-2 text-right">Heures totales</th>
              </tr>
            </thead>
            <tbody>
              {byPropList.map((s) => {
                const isOpen = expandedProp.has(s.nom);
                return (
                  <Fragment key={s.nom}>
                    <tr className="border-t">
                      <td className="p-2 text-center">
                        <button onClick={() => toggleProp(s.nom)} className="text-muted-foreground hover:text-foreground" title={isOpen ? "Replier" : "Déplier"}>
                          {isOpen ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="p-2 font-medium">{s.nom}</td>
                      <td className="p-2 text-right tabular-nums">{s.nb}</td>
                      <td className="p-2 text-right tabular-nums">{s.v}</td>
                      <td className="p-2 text-right tabular-nums">{s.p}</td>
                      <td className="p-2 text-right tabular-nums">{s.heures.toFixed(1)}</td>
                    </tr>
                    {isOpen && s.rows.length > 0 && (
                      <tr className="bg-muted/30">
                        <td></td>
                        <td colSpan={5} className="p-2">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="p-1 text-left">Date</th>
                                <th className="p-1 text-left">Type</th>
                                <th className="p-1 text-left">Équipe(s)</th>
                                <th className="p-1 text-right">Heures</th>
                                <th className="p-1 text-right">Coût</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...s.rows].sort((a,b) => a.date.localeCompare(b.date)).map((r) => (
                                <tr key={r.id} className="border-t border-border/50">
                                  <td className="p-1">{formatFrDate(r.date)}</td>
                                  <td className="p-1">{r.type_menage === "proprietaire" ? "🏠" : r.type_menage === "a_verifier" ? "⚠️" : "🛏️"}</td>
                                  <td className="p-1">{r.equipe_noms}</td>
                                  <td className="p-1 text-right tabular-nums">{r.heures.toFixed(1)}</td>
                                  <td className="p-1 text-right tabular-nums">{r.cout.toFixed(2)} €</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={exportPropSynthese}>📥 Export Synthèse</Button>
          <Button variant="outline" size="sm" onClick={exportPropDetail}>📥 Export Détaillé</Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{v}</div>
    </div>
  );
}
