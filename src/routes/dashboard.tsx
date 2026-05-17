import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatFrDate } from "@/lib/time-utils";

export const Route = createFileRoute("/dashboard")({ component: () => <RequireAuth><DashboardPage /></RequireAuth> });

function todayIso() { return new Date().toISOString().slice(0, 10); }
function inDaysIso(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function DashboardPage() {
  const today = todayIso();
  const in7 = inDaysIso(7);

  const { data: cleanings = [] } = useQuery({
    queryKey: ["dashboard-cleanings", today, in7],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select("id, date_menage, type_menage, statut, cas_serre, property:property_id(nom)")
        .gte("date_menage", today)
        .lte("date_menage", in7)
        .neq("statut", "annule");
      return data ?? [];
    },
  });

  const { data: ccs = [] } = useQuery({
    queryKey: ["dashboard-ccs", today, in7],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleaning_contractors")
        .select("contractor_id, cleaning:cleaning_id(date_menage, statut), contractor:contractor_id(nom)")
        .gte("cleaning.date_menage", today)
        .lte("cleaning.date_menage", in7);
      return data ?? [];
    },
  });

  const todayItems = cleanings.filter((c) => c.date_menage === today);
  const tStats = {
    total: todayItems.length,
    pretes: todayItems.filter((c) => c.statut === "prete").length,
    en_cours: todayItems.filter((c) => c.statut === "en_cours").length,
    planifies: todayItems.filter((c) => c.statut === "planifie").length,
  };
  const wStats = {
    total: cleanings.length,
    voyageur: cleanings.filter((c) => c.type_menage === "voyageur" || c.type_menage === "a_verifier").length,
    proprietaire: cleanings.filter((c) => c.type_menage === "proprietaire").length,
    bloque: cleanings.filter((c) => c.type_menage === "bloque_a_arbitrer").length,
  };

  const cleaningIdsWithCC = new Set<string>();
  ccs.forEach((c: any) => { if ((c as any).cleaning_id) cleaningIdsWithCC.add((c as any).cleaning_id); });

  const sansEquipe = cleanings.filter((c) => !cleaningIdsWithCC.has(c.id) && c.statut !== "annule").length;
  const casSerres = cleanings.filter((c) => c.cas_serre).length;
  const aArbitrer = cleanings.filter((c) => c.type_menage === "bloque_a_arbitrer").length;

  // Charge par équipe
  const chargeMap = new Map<string, number>();
  ccs.forEach((c: any) => {
    const nom = c.contractor?.nom ?? "—";
    chargeMap.set(nom, (chargeMap.get(nom) ?? 0) + 1);
  });
  const charge = [...chargeMap.entries()].sort((a, b) => b[1] - a[1]);

  const { data: rappels = [] } = useQuery({
    queryKey: ["dashboard-rappels", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleanings")
        .select("id, date_menage, observation, property:property_id(nom)")
        .gte("date_menage", today)
        .neq("statut", "annule")
        .not("observation", "is", null)
        .order("date_menage");
      return (data ?? []).filter((c: any) => (c.observation ?? "").trim().length > 0);
    },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Aujourd'hui">
          <Row label="Prévus" v={tStats.total} />
          <Row label="Prêts" v={`${tStats.pretes} ✅`} />
          <Row label="En cours" v={tStats.en_cours} />
          <Row label="Planifiés" v={tStats.planifies} />
        </Card>
        <Card title="Cette semaine (7j)">
          <Row label="Prévus" v={wStats.total} />
          <Row label="Voyageur" v={wStats.voyageur} />
          <Row label="Propriétaire" v={wStats.proprietaire} />
          <Row label="Bloqués" v={wStats.bloque} />
        </Card>
        <Card title="Alertes">
          <Link to="/planning" className="block hover:bg-muted/50 rounded px-1">
            <Row label="⚠️ Sans équipe" v={sansEquipe} />
          </Link>
          <Row label="⚠️ Cas serrés" v={casSerres} />
          <Link to="/planning" className="block hover:bg-muted/50 rounded px-1">
            <Row label="🔒 À arbitrer" v={aArbitrer} />
          </Link>
        </Card>
      </div>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3 text-primary">Charge par équipe — 7 prochains jours</h2>
        {charge.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune affectation cette semaine.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {charge.map(([nom, n]) => (
                <tr key={nom} className="border-b last:border-0">
                  <td className="py-2">{nom}</td>
                  <td className="py-2 text-right tabular-nums">{n} ménage{n > 1 ? "s" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3 text-primary">Ménages en cours</h2>
        {enCours.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tout est calme ✓</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {enCours.map((c: any) => (
              <li key={c.id}>{c.property?.nom}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}
