// Maisons présentes dans Avantio mais hors périmètre Homer Conciergerie.
// À chaque import CSV, toute ligne concernant ces maisons est ignorée.
// Pour ajouter/retirer une maison à exclure, modifier cette liste.

export const EXCLUDED_PROPERTY_NAMES = new Set<string>([
  "APT ALBERT 1",
  "APT LE MASTERS",
  "APT LES ECRIVAINS",
  "APT MEDICIS",
  "APT PALAIS DU GRAND DUC",
  "APT ROSA VIDA",
  "VILLA ROSEBUD",
]);

export function isExcluded(propertyName: string): boolean {
  if (!propertyName) return false;
  return EXCLUDED_PROPERTY_NAMES.has(propertyName.trim().toUpperCase());
}
