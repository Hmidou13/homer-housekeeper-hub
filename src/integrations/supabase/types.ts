export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cleaning_contractors: {
        Row: {
          cleaning_id: string
          contractor_id: string | null
          created_at: string | null
          date_intervention: string | null
          heure_arrivee: string | null
          heure_depart: string | null
          id: string
          notifie_whatsapp_at: string | null
          ordre: number | null
          updated_at: string | null
        }
        Insert: {
          cleaning_id: string
          contractor_id?: string | null
          created_at?: string | null
          date_intervention?: string | null
          heure_arrivee?: string | null
          heure_depart?: string | null
          id?: string
          notifie_whatsapp_at?: string | null
          ordre?: number | null
          updated_at?: string | null
        }
        Update: {
          cleaning_id?: string
          contractor_id?: string | null
          created_at?: string | null
          date_intervention?: string | null
          heure_arrivee?: string | null
          heure_depart?: string | null
          id?: string
          notifie_whatsapp_at?: string | null
          ordre?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_contractors_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_contractors_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanings: {
        Row: {
          avantio_reservation_no: string | null
          avantio_source: string | null
          cas_serre: boolean | null
          created_at: string | null
          date_menage: string
          equipe_avantio_info: string | null
          heure_certification: string | null
          id: string
          nb_adultes_voyageurs: number | null
          notes_homer: string | null
          nouveau: boolean
          observation: string | null
          property_id: string
          statut: string | null
          type_menage: string
          updated_at: string | null
          validation_requise: boolean | null
        }
        Insert: {
          avantio_reservation_no?: string | null
          avantio_source?: string | null
          cas_serre?: boolean | null
          created_at?: string | null
          date_menage: string
          equipe_avantio_info?: string | null
          heure_certification?: string | null
          id?: string
          nb_adultes_voyageurs?: number | null
          notes_homer?: string | null
          nouveau?: boolean
          observation?: string | null
          property_id: string
          statut?: string | null
          type_menage: string
          updated_at?: string | null
          validation_requise?: boolean | null
        }
        Update: {
          avantio_reservation_no?: string | null
          avantio_source?: string | null
          cas_serre?: boolean | null
          created_at?: string | null
          date_menage?: string
          equipe_avantio_info?: string | null
          heure_certification?: string | null
          id?: string
          nb_adultes_voyageurs?: number | null
          notes_homer?: string | null
          nouveau?: boolean
          observation?: string | null
          property_id?: string
          statut?: string | null
          type_menage?: string
          updated_at?: string | null
          validation_requise?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cleanings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          actif: boolean | null
          couleur: string | null
          created_at: string | null
          email: string | null
          id: string
          nom: string
          notes_internes: string | null
          statut_recrutement: string | null
          taux_horaire: number | null
          telephone: string | null
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          couleur?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom: string
          notes_internes?: string | null
          statut_recrutement?: string | null
          taux_horaire?: number | null
          telephone?: string | null
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          couleur?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom?: string
          notes_internes?: string | null
          statut_recrutement?: string | null
          taux_horaire?: number | null
          telephone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      monthly_invoices: {
        Row: {
          annee: number
          client: string | null
          contractor_id: string
          date_saisie: string | null
          id: string
          mois: number
          montant_facture: number | null
          notes: string | null
          valide: boolean | null
        }
        Insert: {
          annee: number
          client?: string | null
          contractor_id: string
          date_saisie?: string | null
          id?: string
          mois: number
          montant_facture?: number | null
          notes?: string | null
          valide?: boolean | null
        }
        Update: {
          annee?: number
          client?: string | null
          contractor_id?: string
          date_saisie?: string | null
          id?: string
          mois?: number
          montant_facture?: number | null
          notes?: string | null
          valide?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_invoices_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          adresse_complete: string | null
          avantio_code: string
          boite_a_cles: string | null
          capacite: number | null
          client: string | null
          code_alarme: string | null
          code_porte: string | null
          created_at: string | null
          duree_standard_h: number | null
          equipe_habituelle_id: string | null
          id: string
          lien_drive_photos: string | null
          lien_gps: string | null
          localite: string | null
          nb_personnes_recommande: number | null
          nom: string
          notes: string | null
          particularites: string | null
          proprietaire_nom: string | null
          proprietaire_telephone: string | null
          statut: string | null
          type: string | null
          updated_at: string | null
          wifi: string | null
        }
        Insert: {
          adresse_complete?: string | null
          avantio_code: string
          boite_a_cles?: string | null
          capacite?: number | null
          client?: string | null
          code_alarme?: string | null
          code_porte?: string | null
          created_at?: string | null
          duree_standard_h?: number | null
          equipe_habituelle_id?: string | null
          id?: string
          lien_drive_photos?: string | null
          lien_gps?: string | null
          localite?: string | null
          nb_personnes_recommande?: number | null
          nom: string
          notes?: string | null
          particularites?: string | null
          proprietaire_nom?: string | null
          proprietaire_telephone?: string | null
          statut?: string | null
          type?: string | null
          updated_at?: string | null
          wifi?: string | null
        }
        Update: {
          adresse_complete?: string | null
          avantio_code?: string
          boite_a_cles?: string | null
          capacite?: number | null
          client?: string | null
          code_alarme?: string | null
          code_porte?: string | null
          created_at?: string | null
          duree_standard_h?: number | null
          equipe_habituelle_id?: string | null
          id?: string
          lien_drive_photos?: string | null
          lien_gps?: string | null
          localite?: string | null
          nb_personnes_recommande?: number | null
          nom?: string
          notes?: string | null
          particularites?: string | null
          proprietaire_nom?: string | null
          proprietaire_telephone?: string | null
          statut?: string | null
          type?: string | null
          updated_at?: string | null
          wifi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_equipe_fk"
            columns: ["equipe_habituelle_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
