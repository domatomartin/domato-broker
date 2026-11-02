-- Renta variable: distribución anual esperada cada 100 nominales (para calcular el rendimiento comprando hoy).
alter table instrumentos add column if not exists distribucion_estimada numeric;
-- Pampa: distribuciones cada 100 nominales residuales (saldo USD 70 MM desde 2024): 2024 10,85; 2025 19,70; 2026 13,85 → promedio 14,8.
update instrumentos set distribucion_estimada = 14.8 where isin in ('UYFFRA027US8','UYFFRA028US6');
