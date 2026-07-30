create extension if not exists pgcrypto;

create table models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null check (region in ('br','us','us_latina','custom')),
  persona jsonb not null,
  reference_image_urls text[] not null default '{}',
  status text not null default 'generating_refs'
    check (status in ('generating_refs','pending_approval','approved')),
  created_at timestamptz not null default now()
);

create table image_jobs (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  muapi_request_id text unique,
  image_url text,
  status text not null default 'generating' check (status in ('generating','completed','failed')),
  error text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_brl numeric(10,2),
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table video_batches (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  product_id uuid not null references products(id),
  video_count int not null check (video_count between 1 and 200),
  duration_seconds int not null check (duration_seconds in (5,10)),
  estimated_cost_usd numeric(10,2) not null,
  status text not null default 'review' check (status in ('review','approved','done')),
  created_at timestamptz not null default now()
);

create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references video_batches(id) on delete cascade,
  script jsonb not null,
  muapi_request_id text unique,
  composed_image_url text,
  video_url text,
  status text not null default 'draft'
    check (status in ('draft','queued','composing','ready','generating','completed','failed')),
  cost_usd numeric(10,2) not null default 0,
  error text,
  retry_count int not null default 0,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz
);

create index video_jobs_status_idx on video_jobs(status);
create index video_jobs_batch_idx on video_jobs(batch_id);

alter table models enable row level security;
alter table image_jobs enable row level security;
alter table products enable row level security;
alter table video_batches enable row level security;
alter table video_jobs enable row level security;

create policy "authenticated all" on models for all to authenticated using (true) with check (true);
create policy "authenticated all" on image_jobs for all to authenticated using (true) with check (true);
create policy "authenticated all" on products for all to authenticated using (true) with check (true);
create policy "authenticated all" on video_batches for all to authenticated using (true) with check (true);
create policy "authenticated all" on video_jobs for all to authenticated using (true) with check (true);
