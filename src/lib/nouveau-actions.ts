import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Marque un ménage comme vu (retire le badge "Nouveau")
export async function marquerVu(cleaningId: string): Promise<boolean> {
  const { error } = await supabase
    .from("cleanings")
    .update({ nouveau: false })
    .eq("id", cleaningId);
  if (error) { toast.error(error.message); return false; }
  return true;
}

// Marque TOUS les ménages "nouveau" comme vus
export async function marquerTousVus(): Promise<boolean> {
  const { error } = await supabase
    .from("cleanings")
    .update({ nouveau: false })
    .eq("nouveau", true);
  if (error) { toast.error(error.message); return false; }
  toast.success("Toutes les nouveautés marquées comme vues");
  return true;
}
