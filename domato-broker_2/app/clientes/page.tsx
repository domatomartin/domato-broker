"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/Card";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { cobrosDeCartera, posiciones, resumen } from "@/lib/estadoCuenta";
import Comparador, { type FilaCliente } from "@/components/clientes/Comparador";
import Reinversion from "@/components/clientes/Reinversion";
import DetalleInstrumento from "@/components/DetalleInstrumento";
import type { Instrumento } from "@/lib/bvm";

const COLOR_MONEDA: Record<string, string> = { USD: "#15803D", UYU: "#0EA5E9", UI: "#4F46E5", EUR: "#1E3A5F", BRL: "#D97706", UP: "#9333EA" };
const COLOR_GRUPO: Record<string, string> = { "Uruguay soberano": "#2563EB", Corporativos: "#7C3AED", Fideicomisos: "#0D9488", Exterior: "#D97706", Acciones: "#DB2777", Otros: "#94A3B8" };

/** Emisor aproximado a partir del nombre del título (para medir concentración). */
function emisor(nombre: string, isin: string | null): string {
  if (/^US(760942|917288)/.test(isin ?? "") || /^UY(NA|BT|LR)/.test(isin ?? "") || /Uruguay|Notas Gob|Let Reg/i.test(nombre)) return "República Oriental del Uruguay";
  if (/Brasil/i.test(nombre)) return "Brasil";
  if (/Mexico|México/i.test(nombre)) return "México";
  if (/Treasury/i.test(nombre)) return "Tesoro de EE.UU.";
  if (/Bund|Alemania/i.test(nombre)) return "Alemania";
  if (/CONAPROLE/i.test(nombre)) return "Conaprole";
  if (/UTE/i.test(nombre)) return "UTE";
  return nombre.replace(/^(Obl\.? Neg\.?|O\.N\.|Glo\.? Sob\.?|Bono|C\.?[PD]\.?|Fid\.? Fin\.?)\s*/i, "").split(/\s+\d/)[0].slice(0, 30);
}

export default function ClientesPage() {
  const datos = useDatosCartera();
  const hoy = hoyIso();

  const filas = useMemo(() => datos.cuentas.map((c) => {
    const bonds = datos.bonds.filter((b) => (b.cuenta ?? "").trim() === c);
    const pos = posiciones(bonds, datos.costos, datos.instrumentos, datos.tasas, datos.fxPorPropuesta);
    const res = resumen(pos);
    const prop = datos.propuestas.find((p) => (p.cuenta ?? "").trim() === c || bonds.some((b) => b.propuesta_id === p.id));
    const proximo = cobrosDeCartera(bonds, datos.costos, datos.instrumentos).find((x) => x.fecha > hoy);
    const activas = prop?.senales_estado?.evaluadas.filter((s) => s.activa).length ?? 0;
    const base = prop?.revision_fecha ?? prop?.estrategia_fecha ?? null;
    const proxRev = base ? (() => { const d = new Date(base); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); })() : null;
    const tir = (() => { let s = 0, w = 0; for (const p of pos) if (p.tirCompra != null) { const peso = p.invertido * p.fxCompra; s += p.tirCompra * peso; w += peso; } return w ? s / w : null; })();
    return { c, bonds, pos, res, prop, proximo, activas, proxRev, tir };
  }).filter((f) => f.pos.length), [datos, hoy]);

  const totalUSD = filas.reduce((s, f) => s + f.res.valorUSD, 0);
  const invertidoUSD = filas.reduce((s, f) => s + f.res.invertidoUSD, 0);
  const resultadoUSD = filas.reduce((s, f) => s + f.res.resultadoUSD, 0);
  const todas = filas.flatMap((f) => f.pos);
  const conc = (clave: (p: (typeof todas)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of todas) m.set(clave(p), (m.get(clave(p)) ?? 0) + p.valorHoy * p.fxHoy);
    return [...m.entries()].map(([k, v]) => ({ k, pct: totalUSD ? (v / totalUSD) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  };
  const porMoneda = conc((p) => p.bond.moneda);
  const porGrupo = conc((p) => p.grupo);
  const porEmisor = conc((p) => emisor(p.bond.nombre, p.bond.isin)).slice(0, 8);
  const filasCliente: FilaCliente[] = filas.map((f) => ({ c: f.c, nombre: f.prop?.cliente || carteraLabel(f.c), bonds: f.bonds, pos: f.pos, res: f.res, tir: f.tir, riesgo: f.prop?.perfil?.riesgo ?? null }));
  const [detalle, setDetalle] = useState<Instrumento | null>(null);
  const pendientes = filas.filter((f) => f.activas > 0 || (f.proxRev && f.proxRev <= hoy) || !f.prop?.estrategia_fecha);

  if (datos.cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-paper">Clientes</h1>
        <p className="text-sm text-muted mt-1">Todo lo que administrás en una vista: total, concentración y qué cliente necesita atención.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Total administrado" valor={fmtMonto(totalUSD, "USD")} sub={`${filas.length} cliente${filas.length !== 1 ? "s" : ""}`} />
        <Kpi label="Invertido" valor={fmtMonto(invertidoUSD, "USD")} />
        <Kpi label="Resultado" valor={`${resultadoUSD >= 0 ? "+" : ""}${fmtMonto(resultadoUSD, "USD")}`} tono={resultadoUSD >= 0 ? "gain" : "loss"} />
        <Kpi label="Requieren atención" valor={String(pendientes.length)} sub="señales activas o revisión pendiente" tono={pendientes.length ? "loss" : undefined} />
      </div>

      {pendientes.length > 0 && (
        <Panel title="Para atender">
          <div className="flex flex-col gap-2">
            {pendientes.map((f) => (
              <div key={f.c} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-loss/5 px-3 py-2 text-sm">
                <span className="font-medium text-paper">{f.prop?.cliente || carteraLabel(f.c)}</span>
                <span className="text-xs text-muted">
                  {f.activas > 0 && <span className="mr-2 text-loss">⚠ {f.activas} señal{f.activas !== 1 ? "es" : ""} activa{f.activas !== 1 ? "s" : ""}</span>}
                  {f.proxRev && f.proxRev <= hoy && <span className="mr-2">revisión vencida desde {fmtFecha(f.proxRev)}</span>}
                  {!f.prop?.estrategia_fecha && <span className="mr-2">sin estrategia de seguimiento</span>}
                  {f.prop && <Link href={`/propuestas/${f.prop.id}`} className="underline">abrir</Link>}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Clientes">
        {!filas.length ? <p className="text-sm text-muted">Todavía no hay carteras con bonos activos.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr className="border-b border-ink-border">
                  <th className="px-2 py-2 text-left font-medium">Cliente</th>
                  <th className="px-2 py-2 text-right font-medium">Valor (USD)</th>
                  <th className="px-2 py-2 text-right font-medium">Resultado</th>
                  <th className="px-2 py-2 text-right font-medium">TIR compra</th>
                  <th className="px-2 py-2 text-left font-medium">Monedas</th>
                  <th className="px-2 py-2 text-left font-medium">Próximo cobro</th>
                  <th className="px-2 py-2 text-left font-medium">Seguimiento</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.c} className="border-b border-ink-border/60">
                    <td className="px-2 py-2.5">
                      <p className="font-medium text-paper">{f.prop?.cliente || carteraLabel(f.c)}</p>
                      <p className="text-[11px] text-muted">{carteraLabel(f.c)} · {f.pos.length} títulos · {fmtNum(totalUSD ? (f.res.valorUSD / totalUSD) * 100 : 0, 1, "%")} del total</p>
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium">{fmtMonto(f.res.valorUSD, "USD")}</td>
                    <td className={clsx("px-2 py-2.5 text-right", f.res.resultadoUSD >= 0 ? "text-gain" : "text-loss")}>
                      {f.res.resultadoUSD >= 0 ? "+" : ""}{fmtMonto(f.res.resultadoUSD, "USD")}
                      <span className="block text-[11px]">{f.res.invertidoUSD ? fmtNum((f.res.resultadoUSD / f.res.invertidoUSD) * 100, 2, "%") : ""}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right">{fmtNum(f.tir, 2, "%")}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex h-2 w-28 overflow-hidden rounded-full bg-ink">
                        {f.res.porMoneda.map((m) => <div key={m.moneda} style={{ width: `${m.pctCartera}%`, background: COLOR_MONEDA[m.moneda] ?? "#94A3B8" }} title={`${m.moneda} ${m.pctCartera.toFixed(0)}%`} />)}
                      </div>
                      <p className="mt-1 text-[10px] text-muted">{f.res.porMoneda.map((m) => `${m.moneda} ${m.pctCartera.toFixed(0)}%`).join(" · ")}</p>
                    </td>
                    <td className="px-2 py-2.5 text-xs">{f.proximo ? <>{fmtFecha(f.proximo.fecha)}<span className="block text-muted">{fmtMonto(f.proximo.total, f.proximo.moneda)} · {f.proximo.nombre.slice(0, 22)}</span></> : "—"}</td>
                    <td className="px-2 py-2.5 text-xs">
                      {f.activas > 0 ? <span className="text-loss">⚠ {f.activas} activa{f.activas !== 1 ? "s" : ""}</span> : f.prop?.estrategia_fecha ? <span className="text-gain">sin señales activas</span> : <span className="text-muted">sin estrategia</span>}
                      {f.proxRev && <span className="block text-muted">revisar {fmtFecha(f.proxRev)}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs whitespace-nowrap">
                      <Link href={`/estado-cuenta?cuenta=${encodeURIComponent(f.c)}`} className="underline text-muted hover:text-paper">Estado de cuenta</Link>
                      {f.prop && <> · <Link href={`/propuestas/${f.prop.id}`} className="underline text-muted hover:text-paper">Propuesta</Link></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {filasCliente.length > 1 && (
        <Panel title="Comparar carteras">
          <Comparador filas={filasCliente} instrumentos={datos.instrumentos} tasas={datos.tasas} costos={datos.costos} emisor={emisor} />
        </Panel>
      )}

      <Panel title="Reinversión: capital que vuelve en los próximos 12 meses">
        <Reinversion filas={filasCliente} instrumentos={datos.instrumentos} tasas={datos.tasas} costos={datos.costos} onDetalle={setDetalle} />
      </Panel>

      {detalle && <DetalleInstrumento i={detalle} costos={datos.costos} onClose={() => setDetalle(null)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Por moneda"><Barras datos={porMoneda} color={(k) => COLOR_MONEDA[k] ?? "#94A3B8"} /></Panel>
        <Panel title="Por tipo de instrumento"><Barras datos={porGrupo} color={(k) => COLOR_GRUPO[k] ?? "#94A3B8"} /></Panel>
        <Panel title="Por emisor (principales)"><Barras datos={porEmisor} color={() => "#1E3A5F"} alerta={25} /></Panel>
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel px-4 py-3 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("text-2xl font-semibold tabular-nums", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{valor}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Barras({ datos, color, alerta }: { datos: { k: string; pct: number }[]; color: (k: string) => string; alerta?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {datos.map((d) => (
        <div key={d.k}>
          <div className="flex justify-between text-xs"><span className="text-paper">{d.k}</span><span className={clsx("font-semibold tabular-nums", alerta && d.pct > alerta ? "text-warn" : "text-paper")}>{fmtNum(d.pct, 1, "%")}</span></div>
          <div className="mt-1 h-2 rounded-full bg-ink"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, d.pct)}%`, background: color(d.k) }} /></div>
        </div>
      ))}
      {!!alerta && datos.some((d) => d.pct > alerta) && <p className="text-[11px] text-warn">Más de {alerta}% en un solo emisor: revisá la concentración.</p>}
    </div>
  );
}
