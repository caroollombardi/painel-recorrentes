-- Create table to store dashboard data
CREATE TABLE public.dashboard_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data jsonb NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_data ENABLE ROW LEVEL SECURITY;

-- Admins can manage dashboard data
CREATE POLICY "Admins can manage dashboard data"
  ON public.dashboard_data
  FOR ALL
  USING (is_admin(auth.uid()));

-- All authenticated users can view dashboard data
CREATE POLICY "Authenticated users can view dashboard data"
  ON public.dashboard_data
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_dashboard_data_updated_at
  BEFORE UPDATE ON public.dashboard_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();