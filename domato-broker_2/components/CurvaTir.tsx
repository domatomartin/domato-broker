"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { fmtNum } from "@/components/BondAnalysis";
import { efectivo, type Grupo, type Instrumento } from "@/lib/bvm";
import type { AnalisisBono } from "@/lib/bondMath";

type Fila = { i: Instrumento; a: AnalisisBono; grupo: Grupo };

// Paleta categórica validada (orden fijo): azul, naranja, aqua, amarillo.
const SERIES: { grupo: Grupo; color: string; label: string }[] = [
  { grupo: "Uruguay soberano", color: "#2a78d6", label: "Soberano Uruguay" },
  { grupo: "Corporativos", color: "#eb6834", label: "Corporativos (ON)" },
  { grupo: "Fideicomisos", color: "#1baf7a", label: "Fideicomisos" },
  { grupo: "Exterior", color: "#eda100", label: "Exterior" },
];
const ORDEN_MONEDAS = ["USD", "UI", "UYU", "UP", "EUR", "BRL"];
const EJE = { x: "Duration (años)", y: "TIR anual %" };

type Punto = { f: Fila; x: number; y: number; color: string; spread: number | null };

/** Curva soberana de referencia: TIR ≈ a + b·ln(1+duration), por mínimos cuadrados. */
function ajustar(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return null;
  const xs = pts.map((p) => Math.log(1 + p.x)), ys = pts.map((p) => p.y);
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  return (x: number) => a + b * Math.log(1 + x);
}

export default function CurvaTir({ filas, onSelect }: { filas: Fila[]; onSelect: (i: Instrumento) => void }) {
  const monedas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const f of filas) if (f.a.tir != null && !efectivo(f.i).variable) cuenta.set(f.i.moneda, (cuenta.get(f.i.moneda) ?? 0) + 1);
    return ORDEN_MONEDAS.filter((m) => (cuenta.get(m) ?? 0) >= 3);
  }, [filas]);
  const [moneda, setMoneda] = useState("USD");
  const [ocultos, setOcultos] = useState<Grupo[]>([]);
  const [hover, setHover] = useState<Punto | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const m = monedas.includes(moneda) ? moneda : monedas[0] ?? "USD";

  const { puntos, curva, top } = useMemo(() => {
    const base = filas.filter((f) => {
      const e = efectivo(f.i);
      return f.i.moneda === m && f.a.tir != null && f.a.duration != null && !e.variable && !e.letra
        && f.a.tir > -5 && f.a.tir < 40 && SERIES.some((s) => s.grupo === f.grupo);
    });
    const sob = base.filter((f) => f.grupo === "Uruguay soberano").map((f) => ({ x: f.a.duration as number, y: f.a.tir as number }));
    const curva = ajustar(sob);
    const puntos: Punto[] = base.map((f) => {
      const x = f.a.duration as number, y = f.a.tir as number;
      return { f, x, y, color: SERIES.find((s) => s.grupo === f.grupo)!.color, spread: curva ? y - curva(x) : null };
    });
    const top = puntos.filter((p) => p.f.grupo !== "Uruguay soberano" && p.spread != null && p.spread > 0).sort((a, b) => (b.spread as number) - (a.spread as number)).slice(0, 5);
    return { puntos, curva, top };
  }, [filas, m]);

  const visibles = puntos.filter((p) => !ocultos.includes(p.f.grupo));
  const W = 760, H = 320, PL = 44, PR = 14, PT = 14, PB = 34;
  const xmax = Math.max(1, ...puntos.map((p) => p.x)) * 1.05;
  const ys = puntos.map((p) => p.y).sort((a, b) => a - b);
  // Recorte robusto del eje Y (2%–98%) para que un título raro no aplaste la curva.
  const q = (t: number) => ys.length ? ys[Math.min(ys.length - 1, Math.max(0, Math.round(t * (ys.length - 1))))] : 0;
  let ylo = Math.min(0, q(0.02) - 0.5), yhi = q(0.98) + 1;
  if (yhi - ylo < 2) yhi = ylo + 2;
  const sx = (x: number) => PL + (x / xmax) * (W - PL - PR);
  const sy = (y: number) => PT + (1 - (Math.min(Math.max(y, ylo), yhi) - ylo) / (yhi - ylo)) * (H - PT - PB);
  const paso = yhi - ylo > 12 ? 4 : yhi - ylo > 6 ? 2 : 1;
  const ticksY: number[] = [];
  for (let v = Math.ceil(ylo / paso) * paso; v <= yhi; v += paso) ticksY.push(v);
  const pasoX = xmax > 16 ? 4 : xmax > 8 ? 2 : 1;
  const ticksX: number[] = [];
  for (let v = 0; v <= xmax; v += pasoX) ticksX.push(v);
  const pathCurva = curva
    ? Array.from({ length: 60 }, (_, k) => (k / 59) * xmax).map((x, k) => `${k ? "L" : "M"}${sx(x).toFixed(1)},${sy(curva(x)).toFixed(1)}`).join("")
    : null;

  function mover(ev: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((ev.clientX - r.left) / r.width) * W, py = ((ev.clientY - r.top) / r.height) * H;
    let best: Punto | null = null, d = 24 * 24; // radio de captura en px del viewBox
    for (const p of visibles) {
      const dd = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (dd < d) { d = dd; best = p; }
    }
    setHover(best);
  }

  if (!monedas.length) return null;
  const real = ["UI", "UP"].includes(m);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {monedas.map((x) => (
            <button key={x} type="button" onClick={() => setMoneda(x)} className={clsx("rounded-full px-3 py-1 text-xs font-medium", m === x ? "bg-gold text-white" : "border border-ink-border text-muted hover:text-paper")}>
              {x}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {SERIES.filter((s) => puntos.some((p) => p.f.grupo === s.grupo)).map((s) => (
            <button key={s.grupo} type="button" onClick={() => setOcultos((o) => (o.includes(s.grupo) ? o.filter((g) => g !== s.grupo) : [...o, s.grupo]))} className={clsx("flex items-center gap-1.5", ocultos.includes(s.grupo) && "opacity-40 line-through")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label} ({puntos.filter((p) => p.f.grupo === s.grupo).length})
            </button>
          ))}
          {pathCurva && <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[#2a78d6]" />Curva soberana</span>}
        </div>
      </div>

      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHover(null)} onClick={() => hover && onSelect(hover.f.i)} role="img" aria-label={`TIR contra duration en ${m}`}>
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} stroke="#E5E7EB" />
              <text x={PL - 6} y={sy(v) + 3.5} textAnchor="end" fontSize="10" fill="#6E7684">{v}%</text>
            </g>
          ))}
          {ticksX.map((v) => (
            <text key={v} x={sx(v)} y={H - 16} textAnchor="middle" fontSize="10" fill="#6E7684">{v}</text>
          ))}
          <text x={(PL + W - PR) / 2} y={H - 3} textAnchor="middle" fontSize="10" fill="#6E7684">{EJE.x}</text>
          {pathCurva && <path d={pathCurva} fill="none" stroke="#2a78d6" strokeWidth="2" strokeDasharray="6 5" opacity="0.7" />}
          {visibles.map((p) => (
            <circle
              key={p.f.i.isin}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={hover?.f.i.isin === p.f.i.isin ? 7 : 5}
              fill={p.color}
              fillOpacity={0.85}
              stroke="#fff"
              strokeWidth="2"
              className="cursor-pointer"
            />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute top-2 max-w-[260px] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(62, Math.max(4, (sx(hover.x) / W) * 100 - 12))}%` }}>
            <p className="font-semibold leading-snug text-paper">{hover.f.i.nombre}</p>
            <p className="text-muted">{hover.f.grupo} · vence {efectivo(hover.f.i).vencimiento?.slice(0, 4) ?? "—"}</p>
            <p className="mt-1 tabular-nums text-paper">TIR {fmtNum(hover.y, 2, "%")} · duration {fmtNum(hover.x, 1)}</p>
            {hover.spread != null && hover.f.grupo !== "Uruguay soberano" && (
              <p className={clsx("tabular-nums", hover.spread >= 0 ? "text-gain" : "text-loss")}>
                {hover.spread >= 0 ? "+" : ""}{fmtNum(hover.spread, 2)} pts vs. soberano
              </p>
            )}
            <p className="mt-1 text-[10px] text-muted">Tocá para ver el detalle</p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Cada punto es un título en {m}{real ? " (tasas reales, sin inflación)" : ""}. Arriba de la curva soberana rinden más que un bono del Estado de plazo parecido: el extra es el pago por riesgo de crédito y liquidez.
        No incluye renta variable ni letras.
      </p>

      {top.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Los que más rinden sobre la curva soberana</p>
          <div className="flex flex-col divide-y divide-ink-border/60 rounded-xl border border-ink-border">
            {top.map((p) => (
              <button key={p.f.i.isin} type="button" onClick={() => onSelect(p.f.i)} className="flex items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-ink">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="truncate text-paper">{p.f.i.nombre}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  TIR <span className="text-paper">{fmtNum(p.y, 2, "%")}</span> · dur {fmtNum(p.x, 1)} · <span className="text-gain">+{fmtNum(p.spread, 2)} pts</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
