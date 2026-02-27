create table notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  midi_note integer not null,
  start_beat numeric not null,
  duration_beats numeric not null,
  velocity integer not null default 80,
  track integer not null default 0,
  created_at timestamptz default now()
);

alter table notes enable row level security;
create policy "Users own notes via session" on notes
  for all using (
    exists (
      select 1 from sessions s
      where s.id = notes.session_id
      and s.user_id = auth.uid()
    )
  );

create index notes_session_idx on notes(session_id);
