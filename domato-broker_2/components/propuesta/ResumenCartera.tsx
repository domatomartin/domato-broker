"use client";

import clsx from "clsx";
import type { MetricasCartera } from "@/lib/propuesta";
import { CobrosCarteraChart } from "@/components/BondCharts";
import { fmtMonto, fmtNum } from "@/components/BondAnalysis";

const COLORES = ["bg-gain", "bg-paper", "bg-warn", "bg-muted", "bg-loss", "bg-gain/50"];

export function Barras({ titulo, datos }: { titulo: string; datos: { clave: string; pct: number }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{titulo}</p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink">
        {datos.map((d, i) => (
          <div key={d.clave} className={COLORES[i % COLORES.length]} style={{ width: `${d.pct}%` }} title={`${d.clave}: ${d.pct.toFixed(1)}%`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {datos.map((d, i) => (
          <span key={d.clave} className="flex items-center gap-1 text-[11px] text-muted">
            <span className={clsx("inline-block h-2 w-2 rounded-full", COLORES[i % COLORES.length])} />
            {d.clave} <span className="text-paper tabular-nums">{fmtNum(d.pct, 0, "%")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, acento }: { label: string; value: string; sub?: string; acento?: boolean }) {
  return (
    <div className={clsx("rounded-xl px-4 py-3", acento ? "bg-gain/10" : "bg-ink")}>
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("text-2xl font-semibold tabular-nums leading-tight", acento ? "text-gain" : "text-paper")}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default function ResumenCartera({ m, moneda }: { m: MetricasCartera; moneda: string }) {
  if (!m.lineas.some((l) => l.neto)) {
    return <p className="text-sm text-muted">Agregá bonos con datos completos para ver el resumen de la cartera.</p>;
  }
  const mezcla = m.monedas.length > 1;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="TIR neta de la cartera" value={fmtNum(m.tirNeta, 2, "%")} sub={`bruta ${fmtNum(m.tirBruta, 2, "%")}${mezcla ? " · promedio ponderado" : ""}`} acento />
        <Kpi label="Inversión total" value={fmtMonto(m.inversionTotal, moneda)} sub={`incluye ${fmtMonto(m.costosCompra, moneda)} de comisiones`} />
        <Kpi label="Cobro anual estimado" value={fmtMonto(m.interesAnual, moneda)} sub="cupones brutos por año" />
        <Kpi label="Total a cobrar (neto)" value={fmtMonto(m.totalACobrarNeto, moneda)} sub={`ganancia ${fmtMonto(m.gananciaNeta, moneda)} · +${fmtNum(m.gananciaNetaPct, 1, "%")}`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Cobros acumulados de la cartera ({moneda}, netos)</p>
          <CobrosCarteraChart flujos={m.flujos} inversion={m.inversionTotal} moneda={mezcla ? null : moneda} />
        </div>
        <div className="flex flex-col gap-4">
          <Barras titulo="Por tipo de instrumento" datos={m.porGrupo} />
          <Barras titulo="Por plazo" datos={m.porPlazo} />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-muted">Duration promedio</p><p className="text-paper font-medium tabular-nums">{fmtNum(m.duration, 2, " años")}</p></div>
            <div><p className="text-muted">Plazo promedio</p><p className="text-paper font-medium tabular-nums">{fmtNum(m.plazoPromedio, 1, " años")}</p></div>
            <div><p className="text-muted">Costos totales</p><p className="text-paper font-medium tabular-nums">{fmtMonto(m.costosTotales, moneda)}</p></div>
            <div><p className="text-muted">Bonos</p><p className="text-paper font-medium tabular-nums">{m.lineas.length}</p></div>
          </div>
        </div>
      </div>
      {mezcla && (
        <p className="rounded bg-warn/10 px-3 py-2 text-xs text-warn">
          La propuesta combina {m.monedas.join(" y ")}: los importes se pasan a {moneda} con la cotización de hoy (sin proyectar inflación ni devaluación)
          y la TIR es un promedio ponderado que mezcla tasas nominales y reales (UI): tomala como aproximada.
        </p>
      )}
    </div>
  );
}
