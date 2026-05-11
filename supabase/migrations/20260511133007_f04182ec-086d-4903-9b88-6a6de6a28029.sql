ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client text;
ALTER TABLE public.monthly_invoices ADD COLUMN IF NOT EXISTS client text;