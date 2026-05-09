import { parseFrDate, decodeHtmlEntities } from "./time-utils";
import { isExcluded } from "./excluded-properties";

const VERIFY_KEYWORDS = ["propriétaire", "proprietaire", "maman", "famille", "avant synchro", "client direct"];

function splitCsvLine(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

export type ParsedCleaning = {
  avantio_reservation_no: string;
  property_name: string;
  property_avantio_code: string | null;
  date_menage: string;
  type_menage: "voyageur" | "proprietaire" | "bloque_a_arbitrer" | "a_verifier";
  cas_serre: boolean;
  nb_adultes_voyageurs: number | null;
  observation: string;
  equipe_avantio_info: string;
  source: "menages" | "reservations";
};

export function parseMenagesCsv(text: string): { rows: ParsedCleaning[]; excluded: number } {
  const lines = text.split(/\r?\n/);
  const out: ParsedCleaning[] = [];
  let excluded = 0;
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    if (raw.startsWith("Nettoyage et services")) continue;
    if (raw.startsWith("Jour:")) continue;
    if (raw.startsWith("Nº réservation") || raw.startsWith("N° réservation")) continue;
    const cols = splitCsvLine(raw);
    if (cols.length < 21) continue;
    const reservationNo = cols[0];
    if (!reservationNo || !/^\d/.test(reservationNo)) continue;

    const sortie = cols[5];
    const dateMenage = parseFrDate(sortie);
    if (!dateMenage) continue;

    if (isExcluded(cols[3])) { excluded++; continue; }

    const adultes = parseInt(cols[7]) || null;
    const prochain = cols[15] || "";
    const cas_serre = /le jour même/i.test(prochain);
    const observation = decodeHtmlEntities(cols[19] || "");
    const equipe = cols[18] || "";
    const reference = cols[20] || "";

    const lower = observation.toLowerCase();
    const isVerify = VERIFY_KEYWORDS.some((k) => lower.includes(k));

    out.push({
      avantio_reservation_no: reservationNo,
      property_name: cols[3],
      property_avantio_code: reference || null,
      date_menage: dateMenage,
      type_menage: isVerify ? "a_verifier" : "voyageur",
      cas_serre,
      nb_adultes_voyageurs: adultes,
      observation,
      equipe_avantio_info: equipe,
      source: "menages",
    });
  }
  return { rows: out, excluded };
}

export type ParsedReservation = ParsedCleaning;

export function parseReservationsCsv(text: string): { rows: ParsedReservation[]; ignored: number; excluded: number } {
  const lines = text.split(/\r?\n/);
  const out: ParsedReservation[] = [];
  let ignored = 0;
  let excluded = 0;
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    if (raw.startsWith("Liste réservation")) continue;
    if (raw.startsWith("Nº réservation") || raw.startsWith("N° réservation")) continue;
    const cols = splitCsvLine(raw);
    if (cols.length < 14) continue;
    const reservationNo = cols[0];
    if (!reservationNo || !/^\d/.test(reservationNo)) continue;

    if (isExcluded(cols[3])) { excluded++; continue; }

    const typeRes = (cols[9] || "").trim();
    const dateSortie = parseFrDate(cols[11]);
    if (!dateSortie) continue;

    let type_menage: ParsedCleaning["type_menage"];
    if (typeRes === "De Propriétaire") type_menage = "proprietaire";
    else if (typeRes === "Non Disponible") type_menage = "bloque_a_arbitrer";
    else { ignored++; continue; }

    out.push({
      avantio_reservation_no: reservationNo,
      property_name: cols[3],
      property_avantio_code: null,
      date_menage: dateSortie,
      type_menage,
      cas_serre: false,
      nb_adultes_voyageurs: null,
      observation: decodeHtmlEntities(cols[13] || ""),
      equipe_avantio_info: cols[6] || "",
      source: "reservations",
    });
  }
  return { rows: out, ignored, excluded };
}
