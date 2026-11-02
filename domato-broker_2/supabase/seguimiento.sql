-- Lista de seguimiento con alertas de TIR o precio (una condición por título). Solo el dueño.
create table if not exists seguimiento (
  isin text primary key,
  tipo text not null default 'tir' check (tipo in ('tir', 'precio')),
  condicion text not null default '>' check (condicion in ('>', '<')),
  umbral numeric not null,
  nota text,
  disparada boolean not null default false,
  ultima_revision timestamptz,
  valor numeric,
  creado timestamptz not null default now()
);
alter table seguimiento enable row level security;
drop policy if exists "solo dueño" on seguimiento;
create policy "solo dueño" on seguimiento for all using (public.es_duenio()) with check (public.es_duenio());
