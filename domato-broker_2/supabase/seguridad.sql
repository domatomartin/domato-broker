-- Restringe todas las tablas públicas al dueño de la app.
-- Antes bastaba con estar logueado ("authenticated"); ahora solo el email del dueño.
-- El cron (service role) no pasa por RLS, así que sigue funcionando.
-- Para sumar a alguien más: agregá su email en la lista de es_duenio().

create or replace function public.es_duenio() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('domato.martin@gmail.com')
$$;

do $$
declare p record; t record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('create policy "solo dueño" on public.%I for all using (public.es_duenio()) with check (public.es_duenio())', t.relname);
  end loop;
end $$;

select tablename, policyname from pg_policies where schemaname = 'public' order by 1;
