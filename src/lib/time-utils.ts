// Time + date utilities for Homer
export function parseFrDate(s: string): string | null {
  // "DD/MM/YYYY" or "DD/MM/YYYY HH:MM" -> ISO date string YYYY-MM-DD
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function formatFrDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à")
    .replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô").replace(/&icirc;/g, "î")
    .replace(/&ucirc;/g, "û").replace(/&ccedil;/g, "ç").replace(/&ucirc;/g, "û")
    .replace(/&euml;/g, "ë").replace(/&iuml;/g, "ï").replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü").replace(/&aelig;/g, "æ").replace(/&oelig;/g, "œ")
    .replace(/&Eacute;/g, "É").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// Heures stockées en TEXT "HH:MM" (sans timezone). Calcul direct en minutes.
export function hoursBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const [ha, ma] = a.split(":").map(Number);
  const [hb, mb] = b.split(":").map(Number);
  if (isNaN(ha) || isNaN(ma) || isNaN(hb) || isNaN(mb)) return 0;
  const minutesA = ha * 60 + ma;
  const minutesB = hb * 60 + mb;
  if (minutesB <= minutesA) return 0;
  return (minutesB - minutesA) / 60;
}

// Conservé pour compat éventuelle, mais l'app stocke désormais "HH:MM" tel quel.
export function combineDateAndTime(_dateIso: string, hhmm: string): string {
  return hhmm ?? "";
}

export function timeFromTs(s: string | null): string {
  return s ?? "";
}

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
