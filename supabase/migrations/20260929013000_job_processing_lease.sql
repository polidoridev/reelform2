-- Color matching re-encodes a finished video after the status check responds. The lease
-- lets exactly one request do that work; it expires so a crashed attempt is retried.
alter table public.rf_jobs add column if not exists processing_until timestamptz;
