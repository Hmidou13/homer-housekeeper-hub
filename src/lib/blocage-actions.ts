import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export async function validerBlocageEnProprietaire(cleaningId: string): Promise<boolean> {
  const { error } = await supabase
    .from("cleanings")
    .update({ type_menage: "proprietaire", validation_requise: false })
    .eq("id", cleaningId);
  if (error) { toast.error(error.message); return false; }
  toast.success("Classé en ménage Propriétaire");
  return true;
}

export async function annulerBlocage(cleaningId: string): Promise<boolean> {
  const { error } = await supabase
    .from("cleanings")
    .update({ statut: "annule", validation_requise: false })
    .eq("id", cleaningId);
  if (error) { toast.error(error.message); return false; }
  toast.success("Blocage annulé");
  return true;
}
