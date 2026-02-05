-- Allow first user to assign their own role (bootstrap admin)
-- This policy will only work when there are no admins yet

CREATE OR REPLACE FUNCTION public.no_admins_exist()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE role = 'admin'
    )
$$;

-- Add policy for first admin bootstrap
CREATE POLICY "First user can become admin"
ON public.user_roles
FOR INSERT
WITH CHECK (
    public.no_admins_exist() 
    AND auth.uid() = user_id
    AND role = 'admin'
);