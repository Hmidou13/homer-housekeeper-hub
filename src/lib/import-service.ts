import { supabase } from "@/integrations/supabase/client";
import type { ParsedCleaning } from "./csv-parsers";

export type UnmatchedRow = {
  property_name: string;
  property_avantio_code: string | null;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number; // already exists with Homer data
  unmatched: UnmatchedRow[];
};

export async function importCleanings(rows: ParsedCleaning[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, unmatched: [] };
  if (rows.length === 0) return result;

  // Load all properties once
  const { data: props } = await supabase.from("properties").select("id, avantio_code, nom");
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  (props ?? []).forEach((p) => {
    if (p.avantio_code) byCode.set(p.avantio_code, p.id);
    if (p.nom) byName.set(p.nom.toUpperCase(), p.id);
  });

  // Load existing cleanings by reservation no
  const refs = rows.map((r) => r.avantio_reservation_no);
  const { data: existing } = await supabase
    .from("cleanings")
    .select("id, avantio_reservation_no, statut")
    .in("avantio_reservation_no", refs);

  // Existing CC entries per cleaning to detect Homer data
  const existingMap = new Map<string, { id: string; statut: string }>();
  (existing ?? []).forEach((e) => {
    if (e.avantio_reservation_no) existingMap.set(e.avantio_reservation_no, { id: e.id, statut: e.statut ?? "planifie" });
  });

  const cleaningIds = (existing ?? []).map((e) => e.id);
  const homerTouched = new Set<string>();
  if (cleaningIds.length > 0) {
    const { data: ccs } = await supabase
      .from("cleaning_contractors")
      .select("cleaning_id")
      .in("cleaning_id", cleaningIds);
    (ccs ?? []).forEach((c) => homerTouched.add(c.cleaning_id));
  }

  for (const row of rows) {
    const propId =
      (row.property_avantio_code && byCode.get(row.property_avantio_code)) ||
      byName.get(row.property_name.toUpperCase());
    if (!propId) {
      result.unmatched.push({
        property_name: row.property_name,
        property_avantio_code: row.property_avantio_code ?? null,
      });
      continue;
    }
    const ex = existingMap.get(row.avantio_reservation_no);
    if (!ex) {
      const { error } = await supabase.from("cleanings").insert({
        property_id: propId,
        date_menage: row.date_menage,
        type_menage: row.type_menage,
        statut: "planifie",
        avantio_reservation_no: row.avantio_reservation_no,
        avantio_source: row.source,
        equipe_avantio_info: row.equipe_avantio_info,
        cas_serre: row.cas_serre,
        nb_adultes_voyageurs: row.nb_adultes_voyageurs,
        observation: row.observation,
      });
      if (!error) result.created++;
    } else {
      const hasHomerData = homerTouched.has(ex.id) || ex.statut !== "planifie";
      if (hasHomerData) {
        result.skipped++;
      } else {
        const { error } = await supabase
          .from("cleanings")
          .update({
            property_id: propId,
            date_menage: row.date_menage,
            type_menage: row.type_menage,
            avantio_source: row.source,
            equipe_avantio_info: row.equipe_avantio_info,
            cas_serre: row.cas_serre,
            nb_adultes_voyageurs: row.nb_adultes_voyageurs,
          })
          .eq("id", ex.id);
        if (!error) result.updated++;
      }
    }
  }
  // Dedup unmatched by name+code
  const seen = new Set<string>();
  result.unmatched = result.unmatched.filter((u) => {
    const k = `${u.property_name}|${u.property_avantio_code ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`Import terminé : ${result.created} créés, ${result.updated} mis à jour, ${result.skipped} protégés, ${result.unmatched.length} non-matchés`);
  console.log("Détail non-matchés :", result.unmatched);
  return result;
}
