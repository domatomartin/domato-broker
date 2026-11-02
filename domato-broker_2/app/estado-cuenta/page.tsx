"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Panel } from "@/components/Card";
import RentabilidadCartera from "@/components/RentabilidadCartera";
import { Titulo } from "@/components/InformeBono";
import DocumentoA4, { CampoDoc, EncabezadoDoc, KpiDoc } from "@/components/DocumentoA4";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { cobrosDeCartera, mesLargo, posiciones, resumen, type Cobro } from "@/lib/estadoCuenta";

const COLOR_GRUPO: Record<string, string> = {
  "Uruguay soberano": "#2563EB", Corporativos: "#7C3AED", Fideicomisos: "#0D9488", Exterior: "#D97706", Acciones: "#DB2777", Otros: "#94A3B8",
};
const COLOR_MONEDA: Record<string, string> = { USD: "#15803D", UYU: "#0EA5E9", UI: "#4F46E5", EUR: "#1E3A5F", BRL: "#D97706" };
const signo = (v: number, m: string, dec = 0) => `${v >= 0 ? "+" : ""}${fmtMonto(v, m, dec)}`;

function mesesHasta(hoy: string, n: number) {
  const d = new Date(hoy.slice(0, 7) + "-01T00:00:00");
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  });
}

function Contenido() {
  const params = useSearchParams();
  const datos = useDatosCartera();
  const hoy = hoyIso();
  const [cuenta, setCuenta] = useState<string>(params.get("cuenta") ?? "");
  const [mes, setMes] = useState<string>(hoy.slice(0, 7));
  const [abierto, setAbierto] = useState(false);

  const cuentaSel = cuenta || datos.cuentas[0] || "";
  const bondsCuenta = useMemo(() => datos.bonds.filter((b) => (b.cuenta ?? "").trim() === cuentaSel), [datos.bonds, cuentaSel]);
  const prop = datos.propuestas.find((p) => (p.cuenta ?? "").trim() === cuentaSel || bondsCuenta.some((b) => b.propuesta_id === p.id));
  const finMes = (() => { const [y, m] = mes.split("-").map(Number); const d = new Date(y, m, 0); return `${mes}-${String(d.getDate()).padStart(2, "0")}`; })();
  const corte = finMes < hoy ? finMes : hoy;

  const pos = useMemo(() => posiciones(bondsCuenta, datos.costos, datos.instrumentos, datos.tasas, datos.fxPorPropuesta, corte), [bondsCuenta, datos, corte]);
  const res = useMemo(() => resumen(pos), [pos]);
  const cobros = useMemo(() => cobrosDeCartera(bondsCuenta, datos.costos, datos.instrumentos), [bondsCuenta, datos]);
  const delMes = cobros.filter((c) => c.fecha.slice(0, 7) === mes);
  const proximos = cobros.filter((c) => c.fecha > corte).slice(0, 12);
  const fx = (m: string) => (datos.tasas ? pos.find((p) => p.bond.moneda === m)?.fxHoy ?? 1 : 1);
  const cobradoMesUSD = delMes.filter((c) => c.fecha <= corte).reduce((s, c) => s + c.total * fx(c.moneda), 0);
  const multimoneda = res.porMoneda.length > 1;
  const cliente = prop?.cliente || carteraLabel(cuentaSel);

  if (datos.cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-paper">Estado de cuenta</h1>
        <p className="text-sm text-muted mt-1">Resumen mensual de la cartera para enviar al cliente: posiciones, resultado, cobros del mes y próximos.</p>
      </div>

      <Panel title="Generar">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">Cartera
            <select value={cuentaSel} onChange={(e) => setCuenta(e.target.value)} className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper">
              {datos.cuentas.map((c) => <option key={c} value={c}>{carteraLabel(c)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Mes
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper">
              {mesesHasta(hoy, 18).map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
            </select>
          </label>
          <button type="button" disabled={!pos.length} onClick={() => setAbierto(true)} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-bright disabled:opacity-50">
            Ver estado de cuenta
          </button>
        </div>
        {!pos.length && <p className="text-sm text-muted">Esa cartera no tiene bonos activos.</p>}
        {pos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="Valor de la cartera" valor={fmtMonto(res.valorUSD, "USD")} />
            <Mini label="Invertido" valor={fmtMonto(res.invertidoUSD, "USD")} />
            <Mini label="Resultado" valor={signo(res.resultadoUSD, "USD")} tono={res.resultadoUSD >= 0 ? "gain" : "loss"} />
            <Mini label={`Cobrado en ${mesLargo(mes)}`} valor={fmtMonto(cobradoMesUSD, "USD")} />
          </div>
        )}
      </Panel>

      {pos.length > 0 && (
        <Panel title="Rentabilidad desde la compra">
          <RentabilidadCartera bonds={bondsCuenta} pos={pos} instrumentos={datos.instrumentos} costos={datos.costos} />
        </Panel>
      )}

      {abierto && (
        <DocumentoA4
          onClose={() => setAbierto(false)}
          barra={<p className="hidden sm:block text-sm text-muted">Estado de cuenta · {cliente} · {mesLargo(mes)}</p>}
          pie={<><span>Domato · Gestión patrimonial · Estado de cuenta {mesLargo(mes)} · {cliente}</span><span>Documento confidencial · emitido {fmtFecha(hoy)}</span></>}
        >
          <EncabezadoDoc eyebrow="Estado de cuenta" titulo={mesLargo(mes).replace(/^./, (c) => c.toUpperCase())} sub={`Valuación al ${fmtFecha(corte)}`} />

          <section className="grid grid-cols-3 gap-x-6 gap-y-3 rounded-lg bg-[#F5F7FA] px-5 py-4">
            <CampoDoc label="Cliente" valor={cliente} />
            <CampoDoc label="Cartera" valor={carteraLabel(cuentaSel)} />
            <CampoDoc label="Asesor" valor={prop?.asesor || "—"} />
            <CampoDoc label="Corredor" valor="BCE&M" />
            <CampoDoc label="Instrumentos" valor={`${pos.length} títulos`} />
            <CampoDoc label="Moneda de referencia" valor="Dólares (USD)" />
          </section>

          <section className="avoid-break">
            <Titulo n={1}>Resumen</Titulo>
            <div className="grid grid-cols-4 gap-3">
              <KpiDoc label="Valor de la cartera" valor={fmtMonto(res.valorUSD, "USD")} sub="a precios de mercado" acento />
              <KpiDoc label="Invertido" valor={fmtMonto(res.invertidoUSD, "USD")} sub="incluye comisiones" />
              <KpiDoc label="Resultado acumulado" valor={signo(res.resultadoUSD, "USD")} sub={res.invertidoUSD ? `${res.resultadoUSD >= 0 ? "+" : ""}${fmtNum((res.resultadoUSD / res.invertidoUSD) * 100, 2, "%")} desde la compra` : undefined} tono={res.resultadoUSD >= 0 ? "gain" : "loss"} />
              <KpiDoc label={`Cobrado en ${mesLargo(mes).split(" ")[0]}`} valor={fmtMonto(cobradoMesUSD, "USD")} sub={`acumulado ${fmtMonto(res.cobradoUSD, "USD")}`} />
            </div>
            {multimoneda && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-[10.5px]">
                <Linea label="Por precio y cupones" valor={signo(res.efectoPrecioUSD, "USD")} tono={res.efectoPrecioUSD >= 0} />
                <Linea label="Por tipo de cambio" valor={signo(res.efectoCambioUSD, "USD")} tono={res.efectoCambioUSD >= 0} />
                <Linea label="Total" valor={signo(res.resultadoUSD, "USD")} tono={res.resultadoUSD >= 0} />
              </div>
            )}
          </section>

          <section>
            <Titulo n={2}>Posiciones</Titulo>
            {res.porMoneda.map((g) => {
              const ps = pos.filter((p) => p.bond.moneda === g.moneda);
              return (
                <div key={g.moneda} className="avoid-break mb-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR_MONEDA[g.moneda] ?? "#94A3B8" }} />
                      {g.moneda} · {fmtNum(g.pctCartera, 1, "%")} de la cartera
                    </p>
                  </div>
                  <div className="text-[10px] tabular-nums">
                    <div className="grid grid-cols-[minmax(0,2.6fr)_0.9fr_0.7fr_0.7fr_1.1fr_0.9fr_1fr] gap-x-1 rounded-t bg-[#1E3A5F] px-2 py-1.5 text-center text-[8.5px] font-semibold uppercase tracking-[0.05em] text-white">
                      <span className="text-left">Título</span><span>Nominal</span><span>P. compra</span><span>P. hoy</span><span>Valor hoy</span><span>Cobrado</span><span>Resultado</span>
                    </div>
                    {ps.map((p, i) => (
                      <div key={p.bond.id} className={clsx("fila-informe grid grid-cols-[minmax(0,2.6fr)_0.9fr_0.7fr_0.7fr_1.1fr_0.9fr_1fr] items-center gap-x-1 border-b border-[#E7E9EE] px-2 py-1.5 text-center", i % 2 === 1 && "bg-[#FAFBFC]")}>
                        <div className="min-w-0 text-left">
                          <p className="font-semibold leading-snug">{p.bond.nombre}</p>
                          <p className="flex items-center gap-1 text-[8.5px] text-muted">
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLOR_GRUPO[p.grupo] }} />
                            {p.grupo} · vence {fmtFecha(p.bond.proximo_vencimiento)}
                          </p>
                        </div>
                        <span>{fmtNum(p.vn, 0)}</span>
                        <span>{fmtNum(p.bond.precio_compra, 2)}</span>
                        <span className={p.bond.precio_actual > p.bond.precio_compra ? "text-[#15803D]" : p.bond.precio_actual < p.bond.precio_compra ? "text-[#DC2626]" : ""}>{fmtNum(p.bond.precio_actual, 2)}</span>
                        <span className="whitespace-nowrap">{fmtMonto(p.valorHoy, g.moneda)}</span>
                        <span className="whitespace-nowrap">{fmtMonto(p.cobrado, g.moneda)}</span>
                        <span className={clsx("whitespace-nowrap font-semibold", p.resultado >= 0 ? "text-[#15803D]" : "text-[#DC2626]")}>{signo(p.resultado, g.moneda)}</span>
                      </div>
                    ))}
                    <div className="fila-informe grid grid-cols-[minmax(0,2.6fr)_0.9fr_0.7fr_0.7fr_1.1fr_0.9fr_1fr] gap-x-1 border-t-2 border-[#1E3A5F] px-2 py-1.5 text-center font-semibold">
                      <span className="text-left">Subtotal {g.moneda}</span><span /><span /><span />
                      <span className="whitespace-nowrap">{fmtMonto(g.valor, g.moneda)}</span>
                      <span className="whitespace-nowrap">{fmtMonto(g.cobrado, g.moneda)}</span>
                      <span className={clsx("whitespace-nowrap", g.resultado >= 0 ? "text-[#15803D]" : "text-[#DC2626]")}>{signo(g.resultado, g.moneda)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-[9px] text-muted">Precio cada 100 de nominal, vector BCU/BVM. Valor hoy incluye intereses corridos. Resultado = valor hoy + cobrado neto − invertido con comisiones.</p>
          </section>

          <section className="avoid-break">
            <Titulo n={3}>Movimientos de {mesLargo(mes)}</Titulo>
            <TablaCobros cobros={delMes} corte={corte} vacio="No hubo cobros de cupones ni vencimientos en el mes." />
          </section>

          <section className="avoid-break">
            <Titulo n={4}>Próximos cobros</Titulo>
            <TablaCobros cobros={proximos} corte={corte} vacio="No hay cobros programados." />
          </section>

          <section className="avoid-break">
            <Titulo n={5}>Distribución</Titulo>
            <div className="grid grid-cols-2 gap-6">
              <Barras titulo="Por moneda" datos={res.porMoneda.map((g) => ({ clave: g.moneda, pct: g.pctCartera }))} color={(c) => COLOR_MONEDA[c] ?? "#94A3B8"} />
              <Barras titulo="Por tipo de instrumento" datos={res.porGrupo} color={(c) => COLOR_GRUPO[c] ?? "#94A3B8"} />
            </div>
          </section>

          <footer className="avoid-break rounded-lg bg-[#F5F7FA] px-4 py-3 text-[8.5px] leading-relaxed text-muted">
            <p>
              <strong className="text-paper">Notas.</strong> Precios del vector BCU publicado por la Bolsa de Valores de Montevideo; valuación al {fmtFecha(corte)}.
              Los cobros se calculan con el calendario de cada título desde la fecha de compra, netos de comisión sobre cupones, custodia (con IVA) e IRPF retenido según el tipo de instrumento.
              Importes en otras monedas convertidos a dólares {datos.tasas ? `(1 USD = ${fmtNum(datos.tasas.UYU_per_USD, 2)} UYU; 1 UI = ${fmtNum(datos.tasas.UI_in_UYU, 4)} UYU)` : ""}; lo invertido al tipo de cambio fijado en la compra.
              Este documento es informativo y no sustituye el estado de cuenta oficial del corredor.
            </p>
          </footer>
        </DocumentoA4>
      )}
    </div>
  );
}

function TablaCobros({ cobros, corte, vacio }: { cobros: Cobro[]; corte: string; vacio: string }) {
  if (!cobros.length) return <p className="text-[10.5px] text-muted">{vacio}</p>;
  return (
    <table className="w-full text-[10px] tabular-nums">
      <thead>
        <tr className="border-b border-[#1E3A5F] text-[8.5px] uppercase tracking-[0.05em] text-muted">
          <th className="py-1 text-left font-semibold">Fecha</th>
          <th className="py-1 text-left font-semibold">Título</th>
          <th className="py-1 text-right font-semibold">Cupón bruto</th>
          <th className="py-1 text-right font-semibold">IRPF</th>
          <th className="py-1 text-right font-semibold">Comisión y custodia</th>
          <th className="py-1 text-right font-semibold">Capital</th>
          <th className="py-1 text-right font-semibold">Neto</th>
        </tr>
      </thead>
      <tbody>
        {cobros.map((c) => (
          <tr key={c.bondId + c.fecha} className="border-b border-[#EEF0F3]">
            <td className="py-1 whitespace-nowrap">{fmtFecha(c.fecha)}{c.fecha > corte ? <span className="ml-1 text-[8px] text-muted">(a cobrar)</span> : ""}</td>
            <td className="py-1">{c.nombre}</td>
            <td className="py-1 text-right whitespace-nowrap">{fmtMonto(c.interesBruto, c.moneda, 2)}</td>
            <td className="py-1 text-right whitespace-nowrap">{c.irpf ? `−${fmtMonto(c.irpf, c.moneda, 2)}` : "Exonerado"}</td>
            <td className="py-1 text-right whitespace-nowrap">{c.comision + c.custodia ? `−${fmtMonto(c.comision + c.custodia, c.moneda, 2)}` : "—"}</td>
            <td className="py-1 text-right whitespace-nowrap">{c.capital ? fmtMonto(c.capital, c.moneda, 2) : "—"}</td>
            <td className="py-1 text-right whitespace-nowrap font-semibold">{fmtMonto(c.total, c.moneda, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Barras({ titulo, datos, color }: { titulo: string; datos: { clave: string; pct: number }[]; color: (c: string) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{titulo}</p>
      {datos.map((d) => (
        <div key={d.clave}>
          <div className="flex justify-between text-[10.5px]"><span>{d.clave}</span><span className="font-semibold tabular-nums">{fmtNum(d.pct, 1, "%")}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-[#EEF0F3]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, d.pct)}%`, background: color(d.clave) }} /></div>
        </div>
      ))}
    </div>
  );
}

function Linea({ label, valor, tono }: { label: string; valor: string; tono: boolean }) {
  return (
    <div className="flex justify-between rounded border border-[#E7E9EE] px-3 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={clsx("font-semibold tabular-nums", tono ? "text-[#15803D]" : "text-[#DC2626]")}>{valor}</span>
    </div>
  );
}

function Mini({ label, valor, tono }: { label: string; valor: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-xl bg-ink px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("text-xl font-semibold tabular-nums", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{valor}</p>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">Cargando…</div>}><Contenido /></Suspense>;
}
