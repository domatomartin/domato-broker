import { Bond, BondComputed } from "./types";

export function computeBond(b: Bond): BondComputed {
  const valor_mercado = (b.precio_actual / 100) * b.valor_nominal * b.cantidad;
  const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
  const ganancia = valor_mercado - costo;
  const rentabilidad_pct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  return { ...b, valor_mercado, ganancia, rentabilidad_pct };
}

export function computePortfolio(bonds: Bond[]): BondComputed[] {
  return bonds.map(computeBond);
}

// Totales agrupados por moneda: antes se sumaba todo junto (UYU + USD + UI
// en un solo número), lo cual no tiene sentido financiero. Ahora se arma un
// objeto con un total independiente por cada moneda presente en la cartera.
export type TotalesPorMoneda = Record
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
