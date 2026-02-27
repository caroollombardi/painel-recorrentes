
-- Table to store monthly consolidated snapshots for historical comparison
CREATE TABLE public.monthly_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  total_horas NUMERIC NOT NULL DEFAULT 0,
  total_valor NUMERIC NOT NULL DEFAULT 0,
  client_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (month, year)
);

-- RLS policies
ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage monthly snapshots"
  ON public.monthly_snapshots
  FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view monthly snapshots"
  ON public.monthly_snapshots
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.monthly_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
