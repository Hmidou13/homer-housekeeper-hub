-- ================================================================
-- REMISE À ZÉRO AVANT MISE EN PRODUCTION — Homer Ménages
-- ================================================================
-- Ce script supprime toutes les données opérationnelles (ménages,
-- affectations, factures) pour repartir d'une base propre.
--
-- IL CONSERVE : les maisons (properties) et les équipes (contractors).
--
-- À exécuter dans l'éditeur SQL de Supabase, une seule fois,
-- juste avant de réimporter les CSV Avantio pour la production.
-- ================================================================

-- L'ordre est important : on supprime d'abord les tables qui
-- dépendent des autres (clés étrangères).

-- 1. Les affectations équipes (dépend de cleanings)
DELETE FROM public.cleaning_contractors;

-- 2. Les validations de factures mensuelles (liées aux anciens ménages)
DELETE FROM public.monthly_invoices;

-- 3. Les ménages eux-mêmes
DELETE FROM public.cleanings;

-- ================================================================
-- NE PAS décommenter les lignes ci-dessous : elles effaceraient
-- le référentiel que vous voulez conserver.
-- DELETE FROM public.properties;   <-- NE PAS EXÉCUTER
-- DELETE FROM public.contractors;  <-- NE PAS EXÉCUTER
-- ================================================================
