// Comparación de una propuesta contra alternativas simples: plazo fijo, Letras de EE.UU. y un soberano uruguayo de plazo parecido.

import { analizarBono } from "@/lib/bondMath";
import { efectivo, grupoDe, type Instrumento } from "@/lib/bvm";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, type Costos } from "@/lib/costos";

// Tasas efectivas anuales del BROU para personas, plazo fijo a 1 año por e-BROU (antes de IRPF).
// Fuente: brou.com.uy, tasas vigentes (pesos 01/10/2026, dólares 26/03/2026, UI 01/07/2026).
export const PLAZO_FIJO_BROU: Record<string, { tasa: number; vigencia: string }> = {
  USD: { tasa: 2.6, vigencia: "26/03/2026" },
  UYU: { tasa: 5.6, vigencia: "01/10/2026" },
  UI: { tasa: 1.6, vigencia: "01/07/2026" },
};

export type Alternativa = { nombre: string; tasa: number; nota: string; propuesta?: boolean };

export function alternativasPara(opts: {
  moneda: string;
  tirNeta: number | null;
  tirBruta: number | null;
  duration: number | null;
  catalogo: Instrumento[];
  costos: Costos;
  tbill: number | null;
}): Alternativa[] {
  const { moneda, tirNeta, tirBruta, duration, catalogo, costos, tbill } = opts;
  const filas: Alternativa[] = [];
  if (tirNeta != null) filas.push({ nombre: "Esta propuesta", tasa: tirNeta, nota: `neta de costos e IRPF${tirBruta != null ? ` (bruta ${tirBruta.toFixed(2)}%)` : ""}`, propuesta: true });
  const pf = PLAZO_FIJO_BROU[moneda];
  if (pf) filas.push({ nombre: "Plazo fijo BROU a 1 año", tasa: pf.tasa, nota: `e-BROU, tasa vigente desde ${pf.vigencia}, antes de IRPF` });
  if (moneda === "USD" && tbill != null) filas.push({ nombre: "Letras del Tesoro de EE.UU.", tasa: tbill, nota: "3 meses, tasa de hoy, renovando" });
  // Soberano uruguayo de la misma moneda con duration parecida (neto de costos e IRPF, como la propuesta).
  let mejor: { i: Instrumento; tir: number; dur: number } | null = null;
  for (const i of catalogo) {
    if (i.oculto || i.moneda !== moneda || grupoDe(i) !== "Uruguay soberano") continue;
    const e = efectivo(i);
    if (e.letra || e.variable) continue;
    const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
    if (!a.completo || a.duration == null || a.tir == null) continue;
    const neto = aplicarCostos(a, nominalNetoParaMonto(a, 10000, costos), costos, irpfDe(costos, i));
    const tir = neto?.tirNeta ?? a.tir;
    const objetivo = duration ?? 3;
    if (!mejor || Math.abs(a.duration - objetivo) < Math.abs(mejor.dur - objetivo)) mejor = { i, tir, dur: a.duration };
  }
  if (mejor) filas.push({ nombre: `Solo deuda uruguaya: ${mejor.i.nombre}`, tasa: mejor.tir, nota: `plazo parecido (duration ${mejor.dur.toFixed(1)}), neto de costos` });
  return filas;
}

/** Ganancia compuesta de un monto a una tasa anual durante `anios`. */
export const gananciaEn = (monto: number, tasa: number, anios: number) => monto * (Math.pow(1 + tasa / 100, anios) - 1);
