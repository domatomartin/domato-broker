-- Propuestas compartidas en el portal y aceptadas online por el cliente.
alter table portal_links alter column cuenta drop not null;
alter table portal_links add column if not exists propuesta_id uuid references propuestas(id) on delete cascade;
alter table propuestas add column if not exists aceptacion jsonb;
