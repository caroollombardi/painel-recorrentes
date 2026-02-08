
-- Step 1: Add new role values to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'socio';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestao';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operacional';
