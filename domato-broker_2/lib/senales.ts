// Señales de alerta de la estrategia, en formato que se puede evaluar todos los días.

import type { FotoMercado } from "@/lib/mercado";

export type Senal = {
  indicador: string;          // id de mercado (TNX, UYU, VIX…) o "PRECIO:<ISIN>"
  condicion: ">" | "<";
  umbral: number;
  descripcion: string;        // "Treasury 10 años supera 5,5%"
  accion: string;             // qué hacer si se activa
};

export type SenalEvaluada = Senal & { valor: number | null; activa: boolean };
export type EstadoSenales = { fecha: string; evaluadas: SenalEvaluada[] };

export const INDICADORES: Record<string, string> = {
  IRX: "Tasa Letras EE.UU. 3 meses (%)",
  FVX: "Treasury 5 años (%)",
  TNX: "Treasury 10 años (%)",
  TYX: "Treasury 30 años (%)",
  DXY: "Índice dólar (DXY)",
  UYU: "Dólar en Uruguay (UYU por USD)",
  BRL: "Dólar en Brasil (BRL por USD)",
  EURUSD: "Euro (USD por EUR)",
  VIX: "Volatilidad (VIX)",
  SPX: "S&P 500",
  WTI: "Petróleo WTI",
  ORO: "Oro",
};

/** Lee y valida la lista de señales que devuelve la IA (descarta las mal formadas). */
export function normalizarSenales(x: unknown): Senal[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => s as Partial<Senal>)
    .filter((s) => typeof s.indicador === "string" && (s.condicion === ">" || s.condicion === "<") && Number.isFinite(Number(s.umbral)))
    .filter((s) => INDICADORES[s.indicador!] || /^PRECIO:[A-Z0-9]{12}$/.test(s.indicador!))
    .map((s) => ({ indicador: s.indicador!, condicion: s.condicion!, umbral: Number(s.umbral), descripcion: String(s.descripcion ?? "").slice(0, 200), accion: String(s.accion ?? "").slice(0, 300) }))
    .slice(0, 10);
}

export function evaluarSenales(senales: Senal[], foto: FotoMercado | null, precios: Record<string, number | null>): SenalEvaluada[] {
  return senales.map((s) => {
    let valor: number | null = null;
    if (s.indicador.startsWith("PRECIO:")) valor = precios[s.indicador.slice(7)] ?? null;
    else valor = foto?.datos.find((d) => d.id === s.indicador)?.valor ?? null;
    const activa = valor != null && (s.condicion === ">" ? valor > s.umbral : valor < s.umbral);
    return { ...s, valor, activa };
  });
}
