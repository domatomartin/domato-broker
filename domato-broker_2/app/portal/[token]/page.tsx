"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { normalizarCostos, type Costos } from "@/lib/costos";
import type { Instrumento } from "@/lib/bvm";
import type { TasasFx } from "@/lib/fx";
import { aUSD } from "@/lib/fx";
import { cobrosDeCartera, mesLargo, posiciones, resumen, type BondConPropuesta } from "@/lib/estadoCuenta";
import PortalPropuesta, { type PropuestaPortal } from "@/components/portal/PortalPropuesta";

type Datos = {
  cliente: string | null;
  asesor: string | null;
  cuenta: string;
  bonds: BondConPropuesta[];
  propuestas: { id: string; fx_compra: Record<string, number> | null }[];
  instrumentos: Instrumento[];
  costos: Partial<Costos> | null;
};

const COLOR_MONEDA: Record<string, string> = { USD: "#15803D", UYU: "#0EA5E9", UI: "#4F46E5", EUR: "#1E3A5F", BRL: "#D97706", UP: "#9333EA" };

export default function Portal({ params }: { params: { token: string } }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaPortal | null>(null);
  const [tasas, setTasas] = useState<TasasFx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${params.token}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok || j.error) setError(j.error ?? "No se pudo cargar la cartera.");
      else if (j.tipo === "propuesta") setPropuesta(j.propuesta);
      else setDatos(j);
    }).catch(() => setError("No se pudo cargar la cartera."));
    fetch("/api/cotizaciones").then((r) => r.json()).then(setTasas).catch(() => null);
  }, [params.token]);

  const hoy = hoyIso();
  const calc = useMemo(() => {
    if (!datos) return null;
    const costos = normalizarCostos(datos.costos);
    const ins = new Map(datos.instrumentos.map((i) => [i.isin, i]));
    const fx = Object.fromEntries(datos.propuestas.filter((p) => p.fx_compra).map((p) => [p.id, p.fx_compra!]));
    const pos = posiciones(datos.bonds, costos, ins, tasas, fx);
    const res = resumen(pos);
    const enUnAnio = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();
    const proximos = cobrosDeCartera(datos.bonds, costos, ins).filter((c) => c.fecha > hoy && c.fecha <= enUnAnio);
    let s = 0, w = 0;
    for (const p of pos) if (p.tirCompra != null) { const peso = p.invertido * p.fxCompra; s += p.tirCompra * peso; w += peso; }
    return { pos, res, proximos, tir: w ? s / w : null };
  }, [datos, tasas, hoy]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-4">
        <div className="max-w-sm rounded-2xl bg-ink-panel px-6 py-8 text-center shadow">
          <p className="font-display text-lg text-paper">Domato · Gestión patrimonial</p>
          <p className="mt-3 text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }
  if (propuesta) {
    return (
      <div className="min-h-screen bg-ink">
        <header className="border-b border-ink-border bg-ink-panel">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <img src="/logo.jpg" alt="Domato" className="h-9 w-9 rounded-lg object-cover" />
              <div className="leading-tight">
                <p className="font-display text-sm font-bold text-paper">Domato</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Gestión patrimonial</p>
              </div>
            </div>
            <button type="button" onClick={() => window.print()} className="rounded-full border border-ink-border px-3 py-1.5 text-xs text-muted print:hidden">Imprimir</button>
          </div>
        </header>
        <PortalPropuesta token={params.token} propuesta={propuesta} />
      </div>
    );
  }
  if (!datos || !calc) return <div className="flex min-h-screen items-center justify-center bg-ink text-sm text-muted">Cargando…</div>;

  const { pos, res, proximos, tir } = calc;
  const usd = (v: number, m: string) => (tasas ? aUSD(v, m, tasas) : v);
  const meses = new Map<string, typeof proximos>();
  for (const c of proximos) meses.set(c.fecha.slice(0, 7), [...(meses.get(c.fecha.slice(0, 7)) ?? []), c]);
  const cobros12 = proximos.reduce((s, c) => s + usd(c.total, c.moneda), 0);

  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-ink-border bg-ink-panel">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.jpg" alt="Domato" className="h-9 w-9 rounded-lg object-cover" />
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-paper">Domato</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Gestión patrimonial</p>
            </div>
          </div>
          <button type="button" onClick={() => window.print()} className="rounded-full border border-ink-border px-3 py-1.5 text-xs text-muted print:hidden">Imprimir</button>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Tu cartera</p>
          <h1 className="font-display text-2xl text-paper sm:text-3xl">{datos.cliente ?? "Cartera"}</h1>
          <p className="mt-1 text-xs text-muted">Valuada al {fmtFecha(hoy)} con precios del vector BCU{datos.asesor ? ` · asesor: ${datos.asesor}` : ""}. Corredor: BCE&M.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Valor hoy" valor={fmtMonto(res.valorUSD, "USD")} sub="equivalente en dólares" />
          <Kpi label="Invertido" valor={fmtMonto(res.invertidoUSD, "USD")} />
          <Kpi label="Resultado" valor={`${res.resultadoUSD >= 0 ? "+" : ""}${fmtMonto(res.resultadoUSD, "USD")}`} sub={res.invertidoUSD ? fmtNum((res.resultadoUSD / res.invertidoUSD) * 100, 2, "%") : undefined} tono={res.resultadoUSD >= 0 ? "gain" : "loss"} />
          <Kpi label="Rendimiento anual" valor={fmtNum(tir, 2, "%")} sub="TIR neta de compra" />
        </div>

        <section className="rounded-2xl border border-ink-border bg-ink-panel p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Por moneda</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-ink">
            {res.porMoneda.map((m) => <div key={m.moneda} style={{ width: `${m.pctCartera}%`, background: COLOR_MONEDA[m.moneda] ?? "#94A3B8" }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            {res.porMoneda.map((m) => (
              <span key={m.moneda} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_MONEDA[m.moneda] ?? "#94A3B8" }} />{m.moneda} {fmtNum(m.pctCartera, 0, "%")}</span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-border bg-ink-panel p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Tus títulos</p>
          <div className="flex flex-col divide-y divide-ink-border/60">
            {pos.map((p) => (
              <div key={p.bond.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-paper">{p.bond.nombre}</p>
                  <p className="text-[11px] text-muted">{p.grupo} · {fmtNum(p.vn, 0)} nominales · vence {fmtFecha(p.bond.proximo_vencimiento)}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-sm font-semibold text-paper">{fmtMonto(p.valorHoy, p.bond.moneda)}</p>
                  <p className={clsx("text-[11px]", p.resultado >= 0 ? "text-gain" : "text-loss")}>{p.resultado >= 0 ? "+" : ""}{fmtMonto(p.resultado, p.bond.moneda)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-border bg-ink-panel p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Próximos cobros (12 meses)</p>
            <p className="text-sm font-semibold tabular-nums text-gain">{fmtMonto(cobros12, "USD")}</p>
          </div>
          {!proximos.length ? <p className="text-xs text-muted">No hay cobros en los próximos 12 meses.</p> : (
            <div className="flex flex-col gap-3">
              {[...meses.entries()].map(([mes, cs]) => (
                <div key={mes}>
                  <p className="mb-1 text-xs font-semibold capitalize text-paper">{mesLargo(mes)}</p>
                  {cs.map((c) => (
                    <div key={c.bondId + c.fecha} className="flex justify-between gap-3 py-0.5 text-xs">
                      <span className="min-w-0 truncate text-muted">{fmtFecha(c.fecha)} · {c.nombre}{c.capital ? " · devuelve capital" : ""}</span>
                      <span className="shrink-0 tabular-nums text-paper">{fmtMonto(c.total, c.moneda, 2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted">Importes netos de IRPF, comisión sobre cupones y custodia.</p>
        </section>

        <p className="pb-6 text-center text-[10px] text-muted">
          Información de solo lectura, preparada por tu asesor a partir del calendario de pagos de cada título y los precios del vector de precios del BCU.
          No reemplaza el estado de cuenta oficial del corredor. Este link es personal: no lo compartas.
        </p>
      </main>
    </div>
  );
}

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={clsx("text-xl font-semibold tabular-nums", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{valor}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
