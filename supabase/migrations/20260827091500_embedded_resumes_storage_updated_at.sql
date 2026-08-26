-- Lets try_ingest_resume() skip downloading+hashing the resume file when
-- the storage object's own updated_at timestamp proves it hasn't changed
-- since the last successful ingest, instead of always downloading first
-- to compute content_hash. Nullable: existing rows fall through to the
-- old (correct, just slower) download+hash path until their next ingest.
alter table public.embedded_resumes
  add column if not exists storage_updated_at timestamptz;
