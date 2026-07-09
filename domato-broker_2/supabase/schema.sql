-- Eureka Patrimonio — esquema inicial de base de datos
-- Ejecutar en el SQL Editor de Supabase (proyecto nuevo)

create table if not exists bonds (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text,
  isin text,
  moneda text not null default 'USD',
  cantidad numeric not null default 0,
  valor_nominal numeric not null default 0,
  precio_compra numeric not null default 0,
  precio_actual numeric not null default 0,
  cupon numeric,
  proximo_pago_interes date,
  proximo_vencimiento date,
  fecha_compra date,
  corredor text,
  estado text not null default 'activo',
  tir numeric,
  duration numeric,
  duration_modificada numeric,
  convexidad numeric,
  created_at timestamptz not null default now()
);

-- Si ya tenías la tabla `bonds` creada antes de sumar convexidad, corré:
-- alter table bonds add column if not exists convexidad numeric;

create table if not exists investor_profile (
  id int primary key default 1,
  objetivos_financieros text,
  rentabilidad_objetivo numeric,
  riesgo_aceptado text default 'moderado',
  horizonte_inversion text,
  distribucion_objetivo text,
  updated_at timestamptz not null default now(),
  constraint investor_profile_singleton check (id = 1)
);

create table if not exists patrimonio_snapshots (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  valor_total numeric not null default 0,
  efectivo_usd numeric not null default 0,
  efectivo_uyu numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null, -- compra | venta | cupon | interes | deposito | retiro
  bono_id uuid references bonds(id) on delete set null,
  descripcion text,
  monto numeric not null default 0,
  moneda text not null default 'USD',
  created_at timestamptz not null default now()
);

-- Row Level Security: restringido a usuarios logueados (Supabase Auth).
-- Creá tu usuario admin en Authentication > Users antes de correr esto,
-- o quedarás afuera de tu propia app hasta crearlo.
alter table bonds enable row level security;
alter table patrimonio_snapshots enable row level security;
alter table movimientos enable row level security;
alter table investor_profile enable row level security;

drop policy if exists "allow all bonds" on bonds;
drop policy if exists "allow all snapshots" on patrimonio_snapshots;
drop policy if exists "allow all movimientos" on movimientos;
drop policy if exists "allow all investor_profile" on investor_profile;

create policy "authenticated only bonds" on bonds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only snapshots" on patrimonio_snapshots
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only movimientos" on movimientos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only investor_profile" on investor_profile
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
