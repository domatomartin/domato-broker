-- Agenda de reuniones con clientes. Solo el dueño.
create table if not exists reuniones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha timestamptz not null,
  duracion_min integer not null default 60,
  motivo text not null default 'Reunión',
  lugar text,
  hecha boolean not null default false,
  creado timestamptz not null default now()
);
alter table reuniones enable row level security;
drop policy if exists "solo dueño" on reuniones;
create policy "solo dueño" on reuniones for all using (public.es_duenio()) with check (public.es_duenio());
