
-- Properties
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avantio_code text UNIQUE NOT NULL,
  nom text NOT NULL,
  type text,
  statut text DEFAULT 'Actif',
  capacite int,
  localite text,
  adresse_complete text,
  proprietaire_nom text,
  proprietaire_telephone text,
  code_porte text,
  code_alarme text,
  wifi text,
  boite_a_cles text,
  equipe_habituelle_id uuid,
  duree_standard_h numeric,
  nb_personnes_recommande int,
  particularites text,
  lien_drive_photos text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contractors
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  couleur text DEFAULT '#3498db',
  taux_horaire numeric,
  telephone text,
  email text,
  statut_recrutement text DEFAULT 'actif',
  notes_internes text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.properties ADD CONSTRAINT properties_equipe_fk FOREIGN KEY (equipe_habituelle_id) REFERENCES public.contractors(id) ON DELETE SET NULL;

-- Cleanings
CREATE TABLE public.cleanings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_menage date NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  type_menage text NOT NULL,
  statut text DEFAULT 'planifie',
  heure_certification timestamptz,
  avantio_reservation_no text,
  avantio_source text,
  equipe_avantio_info text,
  cas_serre boolean DEFAULT false,
  nb_adultes_voyageurs int,
  observation text,
  notes_homer text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX cleanings_date_idx ON public.cleanings(date_menage);
CREATE INDEX cleanings_resa_idx ON public.cleanings(avantio_reservation_no);

-- Cleaning Contractors (M:N)
CREATE TABLE public.cleaning_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_id uuid NOT NULL REFERENCES public.cleanings(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  ordre int DEFAULT 1,
  heure_arrivee timestamptz,
  heure_depart timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cleaning_id, ordre)
);

-- Monthly invoices
CREATE TABLE public.monthly_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  mois int NOT NULL,
  annee int NOT NULL,
  montant_facture numeric,
  date_saisie date DEFAULT CURRENT_DATE,
  notes text,
  UNIQUE(contractor_id, mois, annee)
);

-- RLS: authenticated users have full CRUD
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all" ON public.properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.contractors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.cleanings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.cleaning_contractors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.monthly_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_props_updated BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contr_updated BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clean_updated BEFORE UPDATE ON public.cleanings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cc_updated BEFORE UPDATE ON public.cleaning_contractors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
