import { BondComputed } from "./types";

// Supuestos explícitos de todo este módulo (mostrados también en la UI):
// - Redención al vencimiento asumida a 100% del valor nominal (a la par).
// - Cupón anual simplificado a partir del campo `cupon` (%), sin
//   prorratear frecuencias semestrales/trimestrales.
// - Si falta la duration modificada, se usa una duration de 5 años como
//   supuesto conservador para estimar sensibilidad a tasas.
// Es una herramienta de proyección para pensar escenarios, no una
// recomendación de inversión ni un cálculo de TIR exacto.

const DEFAULT_MOD_DURATION = 5;

export function yearsUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, diff / (1000 * 60 * 60 * 24 * 365));
}

function costoTotal(b: BondComputed) {
  return (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
}

export function simulateSellToday(b: BondComputed) {
  return {
    valorFinal: b.valor_mercado,
    ganancia: b.ganancia,
    rentabilidadPct: b.rentabilidad_pct,
  };
}

export function simulateHoldToMaturity(b: BondComputed) {
  const years = yearsUntil(b.proximo_vencimiento);
  const cuponAnual = ((b.cupon ?? 0) / 100) * b.valor_nominal * b.cantidad;
  const cuponesTotales = cuponAnual * years;
  const redencion = b.valor_nominal * b.cantidad;
  const costo = costoTotal(b);
  const valorFinal = redencion + cuponesTotales;
  const ganancia = valorFinal - costo;
  const rentabilidadPct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  const rentabilidadAnualizada =
    years > 0 && costo > 0 ? (Math.pow(valorFinal / costo, 1 / years) - 1) * 100 : rentabilidadPct;
  return { years, cuponesTotales, valorFinal, ganancia, rentabilidadPct, rentabilidadAnualizada };
}

export function simulateReinvestCoupons(b: BondComputed, reinvestRatePct: number) {
  const years = Math.round(yearsUntil(b.proximo_vencimiento));
  const cuponAnual = ((b.cupon ?? 0) / 100) * b.valor_nominal * b.cantidad;
  const r = reinvestRatePct / 100;
  let valorCupones = 0;
  for (let t = 1; t <= years; t++) {
    valorCupones += cuponAnual * Math.pow(1 + r, years - t);
  }
  const redencion = b.valor_nominal * b.cantidad;
  const costo = costoTotal(b);
  const valorFinal = redencion + valorCupones;
  const ganancia = valorFinal - costo;
  const rentabilidadPct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  return { years, valorCupones, valorFinal, ganancia, rentabilidadPct };
}

export function simulateRateChange(b: BondComputed, deltaBp: number) {
  const modDur = b.duration_modificada ?? b.duration ?? DEFAULT_MOD_DURATION;
  const pctPriceChange = -(modDur * (deltaBp / 10000)) * 100;
  const nuevoPrecio = b.precio_actual * (1 + pctPriceChange / 100);
  const nuevoValorMercado = (nuevoPrecio / 100) * b.valor_nominal * b.cantidad;
  const costo = costoTotal(b);
  const ganancia = nuevoValorMercado - costo;
  const rentabilidadPct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  return { nuevoPrecio, nuevoValorMercado, pctPriceChange, ganancia, rentabilidadPct, usedDefaultDuration: b.duration_modificada == null && b.duration == null };
}

export function simulatePriceChange(b: BondComputed, deltaPct: number) {
  const nuevoPrecio = b.precio_actual * (1 + deltaPct / 100);
  const nuevoValorMercado = (nuevoPrecio / 100) * b.valor_nominal * b.cantidad;
  const costo = costoTotal(b);
  const ganancia = nuevoValorMercado - costo;
  const rentabilidadPct = costo !== 0 ? (ganancia / costo) * 100 : 0;
  return { nuevoPrecio, nuevoValorMercado, ganancia, rentabilidadPct };
}

export function simulateFxChange(b: BondComputed, deltaPct: number) {
  // deltaPct = variación asumida del dólar frente a la moneda del bono.
  // Si el bono ya está en USD, no hay efecto de tipo de cambio.
  if (b.moneda === "USD") {
    return { nuevoValorMercadoUsd: b.valor_mercado, ganancia: b.ganancia, aplica: false };
  }
  const factor = 1 + deltaPct / 100;
  const nuevoValorMercadoUsd = b.valor_mercado / factor;
  const costo = costoTotal(b);
  const ganancia = nuevoValorMercadoUsd - costo;
  return { nuevoValorMercadoUsd, ganancia, aplica: true };
}
