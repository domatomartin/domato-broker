import { Bond, BondComputed } from "./types";

export function calcInteresCorrido(b: Bond): number {
  if (!b.cupon || b.cupon <= 0 || !b.proximo_pago_interes) return 0;
  const freq = (b.frecuencia && b.frecuencia > 0) ? b.frecuencia : 2;
  const diasCiclo = 365 / freq;
  const fechaPago = new Date(b.proximo_pago_interes);
  const hoy = new Date();
  const diasTranscurridos = diasCiclo - Math.max(0, (fechaPago.getTime() - hoy.getTime()) / 86400000);
  const fraccion = Math.max(0, Math.min(diasTranscurridos / diasCiclo, 1));
  return (b.cupon / 100 / freq) * b.valor_nominal * b.cantidad * fraccion;
}

export function computeBond(b: Bond): BondComputed {
  const valor_mercado = (b.precio_actual / 100) * b.valor_nominal * b.cantidad;
  const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
  const ganancia = valor_mercado - costo;
  const rentabilidad_pct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  const interes_corrido = calcInteresCorrido(b);
  return { ...b, valor_mercado, ganancia, rentabilidad_pct, interes_corrido };
}

export function computePortfolio(bonds: Bond[]): BondComputed[] {
  return bonds.map(computeBond);
}

export type TotalesPorMoneda = Record<
  string,
  {
    valorTotal: number;
    costoTotal: number;
    gananciaTotal: number;
    rentabilidadTotal: number;
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
      };
    }
    const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
    porMoneda[moneda].valorTotal += b.valor_mercado;
    porMoneda[moneda].costoTotal += costo;
  }

  for (const moneda of Object.keys(porMoneda)) {
    const t = porMoneda[moneda];
    t.gananciaTotal = t.valorTotal - t.costoTotal;
    t.rentabilidadTotal = t.costoTotal !== 0 ? (t.gananciaTotal / t.costoTotal) * 100 : 0;
  }

  return porMoneda;
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, decimals = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
