import { Bond, BondComputed } from "./types";

// ---------------------------------------------------------------------------
// Interés corrido (accrued interest)
// ---------------------------------------------------------------------------
// Usa el campo `frecuencia` del bono para calcular correctamente:
//   1 = anual, 2 = semestral, 4 = trimestral, 12 = mensual
// Si el campo no está disponible, infiere semestral por defecto.
// ---------------------------------------------------------------------------
export function calcInteresCorrido(b: Bond): number {
  if (!b.cupon || !b.proximo_pago_interes) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const proxPago = new Date(b.proximo_pago_interes);
  proxPago.setHours(0, 0, 0, 0);

  const diasHastaProxPago = Math.ceil(
    (proxPago.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diasHastaProxPago < 0) return 0;

  // Usar frecuencia explícita si existe, sino inferir por heurística
  const frecuencia = b.frecuencia && b.frecuencia > 0 ? b.frecuencia : null;
  const freq = frecuencia ?? (diasHastaProxPago > 183 ? 1 : 2);

  const diasPeriodo = Math.round(365 / freq);
  const diasTranscurridos = Math.max(0, diasPeriodo - diasHastaProxPago);
  const tasaPorPeriodo = (b.cupon / 100) / freq;

  return tasaPorPeriodo * b.valor_nominal * b.cantidad * (diasTranscurridos / diasPeriodo);
}

// ---------------------------------------------------------------------------
// Cálculo por bono
// ---------------------------------------------------------------------------
export function computeBond(b: Bond): BondComputed {
  const valor_mercado_limpio = (b.precio_actual / 100) * b.valor_nominal * b.cantidad;
  const interes_corrido = calcInteresCorrido(b);
  const valor_mercado = valor_mercado_limpio + interes_corrido;
  const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
  const ganancia = valor_mercado - costo;
  const rentabilidad_pct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  return { ...b, valor_mercado_limpio, interes_corrido, valor_mercado, ganancia, rentabilidad_pct };
}

export function computePortfolio(bonds: Bond[]): BondComputed[] {
  return bonds.map(computeBond);
}

// ---------------------------------------------------------------------------
// Totales por moneda
// ---------------------------------------------------------------------------
export type TotalesPorMoneda = Record<
  string,
  {
    valorTotal: number;
    costoTotal: number;
    gananciaTotal: number;
    rentabilidadTotal: number;
    interesCorrido: number;
  }
>;

export function portfolioTotals(bonds: BondComputed[]): TotalesPorMoneda {
  const porMoneda: TotalesPorMoneda = {};

  for (const b of bonds) {
    const moneda = b.moneda ?? "SIN_MONEDA";
    if (!porMoneda[moneda]) {
      porMoneda[moneda] = {
        valorTotal: 0,
        costoTotal: 0,
        gananciaTotal: 0,
        rentabilidadTotal: 0,
        interesCorrido: 0,
      };
    }
    const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
    porMoneda[moneda].valorTotal += b.valor_mercado;
    porMoneda[moneda].costoTotal += costo;
    porMoneda[moneda].interesCorrido += b.interes_corrido;
  }

  for (const moneda of Object.keys(porMoneda)) {
    const t = porMoneda[moneda];
    t.gananciaTotal = t.valorTotal - t.costoTotal;
    t.rentabilidadTotal =
      t.costoTotal !== 0 ? (t.gananciaTotal / t.costoTotal) * 100 : 0;
  }

  return porMoneda;
}

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------
export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, decimals = 2) {
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(decimals) + "%";
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
