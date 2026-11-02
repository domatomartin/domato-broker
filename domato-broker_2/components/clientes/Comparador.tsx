"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { analizarBono, hoyIso } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";
import { aUSD, type TasasFx } from "@/lib/fx";
import type { Costos } from "@/lib/costos";
import { cobrosDeCartera, type BondConPropuesta, type Posicion, type ResumenEstado } from "@/lib/estadoCuenta";

export type FilaCliente = {
  c: string;
  nombre: string;
  bonds: BondConPropuesta[];
  pos: Posicion[];
  res: ResumenEstado;
  tir: number | null;
  riesgo?: string | null;
};

type Metricas = {
  valorUSD: number;
  resultadoPct: number | null;
  tirCompra: number | null;
  tirHoy: number | null;
  duration: number | null;
  soberanoPct: number;
  topEmisor: { k: string; pct: number } | null;
  cobros12USD: number;
  capital12USD: number;
  titulos: number;
  monedas: string;
};

function metricas(f: FilaCliente, instrumentos: Map<string, Instrumento>, tasas: TasasFx | null, costos: Costos, emisor: (n: string, i: string | null) => string): Metricas {
  const usd = (v: number, m: string) => (tasas ? aUSD(v, m, tasas) : v);
  let sT = 0, sD = 0, w = 0;
  const em = new Map<string, number>();
  for (const p of f.pos) {
    const peso = p.valorHoy * p.fxHoy;
    const ins = p.bond.isin ? instrumentos.get(p.bond.isin) : undefined;
    em.set(emisor(p.bond.nombre, p.bond.isin), (em.get(emisor(p.bond.nombre, p.bond.isin)) ?? 0) + peso);
    if (!ins) continue;
    const e = efectivo(ins);
    const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.variable ? 100 : (p.bond.precio_actual || e.precio), amortizaciones: e.amortizaciones, escalonado: e.escalonado });
    if (a.tir != null && a.duration != null) { sT += a.tir * peso; sD += a.duration * peso; w += peso; }
  }
  const hoy = hoyIso();
  const enUnAnio = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();
  const prox = cobrosDeCartera(f.bonds, costos, instrumentos).filter((x) => x.fecha > hoy && x.fecha <= enUnAnio);
  const top = [...em.entries()].sort((a, b) => b[1] - a[1])[0];
  const valor = f.res.valorUSD;
  return {
    valorUSD: valor,
    resultadoPct: f.res.invertidoUSD ? (f.res.resultadoUSD / f.res.invertidoUSD) * 100 : null,
    tirCompra: f.tir,
    tirHoy: w ? sT / w : null,
    duration: w ? sD / w : null,
    soberanoPct: valor ? (f.pos.filter((p) => p.grupo === "Uruguay soberano").reduce((s, p) => s + p.valorHoy * p.fxHoy, 0) / valor) * 100 : 0,
    topEmisor: top && valor ? { k: top[0], pct: (top[1] / valor) * 100 } : null,
    cobros12USD: prox.reduce((s, x) => s + usd(x.total, x.moneda), 0),
    capital12USD: prox.reduce((s, x) => s + usd(x.capital, x.moneda), 0),
    titulos: f.pos.length,
    monedas: f.res.porMoneda.map((m) => `${m.moneda} ${m.pctCartera.toFixed(0)}%`).join(" · "),
  };
}

const FILAS: { label: string; hint?: string; v: (m: Metricas) => string; mejor?: "max" | "min"; num?: (m: Metricas) => number | null }[] = [
  { label: "Valor hoy", v: (m) => fmtMonto(m.valorUSD, "USD") },
  { label: "Resultado", hint: "precio + cobros − invertido", v: (m) => (m.resultadoPct == null ? "—" : `${m.resultadoPct >= 0 ? "+" : ""}${fmtNum(m.resultadoPct, 2, "%")}`), mejor: "max", num: (m) => m.resultadoPct },
  { label: "TIR de compra", hint: "neta, ponderada", v: (m) => fmtNum(m.tirCompra, 2, "%"), mejor: "max", num: (m) => m.tirCompra },
  { label: "TIR a precios de hoy", hint: "lo que rinde de acá al vencimiento", v: (m) => fmtNum(m.tirHoy, 2, "%"), mejor: "max", num: (m) => m.tirHoy },
  { label: "Duration", hint: "años; más alta = más sensible a tasas", v: (m) => fmtNum(m.duration, 1), mejor: "min", num: (m) => m.duration },
  { label: "Deuda soberana uruguaya", v: (m) => fmtNum(m.soberanoPct, 0, "%") },
  { label: "Mayor emisor", hint: "concentración", v: (m) => (m.topEmisor ? `${m.topEmisor.k.slice(0, 22)} ${fmtNum(m.topEmisor.pct, 0, "%")}` : "—"), mejor: "min", num: (m) => m.topEmisor?.pct ?? null },
  { label: "Cobros próximos 12 meses", hint: "USD eq., netos", v: (m) => fmtMonto(m.cobros12USD, "USD") },
  { label: "Capital que vuelve en 12 meses", hint: "a reinvertir", v: (m) => (m.capital12USD ? fmtMonto(m.capital12USD, "USD") : "—") },
  { label: "Títulos", v: (m) => String(m.titulos) },
  { label: "Monedas", v: (m) => m.monedas },
];

export default function Comparador({
  filas, instrumentos, tasas, costos, emisor,
}: {
  filas: FilaCliente[];
  instrumentos: Map<string, Instrumento>;
  tasas: TasasFx | null;
  costos: Costos;
  emisor: (n: string, i: string | null) => string;
}) {
  const [sel, setSel] = useState<string[]>(() => filas.slice(0, 3).map((f) => f.c));
  const elegidas = filas.filter((f) => sel.includes(f.c));
  const ms = useMemo(() => elegidas.map((f) => ({ f, m: metricas(f, instrumentos, tasas, costos, emisor) })), [elegidas, instrumentos, tasas, costos, emisor]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {filas.map((f) => (
          <button
            key={f.c}
            type="button"
            onClick={() => setSel((s) => (s.includes(f.c) ? s.filter((x) => x !== f.c) : s.length >= 4 ? s : [...s, f.c]))}
            className={clsx("rounded-full px-3 py-1 text-xs font-medium", sel.includes(f.c) ? "bg-gold text-white" : "border border-ink-border text-muted hover:text-paper")}
          >
            {sel.includes(f.c) ? "✓ " : ""}{f.nombre}
          </button>
        ))}
      </div>
      {ms.length < 2 ? (
        <p className="text-xs text-muted">Elegí al menos dos clientes (hasta cuatro) para compararlos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-ink-border text-xs text-muted">
                <th className="px-2 py-2 text-left font-medium"></th>
                {ms.map(({ f }) => <th key={f.c} className="px-2 py-2 text-right font-semibold text-paper">{f.nombre}{f.riesgo && <span className="block text-[10px] font-normal capitalize text-muted">perfil {f.riesgo}</span>}</th>)}
              </tr>
            </thead>
            <tbody>
              {FILAS.map((r) => {
                const nums = r.num ? ms.map(({ m }) => r.num!(m)) : [];
                const validos = nums.filter((x): x is number => x != null);
                const objetivo = r.mejor && validos.length > 1 ? (r.mejor === "max" ? Math.max(...validos) : Math.min(...validos)) : null;
                return (
                  <tr key={r.label} className="border-b border-ink-border/50">
                    <td className="px-2 py-2 text-xs text-muted">{r.label}{r.hint && <span className="block text-[10px] opacity-80">{r.hint}</span>}</td>
                    {ms.map(({ f, m }, k) => (
                      <td key={f.c} className={clsx("px-2 py-2 text-right", objetivo != null && nums[k] === objetivo ? "font-semibold text-gain" : "text-paper")}>{r.v(m)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted">En verde, el mejor valor de cada fila (más rendimiento, menos riesgo de tasa o menos concentración). Importes en dólares al tipo de cambio de hoy.</p>
        </div>
      )}
    </div>
  );
}
