# Supabase PostgreSQL and private Storage rollout

The PostgreSQL adapter uses psycopg 3 with `DATABASE_URL`. The app refuses implicit SQLite fallback. SQLite is only available when explicitly selected for local/test use and is rejected on Render. Startup checksum-checks/applies versioned schema migrations, then verifies the configured private Storage bucket and its client-deny policy. It does not seed demo users or replace existing rows.

## Supabase setup

1. In project `smart-document-generator-acm-svnit`, open **Connect** and copy the **Session pooler** PostgreSQL URI. Render may use IPv4-only outbound networking; Supabase documents the shared session pooler as IPv4-accessible, while direct connection availability depends on IPv6/IPv4 add-ons. Replace the URI’s password placeholder with the database password and percent-encode reserved characters. Do not paste the URI into source control or frontend configuration.
2. In Supabase **Project Settings → API Keys**, create/copy a backend **Secret key** (`sb_secret_...`). Use the current secret key. The code sends it only in `apikey`; for a legacy `service_role` JWT, it sends both `apikey` and `Authorization: Bearer ...`. Both bypass RLS and must remain server-only.
3. In **SQL Editor**, review and run `backend/storage/supabase_storage_setup.sql`. It creates bucket `smartdocs-private` only if absent and adds a restrictive policy denying `anon` and `authenticated` access to that bucket. It never changes an existing bucket or deletes objects. Confirm Storage shows the bucket as **Private**. The backend checks the bucket and policy at startup. Supabase private buckets enforce access control; secret/service-role keys bypass RLS, so the app's existing authenticated FastAPI document ownership and RBAC checks remain the authorization boundary.

## Render backend variables

Set these on the **backend service only**:

- `DATABASE_URL`: the copied Supabase PostgreSQL session-pooler URI.
- `SMARTDOCS_DB_BACKEND=postgres`.
- `SMARTDOCS_STORAGE_BACKEND=supabase`.
- `SUPABASE_URL`: project URL, for example `https://<project-ref>.supabase.co` (copy it from Supabase Project Settings → API).
- `SUPABASE_SECRET_KEY`: the backend secret key (`sb_secret_...`). Legacy alternative: `SUPABASE_SERVICE_ROLE_KEY`.
- `SUPABASE_STORAGE_BUCKET=smartdocs-private`.
- Keep existing backend authentication/secrets unchanged, especially `JWT_SECRET_KEY` (existing HMAC signatures use it), `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and institutional domain configuration. Keep bootstrap secrets if that flow is in use.

Never set any of these secrets in Vercel/frontend environment variables. In Render, use **Save only** while preparing the values; do not deploy the app against an empty PostgreSQL database.

## Data and artifact migration

The SQLite importer is report-only by default and reads the source file read-only. Use only a verified production backup, not a repository SQLite file. Its apply mode requires the explicit backup acknowledgement, initializes the additive versioned schema, refuses non-empty application tables or column mismatches, and commits the table copy in one transaction with row-count and content-checksum checks. It does not delete or update the SQLite source.

Generated PDFs/DOCX, uploaded lead-signature images, and batch ZIPs are now stored in the private bucket for new versions. Database path fields hold private object references. Signature images are represented by private object references in version JSON and are hydrated back to the existing inline data URI on authenticated API responses; HMAC calculation still uses the original data payload. Download routes continue to check existing user/document ownership before server-side retrieval. The browser never receives the Supabase secret or a public object URL.

For existing records, first make a verified copy of the old generated-documents directory and batch archives. After importing SQLite rows to Supabase PostgreSQL, run the asset backfill in report-only mode with those copies:

```sh
PYTHONPATH=backend python3 backend/scripts/migrate_assets_to_supabase.py \
  --file-root /secure/backup/generated_docs \
  --batch-root /secure/backup/generated_docs/batches
```

Review every missing path. Apply only after the file copy is complete and `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET` point to the intended project:

```sh
PYTHONPATH=backend python3 backend/scripts/migrate_assets_to_supabase.py \
  --file-root /secure/backup/generated_docs \
  --batch-root /secure/backup/generated_docs/batches \
  --apply
```

The backfill uploads files/signatures and updates only matching `document_versions` references; it does not remove source files. Batch object keys are rebuilt from recorded batch IDs. If any legacy artifact files are already gone, they cannot be recovered by this code; do not treat missing artifacts as migrated.

After data and file import, verify table counts/IDs and migration checksums; Firebase UID/role mappings; documents, all version JSON, signature tokens and HMAC verification; workflow/audit records; and authenticated downloads for PDF, DOCX, signature-backed documents, and batch ZIPs. Keep the old SQLite and file backups untouched until verification is complete. A rollback after PostgreSQL accepts writes requires reconciling those new writes; simply pointing back to SQLite loses them.

## PostgreSQL integration test

The normal test suite uses isolated SQLite. A real PostgreSQL integration test is available but intentionally skipped unless both `SMARTDOCS_TEST_DATABASE_URL` and `SMARTDOCS_RUN_POSTGRES_INTEGRATION=I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE` are set. It applies/checks migrations and performs a transaction-only round trip that rolls back its uniquely named rows. Point it only at a disposable test database; it never drops/truncates tables.
