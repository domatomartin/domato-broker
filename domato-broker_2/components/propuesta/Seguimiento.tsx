"use client";

import { Fragment, useState } from "react";
import clsx from "clsx";
import TipoCambioInput, { textoTc } from "@/components/propuesta/TipoCambio";
import { analizarBono, hoyIso, tirDeFlujos } from "@/lib/bondMath";
import { aplicarCostos, irpfDe, type Costos } from "@/lib/costos";
import { efectivo, grupoDe, type Instrumento } from "@/lib/bvm";
import { calcularCartera, type Propuesta, type TiposDeCambio } from "@/lib/propuesta";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";

const DIA = 86_400_000;

const COLOR_GRUPO: Record<string, { punto: string; etiqueta: string; borde: string }> = {
  "Uruguay soberano": { punto: "bg-[#2563EB]", etiqueta: "bg-[#2563EB]/10 text-[#1D4ED8]", borde: "border-l-[#2563EB]" },
  Corporativos: { punto: "bg-[#7C3AED]", etiqueta: "bg-[#7C3AED]/10 text-[#6D28D9]", borde: "border-l-[#7C3AED]" },
  Fideicomisos: { punto: "bg-[#0D9488]", etiqueta: "bg-[#0D9488]/10 text-[#0F766E]", borde: "border-l-[#0D9488]" },
  Exterior: { punto: "bg-[#D97706]", etiqueta: "bg-[#D97706]/10 text-[#B45309]", borde: "border-l-[#D97706]" },
  Acciones: { punto: "bg-[#DB2777]", etiqueta: "bg-[#DB2777]/10 text-[#BE185D]", borde: "border-l-[#DB2777]" },
  Otros: { punto: "bg-[#94A3B8]", etiqueta: "bg-[#94A3B8]/15 text-[#475569]", borde: "border-l-[#94A3B8]" },
};
const COLOR_MONEDA: Record<string, string> = {
  USD: "bg-[#1FAE6D]/15 text-[#15803D]", UI: "bg-[#4F46E5]/10 text-[#4338CA]", UYU: "bg-[#0EA5E9]/15 text-[#0369A1]",
  EUR: "bg-[#1E3A5F]/10 text-[#1E3A5F]", BRL: "bg-[#D97706]/15 text-[#B45309]",
};
function BadgeMoneda({ m }: { m: string }) {
  return <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", COLOR_MONEDA[m] ?? "bg-ink text-muted")}>{m}</span>;
}


function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-xl bg-ink px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("text-2xl font-semibold tabular-nums leading-tight", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default function Seguimiento({
  propuesta: p, costos, catalogo, fxs = {}, onGuardarFx,
}: {
  propuesta: Propuesta;
  costos: Costos;
  catalogo: Map<string, Instrumento>;
  fxs?: TiposDeCambio;
  onGuardarFx?: (fx: Record<string, number>) => Promise<void>;
}) {
  const [editFx, setEditFx] = useState<Record<string, number> | null>(null);
  if (!p.ejecucion?.length) return null;
  const hoy = hoyIso();
  const fechaProp = (p.fecha_presentada ?? p.created_at).slice(0, 10);
  const propuesta = calcularCartera(p.items, p.perfil.monto, costos, fechaProp, fxs);

  const filas = p.ejecucion.map((x) => {
    const item = p.items.find((i) => i.isin === x.isin)!;
    const prop = propuesta.lineas.find((l) => l.item.isin === x.isin);
    const datos = { cupon: item.cupon, frecuencia: item.frecuencia, vencimiento: item.vencimiento, amortizaciones: item.amortizaciones ?? catalogo.get(x.isin)?.amortizaciones, escalonado: item.escalonado ?? catalogo.get(x.isin)?.escalonado };
    const aEj = analizarBono({ ...datos, precio: x.precio_compra }, x.fecha);
    const ej = aEj.completo ? aplicarCostos(aEj, x.valor_nominal, costos, irpfDe(costos, item)) : null;

    const ins = catalogo.get(x.isin);
    const precioHoy = ins ? efectivo(ins).precio : null;
    const vencido = !!item.vencimiento && item.vencimiento <= hoy;
    const aHoy = !vencido && precioHoy ? analizarBono({ ...datos, precio: precioHoy }, hoy) : null;
    const valorHoy = vencido ? 0 : aHoy?.completo ? (aHoy.precioSucio * x.valor_nominal) / 100 : null;

    const cobrados = ej ? ej.flujosNetos.filter((f) => f.fecha <= hoy) : [];
    const cobrado = cobrados.reduce((s, f) => s + f.total, 0);
    const invertido = ej?.inversionTotal ?? 0;
    const resultado = valorHoy != null ? valorHoy + cobrado - invertido : null;

    const anios = Math.max(0, (Date.parse(hoy) - Date.parse(x.fecha)) / DIA / 365);
    const tirProp = prop?.neto?.tirNeta ?? null;
    const esperado = tirProp != null ? invertido * Math.pow(1 + tirProp / 100, anios) : null;

    return { x, item, prop, ej, precioHoy, valorHoy, cobrado, invertido, resultado, esperado, tirProp, vencido, anios };
  });

  // Totales en la moneda del cliente. Lo invertido se convierte al tipo de cambio fijado en la compra;
  // el valor de hoy y los cupones, al de hoy. La diferencia entre ambos es el efecto del tipo de cambio.
  const monedasItems = [...new Set(p.items.map((i) => i.moneda))];
  const monedaCli = p.perfil.moneda;
  const unaMoneda = monedasItems.length === 1;
  const moneda = unaMoneda ? monedasItems[0] : monedaCli;
  const fxHoy = (m: string) => (unaMoneda ? 1 : fxs[m] ?? 1);
  const fxCompra = (m: string) => (unaMoneda ? 1 : p.fx_compra?.[m] ?? fxs[m] ?? 1);
  const totC = (fn: (f: (typeof filas)[number]) => number | null) => filas.reduce((s, f) => s + (fn(f) ?? 0) * fxCompra(f.item.moneda), 0);
  const totH = (fn: (f: (typeof filas)[number]) => number | null) => filas.reduce((s, f) => s + (fn(f) ?? 0) * fxHoy(f.item.moneda), 0);
  const invertido = totC((f) => f.invertido);
  const valorHoy = totH((f) => f.valorHoy);
  const cobrado = totH((f) => f.cobrado);
  const resultado = valorHoy + cobrado - invertido;
  const efectoPrecio = totC((f) => (f.valorHoy ?? 0) + f.cobrado - f.invertido);
  const efectoCambio = resultado - efectoPrecio;
  const esperado = totC((f) => f.esperado);
  const desvio = valorHoy + cobrado - esperado;
  const monedasExt = monedasItems.filter((m) => m !== monedaCli);
  const sinFxFijado = monedasExt.some((m) => !p.fx_compra?.[m]);

  // TIR neta de lo efectivamente comprado (flujos desde la ejecución).
  // Con varias monedas no se pueden sumar flujos de distintas monedas: se pondera la TIR de cada bono por lo invertido.
  const flujosEj = filas.flatMap((f) => (f.ej ? f.ej.flujosNetos.map((fl) => ({ anios: fl.anios, total: fl.total })) : []));
  const tirEjecutada = unaMoneda
    ? tirDeFlujos(invertido, flujosEj)
    : (() => {
        let s = 0, w = 0;
        for (const f of filas) if (f.ej?.tirNeta != null) { const peso = f.invertido * fxCompra(f.item.moneda); s += f.ej.tirNeta * peso; w += peso; }
        return w > 0 ? s / w : null;
      })();
  const tirPropuesta = p.metricas?.tirNeta ?? propuesta.tirNeta;
  const diasDesde = Math.round((Date.parse(hoy) - Date.parse(p.fecha_ejecucion ?? hoy)) / DIA);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Comprado el {fmtFecha(p.fecha_ejecucion)} en la cartera <span className="text-paper font-medium">{p.cuenta}</span> · hace {diasDesde} días.
        Precios de hoy del vector BCU/BVM.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Invertido (con comisiones)" value={fmtMonto(invertido, moneda)} sub={`propuesto ${fmtMonto(propuesta.inversionTotal, moneda)}`} />
        <Kpi label="Valor hoy + cupones cobrados" value={fmtMonto(valorHoy + cobrado, moneda)} sub={`cupones cobrados ${fmtMonto(cobrado, moneda)}`} />
        <Kpi
          label="Resultado a la fecha"
          value={`${resultado >= 0 ? "+" : ""}${fmtMonto(resultado, moneda)}`}
          sub={invertido ? `${resultado >= 0 ? "+" : ""}${fmtNum((resultado / invertido) * 100, 2, "%")}` : undefined}
          tono={resultado >= 0 ? "gain" : "loss"}
        />
        <Kpi
          label="Contra lo esperado"
          value={`${desvio >= 0 ? "+" : ""}${fmtMonto(desvio, moneda)}`}
          sub={`esperado según propuesta ${fmtMonto(esperado, moneda)}`}
          tono={desvio >= 0 ? "gain" : "loss"}
        />
      </div>
      {!unaMoneda && (
        <div className="rounded-xl border border-ink-border bg-ink/40 px-4 py-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Resultado total" value={`${resultado >= 0 ? "+" : ""}${fmtMonto(resultado, moneda)}`} tono={resultado >= 0 ? "gain" : "loss"} />
            <Kpi label="Por precio y cupones" value={`${efectoPrecio >= 0 ? "+" : ""}${fmtMonto(efectoPrecio, moneda)}`} sub="en moneda de cada bono, al tipo de cambio de compra" tono={efectoPrecio >= 0 ? "gain" : "loss"} />
            <Kpi label="Por tipo de cambio" value={`${efectoCambio >= 0 ? "+" : ""}${fmtMonto(efectoCambio, moneda)}`} sub={`variación de las monedas frente al ${monedaCli}`} tono={efectoCambio >= 0 ? "gain" : "loss"} />
          </div>
          <div className="flex flex-wrap items-end gap-4 text-xs">
            {monedasExt.map((m) => {
              const c = p.fx_compra?.[m];
              const h = fxs[m];
              const varPct = c && h ? ((h - c) / c) * 100 : null;
              return (
                <div key={m} className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2">
                  <p className="font-semibold text-paper">{m}</p>
                  {editFx ? (
                    <TipoCambioInput moneda={m} base={monedaCli} fx={editFx[m]} onChange={(v) => setEditFx((x) => { const n = { ...(x ?? {}) }; if (v) n[m] = v; else delete n[m]; return n; })} />
                  ) : (
                    <p className="text-muted">Compra: <span className="text-paper">{textoTc(m, monedaCli, c)}</span></p>
                  )}
                  <p className="text-muted">Hoy: <span className="text-paper">{textoTc(m, monedaCli, h)}</span></p>
                  {varPct != null && (
                    <p className={clsx("font-medium", varPct >= 0 ? "text-gain" : "text-loss")}>
                      {m} {varPct >= 0 ? "se apreció" : "se depreció"} {fmtNum(Math.abs(varPct), 2, "%")} frente al {monedaCli}
                    </p>
                  )}
                </div>
              );
            })}
            {onGuardarFx && (
              editFx ? (
                <div className="flex gap-2">
                  <button type="button" onClick={async () => { await onGuardarFx({ ...editFx, [monedaCli]: 1 }); setEditFx(null); }} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-white">Guardar tipos de cambio</button>
                  <button type="button" onClick={() => setEditFx(null)} className="text-xs text-muted underline">Cancelar</button>
                </div>
              ) : (
                <button type="button" onClick={() => setEditFx(Object.fromEntries(monedasExt.map((m) => [m, p.fx_compra?.[m] ?? fxs[m]]).filter(([, v]) => v)) as Record<string, number>)} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold">
                  {sinFxFijado ? "Fijar tipos de cambio de compra" : "Editar tipos de cambio de compra"}
                </button>
              )
            )}
          </div>
          {sinFxFijado && !editFx && (
            <p className="text-[11px] text-warn">Falta fijar el tipo de cambio de compra de alguna moneda: mientras tanto se usa el de hoy y el efecto cambiario da cero.</p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-ink-border px-3 py-2">
          <p className="text-xs text-muted">TIR neta propuesta</p>
          <p className="font-semibold tabular-nums">{fmtNum(tirPropuesta, 2, "%")}</p>
        </div>
        <div className="rounded-lg border border-ink-border px-3 py-2">
          <p className="text-xs text-muted">TIR neta al precio realmente pagado</p>
          <p className="font-semibold tabular-nums">{fmtNum(tirEjecutada, 2, "%")}</p>
        </div>
        <div className="rounded-lg border border-ink-border px-3 py-2">
          <p className="text-xs text-muted">Diferencia por precio de ejecución</p>
          <p className={clsx("font-semibold tabular-nums", tirEjecutada != null && tirPropuesta != null && tirEjecutada < tirPropuesta ? "text-loss" : "text-gain")}>
            {tirEjecutada != null && tirPropuesta != null ? `${tirEjecutada - tirPropuesta >= 0 ? "+" : ""}${fmtNum((tirEjecutada - tirPropuesta) * 100, 0)} pb` : "—"}
          </p>
        </div>
      </div>

      {/* ─── Detalle por bono ─── */}
      {(() => {
        const ec = (f: (typeof filas)[number]) =>
          f.item.moneda === monedaCli || unaMoneda ? null : ((f.valorHoy ?? 0) + f.cobrado) * (fxHoy(f.item.moneda) - fxCompra(f.item.moneda));
        const grupos = monedasItems.map((m) => ({ m, filas: filas.filter((f) => f.item.moneda === m) })).filter((g) => g.filas.length);
        const Pill = ({ v, m }: { v: number | null; m: string }) =>
          v == null ? <span className="text-muted">—</span> : (
            <span className={clsx("inline-block rounded-full px-2 py-0.5 font-semibold", v >= 0 ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss")}>
              {v >= 0 ? "+" : ""}{fmtMonto(v, m)}
            </span>
          );
        return (
          <>
            {/* Celular y tablet: tarjetas */}
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {filas.map((f) => {
                const grupo = grupoDe({ isin: f.item.isin, especie: f.item.especie } as Instrumento);
                const e = ec(f);
                return (
                  <div key={f.x.isin} className={clsx("rounded-2xl border border-l-4 border-ink-border bg-ink-panel p-4 shadow-sm", COLOR_GRUPO[grupo]?.borde)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap gap-1.5">
                          <BadgeMoneda m={f.item.moneda} />
                          <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-medium", COLOR_GRUPO[grupo]?.etiqueta)}>{grupo}</span>
                          {f.vencido && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] text-muted">Vencido</span>}
                        </div>
                        <p className="text-sm font-semibold leading-snug text-paper">{f.item.nombre}</p>
                        <p className="text-[10px] text-muted">{f.item.isin} · VN {fmtNum(f.x.valor_nominal, 0)}</p>
                      </div>
                      <Pill v={f.resultado} m={f.item.moneda} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-ink p-2.5 text-center text-xs tabular-nums">
                      <div><p className="text-[10px] uppercase text-muted">Propuesto</p><p className="font-medium">{fmtNum(f.item.precio, 2)}</p><p className="text-[10px] text-muted">TIR {fmtNum(f.tirProp, 2, "%")}</p></div>
                      <div><p className="text-[10px] uppercase text-[#1D4ED8]">Pagado</p><p className="font-medium">{fmtNum(f.x.precio_compra, 2)}</p><p className="text-[10px] text-muted">TIR {fmtNum(f.ej?.tirNeta, 2, "%")}</p></div>
                      <div><p className="text-[10px] uppercase text-gain">Hoy</p><p className="font-medium">{f.vencido ? "—" : fmtNum(f.precioHoy, 2)}</p><p className="text-[10px] text-muted">{f.precioHoy != null && !f.vencido ? `${f.precioHoy - f.x.precio_compra >= 0 ? "+" : ""}${fmtNum(((f.precioHoy - f.x.precio_compra) / f.x.precio_compra) * 100, 2, "%")}` : ""}</p></div>
                    </div>
                    <div className="mt-3 flex justify-between text-xs">
                      <span className="text-muted">Valor hoy <span className="font-medium text-paper">{f.valorHoy != null ? fmtMonto(f.valorHoy, f.item.moneda) : "—"}</span></span>
                      <span className="text-muted">Cobrado <span className="font-medium text-paper">{fmtMonto(f.cobrado, f.item.moneda)}</span></span>
                    </div>
                    {e != null && (
                      <p className="mt-1 text-right text-xs text-muted">Efecto cambio <span className={clsx("font-medium", e >= 0 ? "text-gain" : "text-loss")}>{e >= 0 ? "+" : ""}{fmtMonto(e, monedaCli)}</span></p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Escritorio: tabla agrupada por moneda */}
            <div className="hidden lg:block overflow-hidden rounded-2xl border border-ink-border bg-ink-panel shadow-sm">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide">
                    <th rowSpan={2} className="bg-[#1E3A5F] px-3 py-2 text-left text-white align-bottom">Bono</th>
                    <th colSpan={3} className="bg-[#E2E8F0] px-2 py-1.5 text-center text-[#334155]">Propuesto</th>
                    <th colSpan={3} className="bg-[#DBEAFE] px-2 py-1.5 text-center text-[#1D4ED8]">Ejecutado</th>
                    <th colSpan={unaMoneda ? 4 : 5} className="bg-[#DCFCE7] px-2 py-1.5 text-center text-[#15803D]">Hoy</th>
                  </tr>
                  <tr className="border-b border-ink-border text-[10px] uppercase tracking-wide text-muted">
                    <th className="bg-[#F1F5F9] px-2 py-1.5 text-right font-medium">Precio</th>
                    <th className="bg-[#F1F5F9] px-2 py-1.5 text-right font-medium">VN</th>
                    <th className="bg-[#F1F5F9] px-2 py-1.5 text-right font-medium">TIR</th>
                    <th className="bg-[#EFF6FF] px-2 py-1.5 text-right font-medium">Precio</th>
                    <th className="bg-[#EFF6FF] px-2 py-1.5 text-right font-medium">VN</th>
                    <th className="bg-[#EFF6FF] px-2 py-1.5 text-right font-medium">TIR</th>
                    <th className="bg-[#F0FDF4] px-2 py-1.5 text-right font-medium">Precio</th>
                    <th className="bg-[#F0FDF4] px-2 py-1.5 text-right font-medium">Valor</th>
                    <th className="bg-[#F0FDF4] px-2 py-1.5 text-right font-medium">Cobrado</th>
                    <th className="bg-[#F0FDF4] px-2 py-1.5 text-right font-medium">Resultado</th>
                    {!unaMoneda && <th className="bg-[#F0FDF4] px-2 py-1.5 text-right font-medium">Efecto cambio</th>}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const sub = (fn: (f: (typeof filas)[number]) => number | null) => g.filas.reduce((s2, f) => s2 + (fn(f) ?? 0), 0);
                    const subEc = g.filas.reduce((s2, f) => s2 + (ec(f) ?? 0), 0);
                    return (
                      <Fragment key={g.m}>
                        {!unaMoneda && (
                          <tr className="bg-ink/70">
                            <td colSpan={unaMoneda ? 11 : 12} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                              <BadgeMoneda m={g.m} /> <span className="ml-1">{g.filas.length} bono{g.filas.length !== 1 ? "s" : ""}</span>
                            </td>
                          </tr>
                        )}
                        {g.filas.map((f, idx) => {
                          const grupo = grupoDe({ isin: f.item.isin, especie: f.item.especie } as Instrumento);
                          const e = ec(f);
                          const subio = f.precioHoy != null && f.precioHoy > f.x.precio_compra;
                          const bajo = f.precioHoy != null && f.precioHoy < f.x.precio_compra;
                          return (
                            <tr key={f.x.isin} className={clsx("border-b border-ink-border/60 hover:bg-ink/50", idx % 2 === 1 && "bg-[#FAFBFC]")}>
                              <td className="px-3 py-2 max-w-[260px]">
                                <p className="flex items-center gap-1.5 font-medium text-paper">
                                  <span className={clsx("h-2 w-2 shrink-0 rounded-full", COLOR_GRUPO[grupo]?.punto)} />
                                  <span className="truncate" title={f.item.nombre}>{f.item.nombre}</span>
                                </p>
                                <p className="pl-3.5 text-[10px] text-muted">{grupo} · {f.item.isin}{f.vencido ? " · vencido" : ""}</p>
                              </td>
                              <td className="px-2 py-2 text-right text-muted">{fmtNum(f.item.precio, 2)}</td>
                              <td className="px-2 py-2 text-right text-muted">{fmtNum(f.prop?.vn, 0)}</td>
                              <td className="px-2 py-2 text-right text-muted">{fmtNum(f.tirProp, 2, "%")}</td>
                              <td className={clsx("px-2 py-2 text-right font-medium", f.item.precio != null && f.x.precio_compra > f.item.precio ? "text-loss" : "text-paper")}>{fmtNum(f.x.precio_compra, 2)}</td>
                              <td className="px-2 py-2 text-right">{fmtNum(f.x.valor_nominal, 0)}</td>
                              <td className="px-2 py-2 text-right">{fmtNum(f.ej?.tirNeta, 2, "%")}</td>
                              <td className={clsx("px-2 py-2 text-right font-medium", subio ? "text-gain" : bajo ? "text-loss" : "text-paper")}>
                                {f.vencido ? "—" : fmtNum(f.precioHoy, 2)}{subio ? " ▲" : bajo ? " ▼" : ""}
                              </td>
                              <td className="px-2 py-2 text-right">{f.valorHoy != null ? fmtMonto(f.valorHoy, f.item.moneda) : "—"}</td>
                              <td className="px-2 py-2 text-right">{fmtMonto(f.cobrado, f.item.moneda)}</td>
                              <td className="px-2 py-2 text-right"><Pill v={f.resultado} m={f.item.moneda} /></td>
                              {!unaMoneda && (
                                <td className={clsx("px-2 py-2 text-right", e == null ? "text-muted" : e >= 0 ? "text-gain" : "text-loss")}>
                                  {e == null ? "—" : `${e >= 0 ? "+" : ""}${fmtMonto(e, monedaCli)}`}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        <tr className="border-b-2 border-[#1E3A5F]/20 bg-ink/40 font-semibold">
                          <td className="px-3 py-1.5 text-[11px]">Subtotal {g.m}</td>
                          <td colSpan={6} />
                          <td />
                          <td className="px-2 py-1.5 text-right">{fmtMonto(sub((f) => f.valorHoy), g.m)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtMonto(sub((f) => f.cobrado), g.m)}</td>
                          <td className="px-2 py-1.5 text-right"><Pill v={sub((f) => f.resultado)} m={g.m} /></td>
                          {!unaMoneda && (
                            <td className={clsx("px-2 py-1.5 text-right", g.m === monedaCli ? "text-muted" : subEc >= 0 ? "text-gain" : "text-loss")}>
                              {g.m === monedaCli ? "—" : `${subEc >= 0 ? "+" : ""}${fmtMonto(subEc, monedaCli)}`}
                            </td>
                          )}
                        </tr>
                      </Fragment>
                    );
                  })}
                  <tr className="bg-[#1E3A5F] font-semibold text-white">
                    <td className="px-3 py-2">Total en {moneda}</td>
                    <td colSpan={6} className="px-2 py-2 text-right text-white/70">invertido {fmtMonto(invertido, moneda)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{fmtMonto(valorHoy, moneda)}</td>
                    <td className="px-2 py-2 text-right">{fmtMonto(cobrado, moneda)}</td>
                    <td className="px-2 py-2 text-right">{resultado >= 0 ? "+" : ""}{fmtMonto(resultado, moneda)}</td>
                    {!unaMoneda && <td className="px-2 py-2 text-right">{efectoCambio >= 0 ? "+" : ""}{fmtMonto(efectoCambio, moneda)}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      <p className="text-[10px] text-muted">
        Resultado = valor de mercado hoy (precio sucio) + cupones cobrados netos de costos e IRPF − lo invertido con comisiones. “Esperado” capitaliza lo invertido a la TIR neta propuesta
        desde la fecha de compra. Las variaciones de precio solo se realizan si se vende antes del vencimiento.
        {!unaMoneda && " Con varias monedas, lo invertido se pasa a la moneda del cliente al tipo de cambio fijado en la compra y el valor de hoy al de hoy: la diferencia es el efecto cambiario (los cupones cobrados se valúan al tipo de cambio de hoy)."}
      </p>
    </div>
  );
}
