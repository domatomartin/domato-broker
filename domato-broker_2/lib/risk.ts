import { BondComputed, PatrimonioSnapshot } from "./types";

// --- Duration / convexidad ponderadas por valor de mercado -----------------
// Solo promedia los bonos que tienen el dato cargado; si ninguno lo tiene,
// devuelve null en vez de asumir un valor.

function weightedAverage(
  bonds: BondComputed[],
  pick: (b: BondComputed) => number | null
): number | null {
  const withValue = bonds.filter(
    (b) => pick(b) != null && b.valor_mercado > 0
  );
  const total = withValue.reduce((s, b) => s + b.valor_mercado, 0);
  if (total === 0) return null;
  return (
    withValue.reduce((s, b) => s + (pick(b) as number) * b.valor_mercado, 0) /
    total
  );
}

export function portfolioDuration(bonds: BondComputed[]) {
  return weightedAverage(bonds, (b) => b.duration);
}

export function portfolioModifiedDuration(bonds: BondComputed[]) {
  return weightedAverage(bonds, (b) => b.duration_modificada ?? b.duration);
}

export function portfolioConvexity(bonds: BondComputed[]) {
  return weightedAverage(bonds, (b) => b.convexidad);
}

// --- Concentración -----------------------------------------------------

export type ConcentrationSlice = { label: string; valor: number; pct: number };

export function concentrationBy(
  bonds: BondComputed[],
  keyFn: (b: BondComputed) => string | null
): ConcentrationSlice[] {
  const total = bonds.reduce((s, b) => s + b.valor_mercado, 0);
  const map = new Map<string, number>();
  bonds.forEach((b) => {
    const key = keyFn(b) || "Sin dato";
    map.set(key, (map.get(key) ?? 0) + b.valor_mercado);
  });
  return Array.from(map.entries())
    .map(([label, valor]) => ({
      label,
      valor,
      pct: total !== 0 ? (valor / total) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

export function durationBucket(duration: number | null): string {
  if (duration == null) return "Sin dato";
  if (duration < 2) return "0–2 años";
  if (duration < 5) return "2–5 años";
  if (duration < 10) return "5–10 años";
  return "10+ años";
}

// --- Value at Risk -------------------------------------------------------
// Dos métodos, mostrados juntos: histórico (a partir del propio track record
// de patrimonio_snapshots) y paramétrico (a partir de la duration modificada
// y un supuesto de volatilidad de tasas). El histórico es más confiable en
// cuanto haya ~3 meses de historial; hasta entonces el paramétrico sirve de
// referencia.

export function historicalDailyVaR(
  snapshots: PatrimonioSnapshot[],
  confidence = 0.95
): number | null {
  if (snapshots.length < 15) return null;
  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1].valor_total;
    const cur = snapshots[i].valor_total;
    if (prev > 0) returns.push((cur - prev) / prev);
  }
  if (returns.length < 10) return null;
  returns.sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - confidence) * returns.length));
  return returns[idx]; // fracción negativa, ej. -0.021 = -2.1% en el peor 5%
}

export function parametricDailyVaR(
  modifiedDuration: number | null,
  dailyYieldVolBp = 8,
  zScore = 1.65 // 95% one-tailed
): number | null {
  if (modifiedDuration == null) return null;
  const yieldShift = dailyYieldVolBp / 10000; // bp -> fracción
  return -(modifiedDuration * yieldShift * zScore);
}

// --- Benchmark -------------------------------------------------------------
// Retornos anuales de referencia. Son supuestos editables, no una fuente de
// datos en vivo: no existe una API pública gratuita de los primeros dos, y
// los índices de EEUU se muestran también en Mercados con su cotización del
// día — acá se usan como referencia de retorno anualizado de largo plazo.

export const BENCHMARKS: { key: string; label: string; annualReturnPct: number }[] = [
  { key: "ubi", label: "Índice de Bonos Uruguayos (referencia)", annualReturnPct: 6.5 },
  { key: "ust10", label: "Bonos del Tesoro EEUU (10 años)", annualReturnPct: 4.3 },
  { key: "sp500", label: "S&P 500 (promedio histórico)", annualReturnPct: 10.0 },
  { key: "inflacion_uy", label: "Inflación Uruguay (BCU, referencia)", annualReturnPct: 5.0 },
];

export function annualizedPortfolioReturn(
  snapshots: PatrimonioSnapshot[]
): number | null {
  if (snapshots.length < 2) return null;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const years =
    (new Date(last.fecha).getTime() - new Date(first.fecha).getTime()) /
    (1000 * 60 * 60 * 24 * 365);
  if (years <= 0 || first.valor_total <= 0) return null;
  return (Math.pow(last.valor_total / first.valor_total, 1 / years) - 1) * 100;
}
