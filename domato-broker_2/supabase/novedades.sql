-- Novedades del mercado detectadas por el cron (títulos nuevos en la BVM, comunicados). Solo el dueño.
create table if not exists novedades (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  tipo text not null,
  texto text not null,
  url text,
  creado timestamptz not null default now()
);
alter table novedades enable row level security;
drop policy if exists "solo dueño" on novedades;
create policy "solo dueño" on novedades for all using (public.es_duenio()) with check (public.es_duenio());
