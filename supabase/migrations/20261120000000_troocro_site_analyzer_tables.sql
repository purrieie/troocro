-- TrooCRO site analyzer: scan + lead storage (Supabase free plan).
-- RLS is on with no policies, so only the Edge Function (service role) can read or write.

create table if not exists public.sa_scans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  url text not null,
  host text not null,
  inputs jsonb not null default '{}'::jsonb,
  server_result jsonb,
  report jsonb,
  status text not null default 'scanning',
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sa_scans_created_idx on public.sa_scans (created_at desc);
create index if not exists sa_scans_ip_created_idx on public.sa_scans (ip_hash, created_at desc);

create table if not exists public.sa_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  name text,
  email text,
  website text,
  interests text[],
  message text,
  scan_slug text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists sa_leads_created_idx on public.sa_leads (created_at desc);

alter table public.sa_scans enable row level security;
alter table public.sa_leads enable row level security;
