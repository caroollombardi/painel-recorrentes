-- Bucket para armazenar contratos (PDF e DOCX)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contratos',
  'contratos',
  false,
  10485760,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "contratos_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contratos' AND auth.uid() IS NOT NULL);

CREATE POLICY "contratos_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contratos' AND auth.uid() IS NOT NULL);

CREATE POLICY "contratos_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contratos' AND auth.uid() IS NOT NULL);

ALTER TABLE public.atos_projetos
  ADD COLUMN IF NOT EXISTS contrato_filename text;
