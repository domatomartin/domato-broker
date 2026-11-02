// Lista de seguimiento: títulos marcados con una condición de TIR o precio para recibir aviso.

import { analizarBono } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";

export type Seguido = {
  isin: string;
  tipo: "tir" | "precio";
  condicion: ">" | "<";
  umbral: number;
  nota: string | null;
  disparada: boolean;      // la condición se cumplía en la última revisión (para no repetir el aviso)
  ultima_revision: string | null;
  valor: number | null;    // último valor medido
  creado?: string;
};

export function valorActual(i: Instrumento, tipo: Seguido["tipo"]): number | null {
  const e = efectivo(i);
  if (tipo === "precio") return e.variable ? e.precioMercado ?? null : e.precio ?? null;
  const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.variable ? 100 : e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
  return a.tir;
}

export function cumple(s: Pick<Seguido, "condicion" | "umbral">, v: number | null) {
  return v != null && (s.condicion === ">" ? v > s.umbral : v < s.umbral);
}

export function describir(s: Pick<Seguido, "tipo" | "condicion" | "umbral">) {
  const que = s.tipo === "tir" ? "TIR" : "precio";
  const signo = s.condicion === ">" ? "sube de" : "baja de";
  return `${que} ${signo} ${s.umbral.toLocaleString("es-UY")}${s.tipo === "tir" ? "%" : ""}`;
}
