ALTER TABLE public.cleaning_contractors ADD COLUMN IF NOT EXISTS date_intervention date;

UPDATE public.cleaning_contractors cc
SET date_intervention = c.date_menage
FROM public.cleanings c
WHERE cc.cleaning_id = c.id AND cc.date_intervention IS NULL;