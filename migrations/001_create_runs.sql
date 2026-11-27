create table if not exists runs (
  run_id text primary key,
  payload jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runs_created_at_idx on runs (created_at desc);
