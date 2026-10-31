-- Obligaciones locales: tasas de los suplementos/condiciones de emisión (BROU, BVM, prensa).
-- Las series con tasa escalonada llevan el promedio de la tasa que resta hasta el vencimiento (TIR aproximada).
update instrumentos as i set cupon_manual = v.cupon, frecuencia = 2
from (values
  -- CONAPROLE (Conahorro III/IV, USD, intereses semestrales)
  ('UYONCO163US1', 3.0),   -- Serie 19, 21/12/26: 3% en 2025-2026
  ('UYONCO166US4', 3.0),   -- Serie 20, 22/03/27: 3%
  ('UYONCO168US0', 5.0),   -- Serie 21, 21/06/27: 5% desde 06/2026
  ('UYONCO170US6', 5.0),   -- IV S1, 20/09/27: 5% desde 09/2026
  ('UYONCO172US2', 4.95),  -- IV S2, 20/12/27: 4,5% 2026 y 5% 2027
  ('UYONCO173US0', 4.8),   -- IV S3, 20/03/28: 4,5% a 03/27 y 5% a 03/28
  ('UYONCO175US5', 5.49),  -- IV S4 84m, 20/06/30: escalonada hasta 6%
  ('UYONCO178US9', 5.28),  -- IV S5 84m, 20/09/30: escalonada hasta 6%
  ('UYONCO208US4', 4.75),  -- 60m, 20/03/30
  ('UYONCO210US0', 4.5),   -- 60m, 20/06/30
  ('UYONCO213US4', 4.25),  -- 60m, 20/09/30
  ('UYONCO218US3', 4.25),  -- 60m, 20/12/30
  ('UYONCO186US2', 4.71),  -- IV S7 84m, 20/03/31: 4,5% / 4,75% / 5%
  ('UYONCO227US4', 4.25),  -- 60m, 20/03/31
  ('UYONCO188US8', 4.86),  -- IV S8 84m, 20/06/31: 4,75% y 5% desde 06/29
  ('UYONCO195US3', 4.86),  -- IV S9 84m, 22/09/31: 4,75% y 5% desde 09/29
  ('UYONCO247US2', 4.5),   -- IV S17 60m, 22/09/31
  ('UYONCO200US1', 4.75),  -- IV S10 84m, 22/12/31
  -- UTE
  ('UYONUT199US8', 5.22),  -- Parque solar, USD, 17/12/29: 5,125% / 5,25% / 5,375%
  ('UYONUT183UI3', 3.725), -- Serie A UI, 22/12/45 (amortiza en los últimos 3 años)
  ('UYONUT228UI6', 3.2),   -- Serie A UI, 14/04/45 (amortiza en los últimos 3 años)
  ('UYONUT184UP6', 2.2),   -- Serie B UP, 22/12/48
  ('UYONUT229UP9', 2.0)    -- Serie B UP, 14/04/51
) as v(isin, cupon)
where i.isin = v.isin;
