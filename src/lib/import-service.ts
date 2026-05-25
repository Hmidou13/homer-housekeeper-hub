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

export type CancellationInfo = {
  cleaning_id: string;
  avantio_reservation_no: string;
  property_name: string;
  date_menage: string;
  statut_actuel: string;
  has_equipe: boolean;
  equipe_noms: string[];
};

// Identifie les ménages à annuler (ne modifie rien — détection seule)
export async function detectCancellations(
  cancelled: { avantio_reservation_no: string; property_name: string }[],
): Promise<CancellationInfo[]> {
  if (cancelled.length === 0) return [];
  const refs = cancelled.map((c) => c.avantio_reservation_no);

  const { data: cleanings } = await supabase
    .from("cleanings")
    .select(
      "id, avantio_reservation_no, date_menage, statut, property:property_id(nom), ccs:cleaning_contractors(contractor:contractor_id(nom))",
    )
    .in("avantio_reservation_no", refs)
    .neq("statut", "annule");

  return (cleanings ?? []).map((c: any) => {
    const equipe_noms = (c.ccs ?? [])
      .map((cc: any) => cc.contractor?.nom)
      .filter(Boolean);
    return {
      cleaning_id: c.id,
      avantio_reservation_no: c.avantio_reservation_no,
      property_name: c.property?.nom ?? "—",
      date_menage: c.date_menage,
      statut_actuel: c.statut,
      has_equipe: equipe_noms.length > 0,
      equipe_noms,
    };
  });
}

// Applique les annulations confirmées par l'utilisateur
export async function applyCancellations(cleaningIds: string[]): Promise<number> {
  if (cleaningIds.length === 0) return 0;
  const { error } = await supabase
    .from("cleanings")
    .update({ statut: "annule" })
    .in("id", cleaningIds);
  if (error) throw error;
  return cleaningIds.length;
}


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

/**
 * Importe les ménages d'une maison fraîchement créée, parmi les lignes déjà parsées.
 * Même logique de détection / protection que importCleanings (mêmes champs Avantio,
 * notes_homer et observation préservés sur les ménages existants).
 */
export async function importCleaningsForProperty(
  rows: ParsedCleaning[],
  propertyId: string,
  propertyName: string,
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const target = propertyName.trim().toUpperCase();
  const matching = rows.filter((r) => (r.property_name ?? "").trim().toUpperCase() === target);
  if (matching.length === 0) return result;

  const refs = matching.map((r) => r.avantio_reservation_no).filter(Boolean);
  const existingMap = new Map<string, { id: string; statut: string }>();
  if (refs.length > 0) {
    const { data: existing } = await supabase
      .from("cleanings")
      .select("id, avantio_reservation_no, statut")
      .in("avantio_reservation_no", refs);
    (existing ?? []).forEach((e) => {
      if (e.avantio_reservation_no) existingMap.set(e.avantio_reservation_no, { id: e.id, statut: e.statut ?? "planifie" });
    });
  }
  const cleaningIds = [...existingMap.values()].map((e) => e.id);
  const homerTouched = new Set<string>();
  if (cleaningIds.length > 0) {
    const { data: ccs } = await supabase
      .from("cleaning_contractors")
      .select("cleaning_id")
      .in("cleaning_id", cleaningIds);
    (ccs ?? []).forEach((c) => homerTouched.add(c.cleaning_id));
  }

  for (const row of matching) {
    try {
      const ex = existingMap.get(row.avantio_reservation_no);
      if (!ex) {
        const { error } = await supabase.from("cleanings").insert({
          property_id: propertyId,
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
        if (error) throw error;
        result.created++;
      } else {
        const hasHomerData = homerTouched.has(ex.id) || ex.statut !== "planifie";
        if (hasHomerData) {
          result.skipped++;
        } else {
          const { error } = await supabase
            .from("cleanings")
            .update({
              property_id: propertyId,
              date_menage: row.date_menage,
              type_menage: row.type_menage,
              avantio_source: row.source,
              equipe_avantio_info: row.equipe_avantio_info,
              cas_serre: row.cas_serre,
              nb_adultes_voyageurs: row.nb_adultes_voyageurs,
            })
            .eq("id", ex.id);
          if (error) throw error;
          result.updated++;
        }
      }
    } catch (e: any) {
      result.errors.push(`${row.property_name} ${row.date_menage} : ${e.message}`);
    }
  }
  return result;
}
