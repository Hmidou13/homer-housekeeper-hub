ALTER TABLE public.cleaning_contractors 
  ADD COLUMN heure_arrivee_txt text,
  ADD COLUMN heure_depart_txt text;

UPDATE public.cleaning_contractors 
SET heure_arrivee_txt = to_char(heure_arrivee AT TIME ZONE 'Europe/Paris', 'HH24:MI')
WHERE heure_arrivee IS NOT NULL;

UPDATE public.cleaning_contractors 
SET heure_depart_txt = to_char(heure_depart AT TIME ZONE 'Europe/Paris', 'HH24:MI')
WHERE heure_depart IS NOT NULL;

ALTER TABLE public.cleaning_contractors 
  DROP COLUMN heure_arrivee,
  DROP COLUMN heure_depart;

ALTER TABLE public.cleaning_contractors 
  RENAME COLUMN heure_arrivee_txt TO heure_arrivee;
ALTER TABLE public.cleaning_contractors 
  RENAME COLUMN heure_depart_txt TO heure_depart;