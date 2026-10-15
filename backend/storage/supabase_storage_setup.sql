-- Run manually in the Supabase SQL Editor for the SmartDocs project.
-- This creates the dedicated bucket only when absent; it does not change an
-- existing bucket or delete any objects. Verify public=false in the dashboard.
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'smartdocs-private',
  'smartdocs-private',
  false,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- The backend accesses this dedicated private bucket with its server-only
-- service_role key. Explicitly deny browser roles, including if a broad
-- permissive Storage policy exists elsewhere. service_role bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'smartdocs_private_deny_client_access'
  ) THEN
    CREATE POLICY smartdocs_private_deny_client_access
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (bucket_id <> 'smartdocs-private')
      WITH CHECK (bucket_id <> 'smartdocs-private');
  END IF;
END
$$;
