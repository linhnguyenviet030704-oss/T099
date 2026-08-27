-- Lets try_ingest_resume() skip downloading+hashing the resume file when
-- the storage object's own updated_at timestamp proves it hasn't changed
-- since the last successful ingest, instead of always downloading first
-- to compute content_hash. Nullable: existing rows fall through to the
-- old (correct, just slower) download+hash path until their next ingest.
-- text, not timestamptz: this is an opaque change-detection token taken
-- verbatim from Supabase Storage's list() API (Z-form ISO), which must be
-- compared byte-for-byte against itself later; timestamptz would round-trip
-- through PostgREST in offset-form ISO instead, so the raw string equality
-- check in ingest_resume() would never match.
alter table public.embedded_resumes
  add column if not exists storage_updated_at text;
