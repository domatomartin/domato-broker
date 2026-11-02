-- Notificaciones push: dispositivos suscriptos y configuración interna (claves VAPID que genera el servidor).
-- RLS activado SIN políticas: solo la service role (las rutas /api) puede leer o escribir.
create table if not exists push_subs (
  endpoint text primary key,
  keys jsonb not null,
  dispositivo text,
  creado timestamptz not null default now()
);
create table if not exists app_config (
  clave text primary key,
  valor jsonb not null,
  actualizado timestamptz not null default now()
);
alter table push_subs enable row level security;
alter table app_config enable row level security;
