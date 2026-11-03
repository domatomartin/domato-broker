-- Equipo: colaboradores con su propio usuario.
--   colaborador → ve todo; carga fichas, notas, reuniones, seguimiento y propuestas (y las comparte). No borra,
--                 no ejecuta compras (no puede escribir en bonds), no cambia costos ni el catálogo.
--   lectura     → solo ve.
-- El dueño (es_duenio) sigue teniendo acceso total. El cron usa la service role y no pasa por RLS.

create table if not exists equipo (
  email text primary key,
  rol text not null default 'colaborador' check (rol in ('colaborador', 'lectura')),
  activo boolean not null default true,
  creado timestamptz not null default now()
);
alter table equipo enable row level security;
drop policy if exists "solo dueño" on equipo;
create policy "solo dueño" on equipo for all using (public.es_duenio()) with check (public.es_duenio());
drop policy if exists "ve su fila" on equipo;
create policy "ve su fila" on equipo for select using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_duenio() or exists (
    select 1 from public.equipo where activo and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

create or replace function public.es_colaborador() returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_duenio() or exists (
    select 1 from public.equipo where activo and rol = 'colaborador' and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

do $$
declare t text;
begin
  -- Lectura para todo el equipo.
  foreach t in array array['bonds','instrumentos','propuestas','clientes','cliente_notas','reuniones','seguimiento','costos_config',
                           'novedades','patrimonio_snapshots','movimientos','portal_links','investor_profile'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "equipo lee" on public.%I', t);
      execute format('create policy "equipo lee" on public.%I for select using (public.es_miembro())', t);
    end if;
  end loop;
  -- Alta y modificación (sin borrar) para colaboradores.
  foreach t in array array['propuestas','clientes','cliente_notas','reuniones','seguimiento','portal_links'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "colaborador agrega" on public.%I', t);
      execute format('create policy "colaborador agrega" on public.%I for insert with check (public.es_colaborador())', t);
      execute format('drop policy if exists "colaborador modifica" on public.%I', t);
      execute format('create policy "colaborador modifica" on public.%I for update using (public.es_colaborador()) with check (public.es_colaborador())', t);
    end if;
  end loop;
end $$;

-- Un colaborador no puede marcar una propuesta como ejecutada (eso registra la compra).
create or replace function public.solo_duenio_ejecuta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'ejecutada' and coalesce(old.estado, '') <> 'ejecutada' and not public.es_duenio()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and auth.uid() is not null then
    raise exception 'Solo el dueño puede ejecutar compras';
  end if;
  return new;
end $$;
drop trigger if exists solo_duenio_ejecuta on propuestas;
create trigger solo_duenio_ejecuta before insert or update on propuestas for each row execute function public.solo_duenio_ejecuta();
