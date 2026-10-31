-- Costos del corredor (fila única) y propuestas de inversión con seguimiento.

create table if not exists costos_config (
  id int primary key default 1,
  comision_compra_pct numeric not null default 0.5,
  comision_venta_pct numeric not null default 0.5,
  custodia_anual_pct numeric not null default 0.25,
  comision_cupon_pct numeric not null default 0,
  gasto_fijo numeric not null default 0,
  iva_pct numeric not null default 22,
  updated_at timestamptz not null default now(),
  constraint costos_config_unica check (id = 1)
);
insert into costos_config (id) values (1) on conflict (id) do nothing;

create table if not exists propuestas (
  id uuid primary key default gen_random_uuid(),
  cliente text not null default '',
  asesor text,
  perfil jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  analisis text,
  metricas jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'presentada', 'ejecutada', 'descartada')),
  cuenta text,
  ejecucion jsonb,
  fecha_presentada timestamptz,
  fecha_ejecucion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bonos comprados a partir de una propuesta.
alter table bonds add column if not exists propuesta_id uuid references propuestas(id) on delete set null;

alter table costos_config enable row level security;
alter table propuestas enable row level security;
drop policy if exists "authenticated only costos_config" on costos_config;
drop policy if exists "authenticated only propuestas" on propuestas;
create policy "authenticated only costos_config" on costos_config
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only propuestas" on propuestas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- IRPF sobre intereses (persona física residente).
alter table costos_config add column if not exists irpf_soberano_pct numeric not null default 0;
alter table costos_config add column if not exists irpf_privado_pct numeric not null default 7;
alter table costos_config add column if not exists irpf_exterior_pct numeric not null default 12;
alter table instrumentos add column if not exists irpf_manual numeric;

-- Estrategia de seguimiento a 6 y 12 meses (IA) y última revisión contra el mercado.
alter table propuestas add column if not exists estrategia text;
alter table propuestas add column if not exists estrategia_mercado jsonb;
alter table propuestas add column if not exists estrategia_fecha timestamptz;
alter table propuestas add column if not exists revision text;
alter table propuestas add column if not exists revision_fecha timestamptz;
