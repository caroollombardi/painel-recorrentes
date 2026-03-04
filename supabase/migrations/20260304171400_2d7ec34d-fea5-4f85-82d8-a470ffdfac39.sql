
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name text NOT NULL,
  assignee text NOT NULL,
  project text NOT NULL,
  completed_date date,
  hours_logged numeric NOT NULL DEFAULT 0,
  client text,
  activity_type text,
  month integer NOT NULL,
  year integer NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view time entries"
ON public.time_entries FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage time entries"
ON public.time_entries FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

CREATE INDEX idx_time_entries_month_year ON public.time_entries(month, year);
CREATE INDEX idx_time_entries_assignee ON public.time_entries(assignee);
CREATE INDEX idx_time_entries_project ON public.time_entries(project);
