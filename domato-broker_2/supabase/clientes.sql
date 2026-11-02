-- Fichas de clientes (contacto, perfil de inversor) y notas de reuniones. Solo el dueño.
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuenta text,
  email text,
  telefono text,
  monto_previsto numeric,
  moneda text,
  perfil jsonb,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists cliente_notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null default current_date,
  texto text not null,
  created_at timestamptz not null default now()
);
alter table clientes enable row level security;
alter table cliente_notas enable row level security;
drop policy if exists "solo dueño" on clientes;
create policy "solo dueño" on clientes for all using (public.es_duenio()) with check (public.es_duenio());
drop policy if exists "solo dueño" on cliente_notas;
create policy "solo dueño" on cliente_notas for all using (public.es_duenio()) with check (public.es_duenio());
