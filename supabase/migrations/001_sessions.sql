create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Untitled Session',
  bpm integer not null default 120,
  key text not null default 'C',
  scale text not null default 'major',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sessions enable row level security;
create policy "Users own sessions" on sessions
  for all using (auth.uid() = user_id);
