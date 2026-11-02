-- Portal de solo lectura para clientes: un link privado (token aleatorio) por cartera, revocable.
-- La página pública lee los datos a través de /api/portal/[token] con la service role; la tabla queda solo para el dueño.
create table if not exists portal_links (
  token text primary key,
  cuenta text not null,
  cliente text,
  creado timestamptz not null default now(),
  revocado boolean not null default false,
  ultimo_acceso timestamptz,
  accesos integer not null default 0
);
alter table portal_links enable row level security;
drop policy if exists "solo dueño" on portal_links;
create policy "solo dueño" on portal_links for all using (public.es_duenio()) with check (public.es_duenio());
