import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function genGpsLink(adresse: string | null | undefined): string {
  if (!adresse || !adresse.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse.trim())}`;
}

export function guessPropertyType(nom: string): "Villa" | "Appartement" | "Maison" {
  const upper = (nom ?? "").toUpperCase().trim();
  if (upper.startsWith("VILLA ")) return "Villa";
  if (upper.startsWith("APT ") || upper.startsWith("APPT ") || upper.startsWith("APPARTEMENT")) return "Appartement";
  if (upper.startsWith("MAISON ") || upper.startsWith("MAS ") || upper.startsWith("LE MAS") || upper.startsWith("LA BASTIDE")) return "Maison";
  return "Villa";
}
