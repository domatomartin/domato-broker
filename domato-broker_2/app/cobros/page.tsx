"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Panel } from "@/components/Card";
import { Titulo } from "@/components/InformeBono";
import DocumentoA4, { CampoDoc, EncabezadoDoc, KpiDoc } from "@/components/DocumentoA4";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { aUSD } from "@/lib/fx";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { calendarioMensual, cobrosDeCartera, mesLargo, NOMBRE_MES } from "@/lib/estadoCuenta";

const COLOR_MONEDA: Record<string, string> = { USD: "#15803D", UYU: "#0EA5E9", UI: "#4F46E5", EUR: "#1E3A5F", BRL: "#D97706", UP: "#9333EA" };
const TODAS = "__todas__";

function Contenido() {
  const params = useSearchParams();
  const datos = useDatosCartera();
  const hoy = hoyIso();
  const [cuenta, setCuenta] = useState<string>(params.get("cuenta") ?? TODAS);
  const [meses, setMeses] = useState(12);
  const [abierto, setAbierto] = useState(false);

  const bonds = useMemo(() => (cuenta === TODAS ? datos.bonds : datos.bonds.filter((b) => (b.cuenta ?? "").trim() === cuenta)), [datos.bonds, cuenta]);
  const cobros = useMemo(() => cobrosDeCartera(bonds, datos.costos, datos.instrumentos).filter((c) => c.fecha >= hoy), [bonds, datos, hoy]);
  const cal = useMemo(() => calendarioMensual(cobros, hoy, meses), [cobros, hoy, meses]);
  const usd = (v: number, m: string) => (datos.tasas ? aUSD(v, m, datos.tasas) : v);
  const totMes = cal.map((c) => c.cobros.reduce((s, x) => s + usd(x.total, x.moneda), 0));
  const maxMes = Math.max(1, ...totMes);
  const monedas = [...new Set(cobros.map((c) => c.moneda))];
  const totales = monedas.map((m) => {
    const cs = cal.flatMap((c) => c.cobros).filter((c) => c.moneda === m);
    return { m, interes: cs.reduce((s, c) => s + c.interesNeto - c.custodia, 0), capital: cs.reduce((s, c) => s + c.capital, 0), irpf: cs.reduce((s, c) => s + c.irpf, 0) };
  });
  const totalUSD = totMes.reduce((s, v) => s + v, 0);
  const prop = cuenta !== TODAS ? datos.propuestas.find((p) => (p.cuenta ?? "").trim() === cuenta) : undefined;
  const titulo = cuenta === TODAS ? "Todas las carteras" : prop?.cliente || carteraLabel(cuenta);

  if (datos.cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  const grafico = (
    <div className="flex h-40 items-end gap-1.5">
      {cal.map((c, i) => (
        <div key={c.mes} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(totMes[i] / maxMes) * 128}px` }}>
            {Object.entries(c.porMoneda).map(([m, v]) => (
              <div key={m} style={{ height: `${totMes[i] ? (usd(v.interes + v.capital, m) / totMes[i]) * 100 : 0}%`, background: COLOR_MONEDA[m] ?? "#94A3B8" }} />
            ))}
          </div>
          <span className="text-[9px] text-muted">{NOMBRE_MES[Number(c.mes.slice(5)) - 1].slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-paper">Calendario de cobros</h1>
          <p className="text-sm text-muted mt-1">Cupones y vencimientos mes a mes, netos de IRPF, comisión sobre cupones y custodia.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="rounded border border-ink-border bg-ink-panel px-3 py-2 text-sm text-paper">
            <option value={TODAS}>Todas las carteras</option>
            {datos.cuentas.map((c) => <option key={c} value={c}>{carteraLabel(c)}</option>)}
          </select>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="rounded border border-ink-border bg-ink-panel px-3 py-2 text-sm text-paper">
            <option value={6}>6 meses</option><option value={12}>12 meses</option><option value={24}>24 meses</option>
          </select>
          <button type="button" onClick={() => setAbierto(true)} disabled={!cobros.length} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Imprimir para el cliente</button>
        </div>
      </div>

      <Panel title={`Próximos ${meses} meses · ${titulo}`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">Total a cobrar (USD eq.)</p><p className="text-xl font-semibold tabular-nums">{fmtMonto(totalUSD, "USD")}</p></div>
          {totales.slice(0, 3).map((t) => (
            <div key={t.m} className="rounded-xl bg-ink px-4 py-3">
              <p className="text-xs text-muted">En {t.m}</p>
              <p className="text-xl font-semibold tabular-nums">{fmtMonto(t.interes + t.capital, t.m)}</p>
              <p className="text-[11px] text-muted">intereses {fmtMonto(t.interes, t.m)}{t.capital ? ` · capital ${fmtMonto(t.capital, t.m)}` : ""}</p>
            </div>
          ))}
        </div>
        {grafico}
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {monedas.map((m) => <span key={m} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_MONEDA[m] ?? "#94A3B8" }} />{m}</span>)}
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cal.filter((c) => c.cobros.length).map((c) => (
          <div key={c.mes} className="rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold capitalize text-paper">{mesLargo(c.mes)}</p>
              <p className="text-sm font-semibold tabular-nums text-gain">{fmtMonto(c.cobros.reduce((s, x) => s + usd(x.total, x.moneda), 0), "USD")}</p>
            </div>
            <ul className="flex flex-col gap-1.5 text-xs">
              {c.cobros.map((x) => (
                <li key={x.bondId + x.fecha} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="mr-1 inline-block rounded px-1 text-[10px] font-semibold text-white" style={{ background: COLOR_MONEDA[x.moneda] ?? "#94A3B8" }}>{x.moneda}</span>
                    <span className="text-paper">{x.nombre}</span>
                    <span className="block text-[10px] text-muted">{fmtFecha(x.fecha)}{cuenta === TODAS ? ` · ${carteraLabel(bonds.find((b) => b.id === x.bondId)?.cuenta ?? "")}` : ""}{x.capital ? " · vence" : ""}</span>
                  </span>
                  <span className={clsx("whitespace-nowrap tabular-nums font-medium", x.capital ? "text-[#1D4ED8]" : "text-paper")}>{fmtMonto(x.total, x.moneda)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!cobros.length && <p className="text-sm text-muted">No hay cobros programados para esta selección.</p>}
      </div>

      {abierto && (
        <DocumentoA4
          onClose={() => setAbierto(false)}
          pie={<><span>Domato · Gestión patrimonial · Calendario de cobros · {titulo}</span><span>Documento confidencial · {fmtFecha(hoy)}</span></>}
        >
          <EncabezadoDoc eyebrow="Calendario de cobros" titulo={`Próximos ${meses} meses`} sub={`Desde ${fmtFecha(hoy)}`} />
          <section className="grid grid-cols-3 gap-x-6 gap-y-3 rounded-lg bg-[#F5F7FA] px-5 py-4">
            <CampoDoc label="Cliente" valor={titulo} />
            <CampoDoc label="Corredor" valor="BCE&M" />
            <CampoDoc label="Títulos con cobros" valor={`${new Set(cobros.map((c) => c.bondId)).size}`} />
          </section>
          <section className="avoid-break">
            <Titulo n={1}>Resumen</Titulo>
            <div className="grid grid-cols-4 gap-3">
              <KpiDoc label="Total a cobrar" valor={fmtMonto(totalUSD, "USD")} sub="equivalente en dólares" acento />
              {totales.slice(0, 3).map((t) => <KpiDoc key={t.m} label={`En ${t.m}`} valor={fmtMonto(t.interes + t.capital, t.m)} sub={t.capital ? `incluye capital ${fmtMonto(t.capital, t.m)}` : "intereses netos"} />)}
            </div>
            <div className="mt-4">{grafico}</div>
          </section>
          <section>
            <Titulo n={2}>Detalle mes a mes</Titulo>
            {cal.filter((c) => c.cobros.length).map((c) => (
              <div key={c.mes} className="avoid-break mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1E3A5F]">{mesLargo(c.mes)}</p>
                <table className="w-full text-[10px] tabular-nums">
                  <tbody>
                    {c.cobros.map((x) => (
                      <tr key={x.bondId + x.fecha} className="border-b border-[#EEF0F3]">
                        <td className="w-20 py-1">{fmtFecha(x.fecha)}</td>
                        <td className="py-1">{x.nombre}{x.capital ? " — vencimiento" : ""}</td>
                        <td className="py-1 text-right text-muted">{x.irpf ? `IRPF −${fmtMonto(x.irpf, x.moneda, 2)}` : "Exonerado de IRPF"}</td>
                        <td className="w-28 py-1 text-right font-semibold">{fmtMonto(x.total, x.moneda, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
          <footer className="avoid-break rounded-lg bg-[#F5F7FA] px-4 py-3 text-[8.5px] leading-relaxed text-muted">
            <p><strong className="text-paper">Notas.</strong> Fechas según el calendario de cada título (si cae en día inhábil se paga el siguiente hábil). Importes netos de IRPF retenido, comisión sobre cupones y custodia con IVA. Equivalentes en dólares al tipo de cambio de hoy{datos.tasas ? ` (1 USD = ${fmtNum(datos.tasas.UYU_per_USD, 2)} UYU; 1 UI = ${fmtNum(datos.tasas.UI_in_UYU, 4)} UYU)` : ""}.</p>
          </footer>
        </DocumentoA4>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">Cargando…</div>}><Contenido /></Suspense>;
}
