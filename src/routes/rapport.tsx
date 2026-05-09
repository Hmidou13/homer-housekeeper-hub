import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { hoursBetween } from "@/lib/time-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/rapport")({ component: () => <RequireAuth><RapportPage /></RequireAuth> });

const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function RapportPage() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());

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

  const overall = {
    total: cleanings.length,
    voyageur: cleanings.filter((c: any) => c.type_menage === "voyageur" || c.type_menage === "a_verifier").length,
    proprietaire: cleanings.filter((c: any) => c.type_menage === "proprietaire").length,
    annule: cleanings.filter((c: any) => c.statut === "annule").length,
    pretes: cleanings.filter((c: any) => c.statut === "prete").length,
  };

  // Par équipe
  type Stat = { id: string; nom: string; nb: Set<string>; v: number; p: number; heures: number; taux: number };
  const byContractor = new Map<string, Stat>();
  contractors.forEach((c: any) => byContractor.set(c.id, { id: c.id, nom: c.nom, nb: new Set(), v: 0, p: 0, heures: 0, taux: c.taux_horaire ?? 0 }));

  cleanings.forEach((c: any) => {
    if (c.statut === "annule") return;
    c.ccs?.forEach((cc: any) => {
      const s = byContractor.get(cc.contractor_id);
      if (!s) return;
      s.nb.add(c.id);
      if (c.type_menage === "proprietaire") s.p++; else s.v++;
      s.heures += hoursBetween(cc.heure_arrivee, cc.heure_depart);
    });
  });
  const byCList = [...byContractor.values()].filter((s) => s.nb.size > 0).sort((a,b) => b.nb.size - a.nb.size);

  // Par maison
  const byProp = new Map<string, { nom: string; nb: number; v: number; p: number; heures: number }>();
  cleanings.forEach((c: any) => {
    if (c.statut === "annule") return;
    const nom = c.property?.nom ?? "—";
    const s = byProp.get(nom) ?? { nom, nb: 0, v: 0, p: 0, heures: 0 };
    s.nb++;
    if (c.type_menage === "proprietaire") s.p++; else s.v++;
    s.heures += (c.ccs ?? []).reduce((acc: number, cc: any) => acc + hoursBetween(cc.heure_arrivee, cc.heure_depart), 0);
    byProp.set(nom, s);
  });
  const byPropList = [...byProp.values()].sort((a,b) => b.nb - a.nb);

  function invoiceFor(contractorId: string) {
    return invoices.find((i: any) => i.contractor_id === contractorId);
  }

  async function toggleInvoiceValide(contractorId: string, calc: number, valide: boolean) {
    const existing = invoiceFor(contractorId);
    if (valide) {
      if (existing) {
        await supabase.from("monthly_invoices")
          .update({ valide: true, montant_facture: existing.montant_facture ?? calc })
          .eq("id", existing.id);
      } else {
        await supabase.from("monthly_invoices")
          .insert({ contractor_id: contractorId, mois, annee, montant_facture: calc, valide: true });
      }
    } else {
      if (existing) {
        await supabase.from("monthly_invoices").delete().eq("id", existing.id);
      }
    }
    refetchInv();
    toast.success(valide ? "Facture validée" : "Facture dévalidée");
  }

  async function updateInvoiceAmount(contractorId: string, val: string) {
    const montant = val === "" ? null : Number(val);
    const existing = invoiceFor(contractorId);
    if (!existing) return;
    await supabase.from("monthly_invoices")
      .update({ montant_facture: montant })
      .eq("id", existing.id);
    refetchInv();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Mois</label>
          <select className="border rounded px-2 py-1.5 bg-background" value={mois} onChange={(e) => setMois(Number(e.target.value))}>
            {MOIS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Année</label>
          <select className="border rounded px-2 py-1.5 bg-background" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
            {[annee-1, annee, annee+1].map((y) => <option key={y} value={y}>{y}</option>)}
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
                return (
                  <tr key={s.id} className="border-t">
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
                        title={isValide ? "Facture validée — décocher pour annuler" : "Cocher quand la facture est reçue"}
                      />
                    </td>
                    <td className="p-2 text-right">
                      {isValide ? (
                        <Input
                          type="number"
                          defaultValue={fact ?? calc}
                          className="h-7 w-24 ml-auto text-right"
                          onBlur={(e) => {
                            if (String(e.target.value) !== String(fact ?? "")) {
                              updateInvoiceAmount(s.id, e.target.value);
                            }
                          }}
                        />
                      ) : (
                        <span className="text-muted-foreground italic tabular-nums">
                          {calc.toFixed(2)} €
                        </span>
                      )}
                    </td>
                    <td className={`p-2 text-right tabular-nums ${ecartCls}`}>
                      {ecart != null ? `${ecart.toFixed(2)} €` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-primary mb-2">Détail par maison</h2>
        <div className="bg-card border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Maison</th>
                <th className="p-2 text-right">Nb</th>
                <th className="p-2 text-right">Voyageur</th>
                <th className="p-2 text-right">Propriétaire</th>
                <th className="p-2 text-right">Heures totales</th>
              </tr>
            </thead>
            <tbody>
              {byPropList.map((s) => (
                <tr key={s.nom} className="border-t">
                  <td className="p-2 font-medium">{s.nom}</td>
                  <td className="p-2 text-right tabular-nums">{s.nb}</td>
                  <td className="p-2 text-right tabular-nums">{s.v}</td>
                  <td className="p-2 text-right tabular-nums">{s.p}</td>
                  <td className="p-2 text-right tabular-nums">{s.heures.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
