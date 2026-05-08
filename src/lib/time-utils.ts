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

export function hoursBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db) || db <= da) return 0;
  return (db - da) / 3_600_000;
}

export function combineDateAndTime(dateIso: string, hhmm: string): string {
  // Returns ISO timestamp local time
  if (!dateIso || !hhmm) return "";
  return `${dateIso}T${hhmm}:00`;
}

export function timeFromTs(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
