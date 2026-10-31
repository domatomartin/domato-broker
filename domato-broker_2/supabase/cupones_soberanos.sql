-- Cupones de Treasury y globales soberanos (fuente: prospectos/fichas por ISIN). Frecuencia semestral salvo indicación.
update instrumentos as i set cupon_manual = v.cupon, frecuencia = v.frec
from (values
  ('US912810FP85', 5.375, 2), ('US91282CGM73', 3.5, 2), ('US912810QV35', 3.125, 2), ('US912810TQ13', 3.875, 2),
  ('US9128286T26', 2.375, 2), ('US912810FM54', 6.25, 2), ('US9128284V99', 2.875, 2), ('US912810FJ26', 6.125, 2),
  ('US912828YB05', 1.625, 2), ('US912810SD19', 3.0, 2), ('US912810SJ88', 2.25, 2), ('US9128283F58', 2.25, 2),
  ('US105756AL40', 12.25, 2), ('US105756BR01', 5.625, 2), ('US105756BZ27', 4.625, 2), ('US105756CJ75', 7.125, 2),
  ('US105756AE07', 10.125, 2), ('US105756BB58', 8.25, 2), ('US105756BK57', 7.125, 2), ('US105756BY51', 5.625, 2),
  ('US105756BW95', 5.0, 2),
  ('US91086QAG38', 8.3, 2), ('US91086QAV05', 6.05, 2), ('US91087BAL45', 3.771, 2), ('US91087BAG59', 4.5, 2),
  ('XS0113419690', 9.75, 2), ('XS0468535637', 6.4, 2), ('XS0615236188', 5.75, 2), ('XS1405781854', 4.625, 2),
  ('US168863DT21', 2.55, 2), ('USP75744AB11', 6.1, 2),
  ('EU000A4D7YR5', 11.0, 1)
) as v(isin, cupon, frec)
where i.isin = v.isin;

-- El BEI 03/07/30 es en reales (BRL), no en euros.
update instrumentos set moneda = 'BRL' where isin = 'EU000A4D7YR5';

select isin, nombre, moneda, cupon_manual, frecuencia from instrumentos where cupon_manual is not null and updated_at is not null order by moneda, nombre;
