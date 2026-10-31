-- Bonos alemanes (Bund) y emisiones de multilaterales que la BVM lista en euros/dólares
-- pero cotizan en reales (R$) o pesos colombianos (COP), según la ficha de la BVM y Borsa Italiana.
update instrumentos as i set cupon_manual = v.cupon, vencimiento_manual = coalesce(v.vto::date, i.vencimiento_manual), frecuencia = v.frec
from (values
  ('DE0001102341', 2.5,  '2046-08-15', 1),
  ('DE0001102499', 0.0,  '2030-02-15', 1),
  ('DE000BU2D004', 2.5,  '2054-08-15', 1),
  ('DE000BU2Z007', 2.3,  '2033-02-15', 1),
  ('DE000BU2Z049', 2.5,  '2035-02-15', 1),
  ('EU000A4EDR76', 11.0, null,         1),
  ('EU000A4EUYQ0', 11.25, null,        1),
  ('EU000A3L6Q42', 0.0,  '2035-02-20', 1),
  ('XS3238398245', 11.75, null,        1)
) as v(isin, cupon, vto, frec)
where i.isin = v.isin;

update instrumentos set moneda = 'BRL' where isin in (
  'EU000A4D7YR5','EU000A4EDR76','EU000A4EUYQ0','EU000A3L6Q42','XS3238398245',
  'XS3317523044','XS2875795945','XS3239974978','XS2438631710','XS2436920321',
  'XS2920414112','XS2431032403','XS2934329967','XS1621760302');
update instrumentos set moneda = 'COP' where isin in ('XS3293838655','XS2991233086');
