-- Histórico de precios del vector BCU por título (para los gráficos sin consultar la BVM cada vez).
-- Lo escriben /api/historico y el cron diario con la service role; RLS sin políticas.
create table if not exists precios_historicos (
  isin text not null,
  fecha date not null,
  precio numeric not null,
  primary key (isin, fecha)
);
create table if not exists precios_cobertura (
  isin text primary key,
  desde date not null
);
alter table precios_historicos enable row level security;
alter table precios_cobertura enable row level security;
