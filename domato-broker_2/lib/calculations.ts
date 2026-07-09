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

export function portfolioTotals(bonds: BondComputed[]) {
  const valorTotal = bonds.reduce((sum, b) => sum + b.valor_mercado, 0);
  const costoTotal = bonds.reduce(
    (sum, b) => sum + (b.precio_compra / 100) * b.valor_nominal * b.cantidad,
    0
  );
  const gananciaTotal = valorTotal - costoTotal;
  const rentabilidadTotal = costoTotal !== 0 ? (gananciaTotal / costoTotal) * 100 : 0;
  return { valorTotal, costoTotal, gananciaTotal, rentabilidadTotal };
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
