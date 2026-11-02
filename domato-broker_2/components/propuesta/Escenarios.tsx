"use client";

import { useState } from "react";
import clsx from "clsx";
import { sensibilidad } from "@/lib/bondMath";
import { fmtMonto, fmtNum } from "@/components/BondAnalysis";
import type { MetricasCartera } from "@/lib/propuesta";

type Shock = { tasasPb: number; fx: Record<string, number> }; // fx: % de variación de cada moneda frente a la del cliente

function valuar(m: MetricasCartera, s: Shock) {
  let hoy = 0, esc = 0;
  const porLinea = m.lineas.filter((l) => l.a.completo).map((l) => {
    const varPrecio = s.tasasPb ? (sensibilidad(l.a, [s.tasasPb])[0]?.variacionPct ?? 0) / 100 : 0;
    const varFx = (s.fx[l.item.moneda] ?? 0) / 100;
    const v0 = l.monto;
    const v1 = v0 * (1 + varPrecio) * (1 + varFx);
    hoy += v0; esc += v1;
    return { l, varPrecio, varFx, v0, v1 };
  });
  return { hoy, esc, dif: esc - hoy, pct: hoy ? ((esc - hoy) / hoy) * 100 : 0, porLinea };
}

export default function Escenarios({ m, moneda }: { m: MetricasCartera; moneda: string }) {
  const otras = m.monedas.filter((x) => x !== moneda);
  const [tasas, setTasas] = useState(100);
  const [fx, setFx] = useState<Record<string, number>>(Object.fromEntries(otras.map((x) => [x, -10])));
  if (!m.lineas.some((l) => l.a.completo)) return null;

  const todasFx = (p: number) => Object.fromEntries(otras.map((x) => [x, p]));
  const predefinidos: { nombre: string; s: Shock }[] = [
    { nombre: "Tasas suben 1 punto", s: { tasasPb: 100, fx: {} } },
    { nombre: "Tasas suben 2 puntos", s: { tasasPb: 200, fx: {} } },
    { nombre: "Tasas bajan 1 punto", s: { tasasPb: -100, fx: {} } },
    ...(otras.length ? [
      { nombre: `Las otras monedas caen 10% frente al ${moneda}`, s: { tasasPb: 0, fx: todasFx(-10) } },
      { nombre: `Las otras monedas suben 10% frente al ${moneda}`, s: { tasasPb: 0, fx: todasFx(10) } },
      { nombre: "Combinado: tasas +1 punto y monedas −10%", s: { tasasPb: 100, fx: todasFx(-10) } },
    ] : []),
  ];
  const propio = valuar(m, { tasasPb: tasas, fx });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Cuánto cambiaría hoy el valor de la cartera si se mueven las tasas o los tipos de cambio. Si se mantienen los bonos hasta el vencimiento, los cupones y el capital no cambian:
        esto mide el riesgo de tener que vender antes.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr className="border-b border-ink-border">
              <th className="px-2 py-2 text-left font-medium">Escenario</th>
              <th className="px-2 py-2 text-right font-medium">Valor de la cartera</th>
              <th className="px-2 py-2 text-right font-medium">Diferencia</th>
              <th className="px-2 py-2 text-left font-medium w-40"></th>
            </tr>
          </thead>
          <tbody>
            {predefinidos.map((p) => {
              const r = valuar(m, p.s);
              return (
                <tr key={p.nombre} className="border-b border-ink-border/60">
                  <td className="px-2 py-2 text-paper">{p.nombre}</td>
                  <td className="px-2 py-2 text-right">{fmtMonto(r.esc, moneda)}</td>
                  <td className={clsx("px-2 py-2 text-right font-semibold", r.dif >= 0 ? "text-gain" : "text-loss")}>
                    {r.dif >= 0 ? "+" : ""}{fmtMonto(r.dif, moneda)} <span className="text-xs font-normal">({r.pct >= 0 ? "+" : ""}{fmtNum(r.pct, 1, "%")})</span>
                  </td>
                  <td className="px-2 py-2"><Barra pct={r.pct} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-ink-border bg-ink/40 p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Escenario propio</p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Tasas de mercado: {tasas >= 0 ? "+" : ""}{tasas} pb ({tasas >= 0 ? "+" : ""}{fmtNum(tasas / 100, 2)} puntos)
          <input type="range" min={-300} max={300} step={25} value={tasas} onChange={(e) => setTasas(Number(e.target.value))} className="w-full accent-[#1E3A5F]" />
        </label>
        {otras.map((x) => (
          <label key={x} className="flex flex-col gap-1 text-xs text-muted">
            {x} frente al {moneda}: {fx[x] >= 0 ? "+" : ""}{fx[x]}%
            <input type="range" min={-30} max={30} step={1} value={fx[x] ?? 0} onChange={(e) => setFx((f) => ({ ...f, [x]: Number(e.target.value) }))} className="w-full accent-[#1E3A5F]" />
          </label>
        ))}
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-sm text-muted">Valor: <span className="font-semibold text-paper">{fmtMonto(propio.esc, moneda)}</span></span>
          <span className={clsx("text-lg font-semibold tabular-nums", propio.dif >= 0 ? "text-gain" : "text-loss")}>
            {propio.dif >= 0 ? "+" : ""}{fmtMonto(propio.dif, moneda)} ({propio.pct >= 0 ? "+" : ""}{fmtNum(propio.pct, 1, "%")})
          </span>
        </div>
        <div className="flex flex-col gap-1 text-xs">
          {propio.porLinea.map((x) => (
            <div key={x.l.item.isin} className="flex justify-between gap-2">
              <span className="truncate text-muted">{x.l.item.nombre}</span>
              <span className={clsx("whitespace-nowrap tabular-nums", x.v1 - x.v0 >= 0 ? "text-gain" : "text-loss")}>
                precio {x.varPrecio >= 0 ? "+" : ""}{fmtNum(x.varPrecio * 100, 1, "%")}{x.varFx ? ` · moneda ${x.varFx >= 0 ? "+" : ""}${fmtNum(x.varFx * 100, 0, "%")}` : ""} → {x.v1 - x.v0 >= 0 ? "+" : ""}{fmtMonto(x.v1 - x.v0, moneda)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  const w = Math.min(50, Math.abs(pct) * 2.5);
  return (
    <div className="relative h-2 w-full rounded-full bg-ink">
      <div className="absolute top-0 h-2 w-px bg-ink-border" style={{ left: "50%" }} />
      <div className={clsx("absolute top-0 h-2 rounded-full", pct >= 0 ? "bg-gain" : "bg-loss")} style={pct >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
    </div>
  );
}
