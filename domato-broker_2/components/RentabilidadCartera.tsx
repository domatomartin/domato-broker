"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { analizarBono, hoyIso } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";
import type { Costos } from "@/lib/costos";
import { cobrosDeBono, type BondConPropuesta, type Posicion } from "@/lib/estadoCuenta";

type Serie = { fecha: string; valor: number; invertido: number; ref: number };
const AZUL = "#2a78d6", NARANJA = "#eb6834";

/**
 * Rentabilidad histórica de una cartera reconstruida con los precios del vector BCU de cada día:
 * valor de los títulos (precio + cupón corrido) + cobros ya recibidos, contra lo invertido
 * y contra una referencia (Letras del Tesoro de EE.UU. a la tasa de hoy).
 */
export default function RentabilidadCartera({ bonds, pos, instrumentos, costos }: { bonds: BondConPropuesta[]; pos: Posicion[]; instrumentos: Map<string, Instrumento>; costos: Costos }) {
  const [historias, setHistorias] = useState<Record<string, Map<string, number>> | null>(null);
  const [tasaRef, setTasaRef] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const hoy = hoyIso();
  const inicio = pos.reduce((m, p) => { const f = (p.bond.fecha_compra ?? p.bond.created_at ?? hoy).slice(0, 10); return f < m ? f : m; }, hoy);
  const claveIsins = pos.map((p) => p.bond.isin).filter(Boolean).sort().join(",");

  useEffect(() => {
    let vivo = true;
    const anios = Math.max(1, Math.ceil((Date.now() - Date.parse(inicio)) / (365.25 * 86_400_000)));
    const isins = [...new Set(pos.map((p) => p.bond.isin).filter((x): x is string => !!x))];
    Promise.all(isins.map((i) => fetch(`/api/historico?isin=${i}&anios=${anios}`).then((r) => r.json()).catch(() => null))).then((rs) => {
      if (!vivo) return;
      const h: Record<string, Map<string, number>> = {};
      rs.forEach((r, k) => { if (r?.puntos) h[isins[k]] = new Map(r.puntos.map((p: { fecha: string; precio: number }) => [p.fecha, p.precio])); });
      setHistorias(h);
    });
    fetch("/api/mercado").then((r) => r.json()).then((m) => vivo && setTasaRef(m?.datos?.find((d: { id: string }) => d.id === "IRX")?.valor ?? 4)).catch(() => vivo && setTasaRef(4));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveIsins, inicio]);

  const serie: Serie[] = useMemo(() => {
    if (!historias || tasaRef == null) return [];
    const fechas = [...new Set(Object.values(historias).flatMap((m) => [...m.keys()]))].filter((f) => f >= inicio).sort();
    if (!fechas.length) return [];
    const paso = Math.max(1, Math.floor(fechas.length / 120));
    const muestras = fechas.filter((_, k) => k % paso === 0 || k === fechas.length - 1);
    const ultimo: Record<string, number> = {};
    const cobros = pos.map((p) => cobrosDeBono(p.bond, costos, p.bond.isin ? instrumentos.get(p.bond.isin) : null));
    const out: Serie[] = [];
    let k = 0;
    for (const f of fechas) {
      for (const [isin, m] of Object.entries(historias)) { const v = m.get(f); if (v != null) ultimo[isin] = v; }
      if (muestras[k] !== f) continue;
      k++;
      let valor = 0, invertido = 0, ref = 0;
      pos.forEach((p, j) => {
        const compra = (p.bond.fecha_compra ?? p.bond.created_at ?? hoy).slice(0, 10);
        if (compra > f) return;
        const ins = p.bond.isin ? instrumentos.get(p.bond.isin) : undefined;
        const precio = (p.bond.isin && ultimo[p.bond.isin]) || p.bond.precio_compra;
        let corrido = 0;
        if (ins) {
          const e = efectivo(ins);
          if (!e.variable) corrido = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado }, f).interesCorrido;
        }
        const cobrado = cobros[j].filter((c) => c.fecha > compra && c.fecha <= f).reduce((s, c) => s + c.total, 0);
        // Todo en dólares al tipo de cambio de hoy, para aislar el resultado de los precios y cupones.
        valor += ((p.vn * (precio + corrido)) / 100 + cobrado) * p.fxHoy;
        const inv = p.invertido * p.fxHoy;
        invertido += inv;
        ref += inv * Math.pow(1 + tasaRef / 100, (Date.parse(f) - Date.parse(compra)) / (365.25 * 86_400_000));
      });
      if (invertido > 0) out.push({ fecha: f, valor, invertido, ref });
    }
    return out;
  }, [historias, tasaRef, pos, costos, instrumentos, inicio, hoy]);

  if (!pos.length) return null;
  if (!historias || tasaRef == null) return <div className="h-48 animate-pulse rounded-xl bg-ink" />;
  if (serie.length < 2) return <p className="text-sm text-muted">Todavía no hay suficiente historia de precios desde la compra ({fmtFecha(inicio)}). El gráfico se completa solo con los días.</p>;

  const pct = (s: Serie) => (s.valor / s.invertido - 1) * 100;
  const pctRef = (s: Serie) => (s.ref / s.invertido - 1) * 100;
  const W = 720, H = 220, PL = 44, PR = 12, PT = 12, PB = 26;
  const ys = serie.flatMap((s) => [pct(s), pctRef(s), 0]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max((hi - lo) * 0.15, 0.3); lo -= pad; hi += pad;
  const t0 = Date.parse(serie[0].fecha), t1 = Date.parse(serie[serie.length - 1].fecha);
  const x = (f: string) => PL + ((Date.parse(f) - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const linea = (fn: (s: Serie) => number) => serie.map((s, i) => `${i ? "L" : "M"}${x(s.fecha).toFixed(1)},${y(fn(s)).toFixed(1)}`).join("");
  const ult = serie[serie.length - 1];
  const h = hover != null ? serie[hover] : null;
  const ticksY = Array.from({ length: 4 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const nX = Math.min(5, serie.length);
  const ticksX = Array.from({ length: nX }, (_, k) => serie[Math.round((k * (serie.length - 1)) / Math.max(1, nX - 1))].fecha);

  function mover(ev: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0, d = Infinity;
    serie.forEach((s, i) => { const dd = Math.abs(x(s.fecha) - px); if (dd < d) { d = dd; best = i; } });
    setHover(best);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato label="Rentabilidad de la cartera" valor={`${pct(ult) >= 0 ? "+" : ""}${fmtNum(pct(ult), 2, "%")}`} tono={pct(ult) >= 0 ? "gain" : "loss"} sub={`desde ${fmtFecha(serie[0].fecha)}`} />
        <Dato label="Referencia: Letras EE.UU." valor={`+${fmtNum(pctRef(ult), 2, "%")}`} sub={`al ${fmtNum(tasaRef, 2)}% anual`} />
        <Dato label="Diferencia" valor={`${pct(ult) - pctRef(ult) >= 0 ? "+" : ""}${fmtNum(pct(ult) - pctRef(ult), 2)} pts`} tono={pct(ult) - pctRef(ult) >= 0 ? "gain" : "loss"} />
        <Dato label="Valor + cobros" valor={fmtMonto(ult.valor, "USD")} sub={`invertido ${fmtMonto(ult.invertido, "USD")}`} />
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: AZUL }} />Cartera</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: NARANJA }} />Letras del Tesoro EE.UU.</span>
      </div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHover(null)} role="img" aria-label="Rentabilidad acumulada de la cartera">
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#E5E7EB" />
              <text x={PL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6E7684">{fmtNum(v, 1)}%</text>
            </g>
          ))}
          <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="#94A3B8" strokeWidth="1" />
          {ticksX.map((f, k) => <text key={f + k} x={x(f)} y={H - 8} textAnchor={k === 0 ? "start" : k === nX - 1 ? "end" : "middle"} fontSize="10" fill="#6E7684">{fmtFecha(f).slice(0, 5)}</text>)}
          <path d={linea(pctRef)} fill="none" stroke={NARANJA} strokeWidth="2" strokeDasharray="6 5" />
          <path d={linea(pct)} fill="none" stroke={AZUL} strokeWidth="2" strokeLinejoin="round" />
          {h && (
            <g>
              <line x1={x(h.fecha)} x2={x(h.fecha)} y1={PT} y2={H - PB} stroke="#171A21" strokeOpacity="0.3" />
              <circle cx={x(h.fecha)} cy={y(pct(h))} r="4.5" fill={AZUL} stroke="#fff" strokeWidth="2" />
              <circle cx={x(h.fecha)} cy={y(pctRef(h))} r="4" fill={NARANJA} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-ink-border bg-ink-panel px-2.5 py-1.5 text-xs shadow-md" style={{ left: `${Math.min(70, Math.max(2, (x(h.fecha) / W) * 100 - 12))}%` }}>
            <p className="text-muted">{fmtFecha(h.fecha)}</p>
            <p className="tabular-nums text-paper">Cartera {pct(h) >= 0 ? "+" : ""}{fmtNum(pct(h), 2, "%")} · {fmtMonto(h.valor, "USD")}</p>
            <p className="tabular-nums text-muted">Letras EE.UU. +{fmtNum(pctRef(h), 2, "%")}</p>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted">
        Reconstruido con el precio del vector BCU de cada día, más el cupón corrido y los cobros netos ya recibidos, contra lo invertido con comisiones.
        Todo en dólares al tipo de cambio de hoy, para mostrar el efecto de precios y cupones sin mezclarlo con la variación de las monedas.
        La referencia supone que lo mismo se hubiera invertido en Letras del Tesoro de EE.UU. a la tasa actual.
      </p>
    </div>
  );
}

function Dato({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-xl bg-ink px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("text-lg font-semibold tabular-nums", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{valor}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
