"use client";

import { useState } from "react";
import clsx from "clsx";
import TipoCambioInput, { textoTc } from "@/components/propuesta/TipoCambio";
import { analizarBono, hoyIso, tirDeFlujos } from "@/lib/bondMath";
import { aplicarCostos, irpfDe, type Costos } from "@/lib/costos";
import { efectivo, type Instrumento } from "@/lib/bvm";
import { calcularCartera, type Propuesta, type TiposDeCambio } from "@/lib/propuesta";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";

const DIA = 86_400_000;

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
    const datos = { cupon: item.cupon, frecuencia: item.frecuencia, vencimiento: item.vencimiento };
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
  const flujosEj = filas.flatMap((f) => (f.ej ? f.ej.flujosNetos.map((fl) => ({ anios: fl.anios, total: fl.total })) : []));
  const tirEjecutada = tirDeFlujos(invertido, flujosEj);
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

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted">
            <tr className="border-b border-ink-border">
              <th rowSpan={2} className="px-2 py-1 text-left font-medium align-bottom">Bono</th>
              <th colSpan={3} className="px-2 py-1 text-center font-medium border-l border-ink-border">Propuesto</th>
              <th colSpan={3} className="px-2 py-1 text-center font-medium border-l border-ink-border">Ejecutado</th>
              <th colSpan={4} className="px-2 py-1 text-center font-medium border-l border-ink-border">Hoy</th>
              {!unaMoneda && <th className="border-l border-ink-border" />}
            </tr>
            <tr className="border-b border-ink-border">
              <th className="px-2 py-1 text-right font-medium border-l border-ink-border">Precio</th>
              <th className="px-2 py-1 text-right font-medium">VN</th>
              <th className="px-2 py-1 text-right font-medium">TIR neta</th>
              <th className="px-2 py-1 text-right font-medium border-l border-ink-border">Precio</th>
              <th className="px-2 py-1 text-right font-medium">VN</th>
              <th className="px-2 py-1 text-right font-medium">TIR neta</th>
              <th className="px-2 py-1 text-right font-medium border-l border-ink-border">Precio</th>
              <th className="px-2 py-1 text-right font-medium">Valor</th>
              <th className="px-2 py-1 text-right font-medium">Cobrado</th>
              <th className="px-2 py-1 text-right font-medium">Resultado</th>
              {!unaMoneda && <th className="px-2 py-1 text-right font-medium border-l border-ink-border">Efecto cambio ({monedaCli})</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.x.isin} className="border-b border-ink-border/60">
                <td className="px-2 py-1.5 max-w-[220px]">
                  <p className="text-paper truncate" title={f.item.nombre}>{f.item.nombre}</p>
                  <p className="text-[10px] text-muted">{f.item.isin}{f.vencido ? " · vencido" : ""}</p>
                </td>
                <td className="px-2 py-1.5 text-right border-l border-ink-border">{fmtNum(f.item.precio, 2)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(f.prop?.vn, 0)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(f.tirProp, 2, "%")}</td>
                <td className={clsx("px-2 py-1.5 text-right border-l border-ink-border", f.item.precio != null && f.x.precio_compra > f.item.precio ? "text-loss" : "")}>{fmtNum(f.x.precio_compra, 2)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(f.x.valor_nominal, 0)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(f.ej?.tirNeta, 2, "%")}</td>
                <td className="px-2 py-1.5 text-right border-l border-ink-border">{f.vencido ? "—" : fmtNum(f.precioHoy, 2)}</td>
                <td className="px-2 py-1.5 text-right">{f.valorHoy != null ? fmtMonto(f.valorHoy, f.item.moneda) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{fmtMonto(f.cobrado, f.item.moneda)}</td>
                <td className={clsx("px-2 py-1.5 text-right font-semibold", (f.resultado ?? 0) >= 0 ? "text-gain" : "text-loss")}>
                  {f.resultado != null ? `${f.resultado >= 0 ? "+" : ""}${fmtMonto(f.resultado, f.item.moneda)}` : "—"}
                </td>
                {!unaMoneda && (() => {
                  const ec = ((f.valorHoy ?? 0) + f.cobrado) * (fxHoy(f.item.moneda) - fxCompra(f.item.moneda));
                  return (
                    <td className={clsx("px-2 py-1.5 text-right border-l border-ink-border", f.item.moneda === monedaCli ? "text-muted" : ec >= 0 ? "text-gain" : "text-loss")}>
                      {f.item.moneda === monedaCli ? "—" : `${ec >= 0 ? "+" : ""}${fmtMonto(ec, monedaCli)}`}
                    </td>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted">
        Resultado = valor de mercado hoy (precio sucio) + cupones cobrados netos de costos e IRPF − lo invertido con comisiones. “Esperado” capitaliza lo invertido a la TIR neta propuesta
        desde la fecha de compra. Las variaciones de precio solo se realizan si se vende antes del vencimiento.
        {!unaMoneda && " Con varias monedas, lo invertido se pasa a la moneda del cliente al tipo de cambio fijado en la compra y el valor de hoy al de hoy: la diferencia es el efecto cambiario (los cupones cobrados se valúan al tipo de cambio de hoy)."}
      </p>
    </div>
  );
}
