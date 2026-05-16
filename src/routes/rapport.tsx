import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
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
  id: string;             // contractor_id|client
  contractor_id: string;
  contractor_nom: string;
  client: string;
  nb: Set<string>;
  v: number;
  p: number;
  heures: number;
  taux: number;
  rows: CleaningRow[];
};

type PropRow = { id: string; date: string; type_menage: string; equipe_noms: string; heures: number; cout: number };
type PropStat = { nom: string; nb: number; v: number; p: number; heures: number; rows: PropRow[] };

type ClientStat = { client: string; nb: number; v: number; p: number; heures: number; cout: number };

function RapportPage() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [vueFilter, setVueFilter] = useState<"tout" | "voyageur" | "proprietaire">("tout");
  const [clientFilter, setClientFilter] = useState<string>("tous");
  const [expandedEq, setExpandedEq] = useState<Set<string>>(new Set());
  const [expandedProp, setExpandedProp] = useState<Set<string>>(new Set());
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);

  const monthStart = `${annee}-${String(mois).padStart(2,"0")}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const monthEnd = `${annee}-${String(mois).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

  // On charge les ménages dont la date Avantio OU la date d'intervention d'au moins une équipe
  // tombe dans le mois. On élargit la fenêtre Avantio de ±15 jours pour capturer les cas où
  // l'équipe intervient le mois suivant/précédent.
  const wideStart = (() => {
    const d = new Date(annee, mois - 1, 1); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  })();
  const wideEnd = (() => {
    const d = new Date(annee, mois - 1, lastDay); d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  })();

  const { data: cleanings = [] } = useQuery({
    queryKey: ["rapport-cleanings", mois, annee],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select(`id, date_menage, type_menage, statut,
          property:property_id(nom, client),
          ccs:cleaning_contractors(contractor_id, ordre, date_intervention, heure_arrivee, heure_depart, contractor:contractor_id(nom, taux_horaire))`)
        .gte("date_menage", wideStart)
        .lte("date_menage", wideEnd);
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

  const clientsDispo = useMemo(() => {
    const set = new Set<string>();
    cleanings.forEach((c: any) => { if (c.property?.client) set.add(c.property.client); });
    return [...set].sort();
  }, [cleanings]);

  // Helpers
  const inMonth = (d: string | null | undefined) => !!d && d >= monthStart && d <= monthEnd;
  const effDate = (cc: any, c: any) => cc?.date_intervention ?? c.date_menage;

  // Filtre vue/client appliqué au niveau ménage (inchangé)
  const passesFilter = (c: any) => {
    if (vueFilter === "voyageur" && c.type_menage !== "voyageur" && c.type_menage !== "a_verifier") return false;
    if (vueFilter === "proprietaire" && c.type_menage !== "proprietaire") return false;
    const clientVal = c.property?.client ?? null;
    if (clientFilter === "homer" && clientVal) return false;
    if (clientFilter !== "tous" && clientFilter !== "homer" && clientVal !== clientFilter) return false;
    return true;
  };

  // Ménages "dans le mois" = au moins une intervention dans le mois, ou pas d'équipe et date_menage dans le mois.
  const cleaningsFiltered = cleanings.filter((c: any) => {
    if (!passesFilter(c)) return false;
    const ccs = c.ccs ?? [];
    if (ccs.length === 0) return inMonth(c.date_menage);
    return ccs.some((cc: any) => inMonth(effDate(cc, c)));
  });

  const overall = {
    total: cleaningsFiltered.length,
    voyageur: cleaningsFiltered.filter((c: any) => c.type_menage === "voyageur" || c.type_menage === "a_verifier").length,
    proprietaire: cleaningsFiltered.filter((c: any) => c.type_menage === "proprietaire").length,
    annule: cleaningsFiltered.filter((c: any) => c.statut === "annule").length,
    pretes: cleaningsFiltered.filter((c: any) => c.statut === "prete").length,
  };

  // Agrégations basées sur les interventions dont la date_intervention tombe dans le mois.
  const byContractorClient = new Map<string, Stat>();
  cleaningsFiltered.forEach((c: any) => {
    if (c.statut === "annule") return;
    const clientLabel = c.property?.client ?? "Homer";
    (c.ccs ?? []).forEach((cc: any) => {
      const d = effDate(cc, c);
      if (!inMonth(d)) return;
      const contractor = contractors.find((co: any) => co.id === cc.contractor_id);
      if (!contractor) return;
      const key = `${cc.contractor_id}|${clientLabel}`;
      let s = byContractorClient.get(key);
      if (!s) {
        s = {
          id: key,
          contractor_id: cc.contractor_id,
          contractor_nom: contractor.nom,
          client: clientLabel,
          nb: new Set(),
          v: 0, p: 0, heures: 0,
          taux: contractor.taux_horaire ?? 0,
          rows: [],
        };
        byContractorClient.set(key, s);
      }
      s.nb.add(c.id);
      if (c.type_menage === "proprietaire") s.p++; else s.v++;
      const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
      s.heures += h;
      s.rows.push({
        id: c.id,
        date: d,
        property_nom: c.property?.nom ?? "—",
        type_menage: c.type_menage,
        heures: h,
        cout: h * (s.taux ?? 0),
      });
    });
  });
  const byCList = [...byContractorClient.values()]
    .filter((s) => s.nb.size > 0)
    .sort((a, b) => a.contractor_nom.localeCompare(b.contractor_nom) || a.client.localeCompare(b.client));

  // Par maison : on regroupe par ménage (id) parmi ceux qui ont au moins 1 intervention dans le mois.
  // Heures/coût = somme des interventions du mois uniquement.
  const byProp = new Map<string, PropStat>();
  const propSeenIds = new Map<string, Set<string>>(); // nom -> set of cleaning ids déjà comptés
  cleaningsFiltered.forEach((c: any) => {
    if (c.statut === "annule") return;
    const nom = c.property?.nom ?? "—";
    const ccsInMonth = (c.ccs ?? []).filter((cc: any) => inMonth(effDate(cc, c)));
    if (ccsInMonth.length === 0 && (c.ccs ?? []).length > 0) return;
    const s: PropStat = byProp.get(nom) ?? { nom, nb: 0, v: 0, p: 0, heures: 0, rows: [] };
    const seen = propSeenIds.get(nom) ?? new Set<string>();
    if (!seen.has(c.id)) {
      s.nb++;
      if (c.type_menage === "proprietaire") s.p++; else s.v++;
      seen.add(c.id);
      propSeenIds.set(nom, seen);
    }
    const heuresMenage = ccsInMonth.reduce((acc: number, cc: any) => acc + hoursBetween(cc.heure_arrivee, cc.heure_depart), 0);
    s.heures += heuresMenage;
    const equipe_noms = ccsInMonth.map((cc: any) => cc.contractor?.nom).filter(Boolean).join(", ") || "—";
    const cout = ccsInMonth.reduce((acc: number, cc: any) => {
      const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
      return acc + h * (cc.contractor?.taux_horaire ?? 0);
    }, 0);
    // Date affichée = première intervention dans le mois (ou date_menage si pas de cc)
    const dateAff = ccsInMonth.length > 0
      ? ccsInMonth.map((cc: any) => effDate(cc, c)).sort()[0]
      : c.date_menage;
    s.rows.push({ id: c.id, date: dateAff, type_menage: c.type_menage, equipe_noms, heures: heuresMenage, cout });
    byProp.set(nom, s);
  });
  const byPropList = [...byProp.values()].sort((a,b) => b.nb - a.nb);

  // Par client : même logique (compter chaque ménage 1 fois, heures/coûts au prorata des interventions du mois)
  const byClient = new Map<string, ClientStat>();
  const clientSeenIds = new Map<string, Set<string>>();
  cleaningsFiltered.forEach((c: any) => {
    if (c.statut === "annule") return;
    const clientLabel = c.property?.client ?? "Homer";
    const ccsInMonth = (c.ccs ?? []).filter((cc: any) => inMonth(effDate(cc, c)));
    if (ccsInMonth.length === 0 && (c.ccs ?? []).length > 0) return;
    const s: ClientStat = byClient.get(clientLabel) ?? { client: clientLabel, nb: 0, v: 0, p: 0, heures: 0, cout: 0 };
    const seen = clientSeenIds.get(clientLabel) ?? new Set<string>();
    if (!seen.has(c.id)) {
      s.nb++;
      if (c.type_menage === "proprietaire") s.p++; else s.v++;
      seen.add(c.id);
      clientSeenIds.set(clientLabel, seen);
    }
    ccsInMonth.forEach((cc: any) => {
      const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
      s.heures += h;
      s.cout += h * (cc.contractor?.taux_horaire ?? 0);
    });
    byClient.set(clientLabel, s);
  });
  const byClientList = [...byClient.values()].sort((a, b) => b.nb - a.nb);

  function invoiceFor(contractorId: string, client: string) {
    return invoices.find((i: any) => i.contractor_id === contractorId && (i.client ?? "Homer") === client);
  }

  function toggleEq(id: string) {
    setExpandedEq(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleProp(nom: string) {
    setExpandedProp(prev => { const n = new Set(prev); n.has(nom) ? n.delete(nom) : n.add(nom); return n; });
  }

  async function toggleInvoiceValide(contractorId: string, client: string, calc: number, valide: boolean) {
    const existing = invoiceFor(contractorId, client);
    if (valide) {
      if (existing) {
        await supabase.from("monthly_invoices").update({ valide: true, montant_facture: existing.montant_facture ?? calc, client }).eq("id", existing.id);
      } else {
        await supabase.from("monthly_invoices").insert({ contractor_id: contractorId, mois, annee, montant_facture: calc, valide: true, client });
      }
    } else {
      if (existing) await supabase.from("monthly_invoices").delete().eq("id", existing.id);
    }
    refetchInv();
    toast.success(valide ? "Facture validée" : "Facture dévalidée");
  }

  async function updateInvoiceAmount(contractorId: string, client: string, val: string) {
    const montant = val === "" ? null : Number(val);
    const existing = invoiceFor(contractorId, client);
    if (!existing) return;
    await supabase.from("monthly_invoices").update({ montant_facture: montant }).eq("id", existing.id);
    refetchInv();
    setEditingInvoice(null);
  }

  const monthLabel = `${MOIS[mois-1]}_${annee}`;

  function exportEqSynthese() {
    const rows: (string|number)[][] = [["Équipe","Client","Nb ménages","Voyageur","Propriétaire","Heures","Taux €/h","Calculé €","Facturé €","Écart €"]];
    byCList.forEach(s => {
      const calc = s.heures * s.taux;
      const inv = invoiceFor(s.contractor_id, s.client);
      const isValide = !!inv?.valide;
      const fact = isValide ? (inv?.montant_facture ?? null) : null;
      const ecart = fact != null ? fact - calc : "";
      rows.push([s.contractor_nom, s.client, s.nb.size, s.v, s.p, s.heures.toFixed(2), s.taux, calc.toFixed(2), fact?.toFixed(2) ?? "", typeof ecart === "number" ? ecart.toFixed(2) : ""]);
    });
    downloadCsv(`Homer_Synthese_Equipes_${monthLabel}.csv`, rows);
  }

  function exportEqDetail() {
    const rows: (string|number)[][] = [["Équipe","Client","Date","Maison","Type","Heures","Coût €"]];
    byCList.forEach(s => {
      [...s.rows].sort((a,b) => a.date.localeCompare(b.date)).forEach(r => {
        rows.push([s.contractor_nom, s.client, formatFrDate(r.date), r.property_nom, r.type_menage, r.heures.toFixed(2), r.cout.toFixed(2)]);
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

  function exportClientSynthese() {
    const rows: (string|number)[][] = [["Client","Nb ménages","Voyageur","Propriétaire","Heures","Coût €"]];
    byClientList.forEach(s => rows.push([s.client, s.nb, s.v, s.p, s.heures.toFixed(2), s.cout.toFixed(2)]));
    downloadCsv(`Homer_Synthese_Clients_${monthLabel}.csv`, rows);
  }

  function exportClientDetail() {
    const rows: (string|number)[][] = [["Client","Date","Maison","Type","Équipe(s)","Heures","Coût €"]];
    cleaningsFiltered
      .filter((c: any) => c.statut !== "annule")
      .sort((a: any, b: any) => a.date_menage.localeCompare(b.date_menage))
      .forEach((c: any) => {
        const clientLabel = c.property?.client ?? "Homer";
        const equipes = (c.ccs ?? []).map((cc: any) => cc.contractor?.nom).filter(Boolean).join(", ") || "—";
        const heures = (c.ccs ?? []).reduce((acc: number, cc: any) => acc + hoursBetween(cc.heure_arrivee, cc.heure_depart), 0);
        const cout = (c.ccs ?? []).reduce((acc: number, cc: any) => {
          const h = hoursBetween(cc.heure_arrivee, cc.heure_depart);
          return acc + h * (cc.contractor?.taux_horaire ?? 0);
        }, 0);
        rows.push([clientLabel, formatFrDate(c.date_menage), c.property?.nom ?? "—", c.type_menage, equipes, heures.toFixed(2), cout.toFixed(2)]);
      });
    downloadCsv(`Homer_Detail_Clients_${monthLabel}.csv`, rows);
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
        <div>
          <label className="text-xs text-muted-foreground">🏢 Client</label>
          <select className="border rounded px-2 py-1.5 bg-background block" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="tous">Tous</option>
            <option value="homer">Homer (sans client)</option>
            {clientsDispo.map((c) => <option key={c} value={c}>{c}</option>)}
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
                <th className="p-2 text-left">Client</th>
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
                const inv = invoiceFor(s.contractor_id, s.client);
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
                      <td className="p-2 font-medium">{s.contractor_nom}</td>
                      <td className="p-2">{s.client}</td>
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
                          onChange={(e) => toggleInvoiceValide(s.contractor_id, s.client, calc, e.target.checked)}
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
                            onBlur={(e) => updateInvoiceAmount(s.contractor_id, s.client, e.target.value)}
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
                        <td colSpan={11} className="p-2">
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

      <section>
        <h2 className="text-sm font-semibold text-primary mb-2">Détail par client</h2>
        <div className="bg-card border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Client</th>
                <th className="p-2 text-right">Nb ménages</th>
                <th className="p-2 text-right">Voyageur</th>
                <th className="p-2 text-right">Propriétaire</th>
                <th className="p-2 text-right">Heures totales</th>
                <th className="p-2 text-right">Coût total</th>
              </tr>
            </thead>
            <tbody>
              {byClientList.map((s) => (
                <tr key={s.client} className="border-t">
                  <td className="p-2 font-medium">{s.client}</td>
                  <td className="p-2 text-right tabular-nums">{s.nb}</td>
                  <td className="p-2 text-right tabular-nums">{s.v}</td>
                  <td className="p-2 text-right tabular-nums">{s.p}</td>
                  <td className="p-2 text-right tabular-nums">{s.heures.toFixed(1)}</td>
                  <td className="p-2 text-right tabular-nums">{s.cout.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={exportClientSynthese}>📥 Export Synthèse</Button>
          <Button variant="outline" size="sm" onClick={exportClientDetail}>📥 Export Détaillé</Button>
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
