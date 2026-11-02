-- 1) Columnas nuevas: ocultar del catálogo (reversible) y notas de valuación por título.
alter table instrumentos add column if not exists oculto boolean not null default false;
alter table instrumentos add column if not exists notas text;

-- 2) Fideicomiso CASH III (pesos, corto plazo): tasa deducida del cupón corrido del vector BCU.
update instrumentos as i set
  cupon_manual = coalesce(i.cupon_manual, v.cupon),
  frecuencia = coalesce(i.frecuencia, 12),
  vencimiento_manual = coalesce(i.vencimiento_manual, v.vto)
from (values
  ('UYFFAM248UY3', 11.5, date '2027-03-22'),
  ('UYFFAM249UY1', 12.5, date '2027-04-20'),
  ('UYFFAM250UY9', 13.5, date '2027-04-20')
) as v(isin, cupon, vto)
where i.isin = v.isin and i.cupon is null;

-- 3) Parques eólicos (certificados de participación, renta variable): rendimiento estimado según CARE.
update instrumentos set
  rendimiento_estimado = 7.7,
  vencimiento_manual = date '2037-06-30',
  frecuencia = 1,
  notas = 'Parque eólico Pampa (UTE, 141 MW). CP por USD 97 MM emitidos en 2015 (Serie A USD 15 MM, Serie B USD 82 MM). '
       || 'Distribuye una vez por año, en abril: 2024 USD 7,6 MM; 2025 USD 13,8 MM (19,70 cada 100 nominales residuales); 2026 USD 9,7 MM. '
       || 'Acumulado a abril 2026: USD 89,2 MM (92% de la emisión), de los que USD 27 MM fueron devolución de capital. '
       || 'TIR desde la emisión: prospecto 11,5%; operador 10,25%; CARE (set-2026) 6,5% a 8,7% según producción, 7,7% con el promedio real. '
       || 'El fideicomiso termina 3 meses después del contrato con UTE (20 años desde 2017). '
       || 'Ojo: el rendimiento estimado es sobre la emisión a la par; comprando al precio de mercado (por encima de 100) el rendimiento es menor. '
       || 'Fuente: CARE, actualización setiembre 2026; informe del fiduciario al 30/06/2025.'
where isin in ('UYFFRA027US8', 'UYFFRA028US6');

update instrumentos set
  rendimiento_estimado = 7.0,
  vencimiento_manual = date '2037-12-31',
  frecuencia = 2,
  notas = 'Parque eólico Arias (UTE, 70 MW, Flores). CP por USD 53,6 MM suscritos en diciembre 2015. '
       || 'Distribuye dos veces por año (mayo y diciembre). Acumulado a mayo 2026: USD 62,55 MM, más que la emisión; '
       || 'ya se devolvió cerca del 61% del capital (queda unos USD 21 MM). Mayo 2026: USD 3,3 MM. '
       || 'TIR desde la emisión: prospecto 10,4%; operador 9,15%; CARE (set-2026) 6,0% a 9,2% según producción, 7,0% con el promedio real (escenario piso de CARE). '
       || 'Contrato con UTE por 20 años; el préstamo bancario termina en noviembre 2035. '
       || 'Ojo: el rendimiento estimado es sobre la emisión a la par; comprando al precio de mercado (por encima de 100) el rendimiento es menor. '
       || 'Fuente: CARE, actualización setiembre 2026.'
where isin = 'UYFFRA051US8';

-- 4) Ocultar los títulos que el vector lista sin descripción, sin vencimiento y sin tasa (no se pueden valuar).
--    Nunca se ocultan títulos que estén en alguna cartera. Se pueden volver a mostrar desde Opciones.
update instrumentos as i set oculto = true
where i.isin like 'UY%'
  and (i.nombre = i.isin or i.nombre is null or i.nombre = '')
  and coalesce(i.vencimiento_manual, i.vencimiento) is null
  and coalesce(i.cupon_manual, i.cupon) is null
  and i.rendimiento_estimado is null
  and not exists (select 1 from bonds b where b.isin = i.isin);

select count(*) filter (where oculto) as ocultos,
       count(*) filter (where not oculto and coalesce(cupon_manual, cupon, rendimiento_estimado) is not null
                        and coalesce(vencimiento_manual, vencimiento) is not null) as completos_visibles,
       count(*) filter (where not oculto) as visibles
from instrumentos;
