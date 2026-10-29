"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Instrumento } from "@/lib/bvm";
import { efectivo, grupoDe } from "@/lib/bvm";
import { itemDesdeInstrumento, type ItemPropuesta, type MetricasCartera } from "@/lib/propuesta";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";

export default function MezclaEditor({
  items,
  onChange,
  metricas,
  catalogo,
  moneda,
  bloqueado,
}: {
  items: ItemPropuesta[];
  onChange: (items: ItemPropuesta[]) => void;
  metricas: MetricasCartera;
  catalogo: Instrumento[];
  moneda: string;
  bloqueado?: boolean;
}) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const sugerencias = t.length < 2 ? [] : catalogo
    .filter((i) => !items.some((x) => x.isin === i.isin))
    .filter((i) => [i.nombre, i.isin, i.codigo].some((x) => x?.toLowerCase().includes(t)))
    .slice(0, 8);

  const suma = items.reduce((s, i) => s + (Number(i.peso) || 0), 0);
  const sumaOk = Math.abs(suma - 100) < 0.05;

  function setPeso(isin: string, v: string) {
    onChange(items.map((i) => (i.isin === isin ? { ...i, peso: Number(v.replace(",", ".")) || 0 } : i)));
  }
  function quitar(isin: string) {
    onChange(items.filter((i) => i.isin !== isin));
  }
  function agregar(i: Instrumento) {
    const restante = Math.max(0, 100 - suma);
    onChange([...items, itemDesdeInstrumento(i, Math.round(restante * 10) / 10)]);
    setQ("");
  }
  function repartirIgual() {
    if (!items.length) return;
    const base = Math.floor((100 / items.length) * 10) / 10;
    const resto = Math.round((100 - base * items.length) * 10) / 10;
    onChange(items.map((i, idx) => ({ ...i, peso: idx === 0 ? Math.round((base + resto) * 10) / 10 : base })));
  }
  function ajustarA100() {
    if (!suma) return;
    const nuevos = items.map((i) => ({ ...i, peso: Math.round(((i.peso / suma) * 100) * 10) / 10 }));
    const dif = Math.round((100 - nuevos.reduce((s, i) => s + i.peso, 0)) * 10) / 10;
    if (nuevos.length) nuevos[0].peso = Math.round((nuevos[0].peso + dif) * 10) / 10;
    onChange(nuevos);
  }

  const input = "rounded border border-ink-border bg-ink px-2 py-1 text-sm text-paper";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-muted border-b border-ink-border">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Bono</th>
              <th className="px-2 py-2 text-right font-medium w-20">Peso %</th>
              <th className="px-2 py-2 text-right font-medium">Monto</th>
              <th className="px-2 py-2 text-right font-medium">Precio</th>
              <th className="px-2 py-2 text-right font-medium">Vence</th>
              <th className="px-2 py-2 text-right font-medium">TIR neta</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {metricas.lineas.map((l) => (
              <tr key={l.item.isin} className="border-b border-ink-border/60 align-top">
                <td className="px-2 py-2 max-w-[320px]">
                  <p className="text-paper font-medium leading-snug">{l.item.nombre}</p>
                  <p className="text-[11px] text-muted">{l.item.isin} · {l.item.moneda} · {l.grupo}</p>
                  {l.item.motivo && <p className="mt-0.5 text-[11px] text-muted italic">{l.item.motivo}</p>}
                  {!l.a.completo && <p className="mt-0.5 text-[11px] text-warn">Faltan datos: {l.a.faltan.join(", ")} (completalos en Opciones de inversión).</p>}
                </td>
                <td className="px-2 py-2 text-right">
                  <input
                    value={String(l.item.peso)}
                    onChange={(e) => setPeso(l.item.isin, e.target.value)}
                    disabled={bloqueado}
                    inputMode="decimal"
                    className={clsx(input, "w-16 text-right")}
                  />
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMonto(l.montoLocal, l.item.moneda)}
                  <span className="block text-[11px] text-muted">
                    VN {fmtNum(l.vn, 0)}{l.fx !== 1 ? ` · ≈ ${fmtMonto(l.monto, moneda)}` : ""}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(l.item.precio, 2)}</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtFecha(l.item.vencimiento)}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-gain">{fmtNum(l.neto?.tirNeta, 2, "%")}</td>
                <td className="px-2 py-2 text-right">
                  {!bloqueado && <button type="button" onClick={() => quitar(l.item.isin)} className="text-[11px] text-muted underline hover:text-loss">Quitar</button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 py-2 text-xs text-muted">{items.length} bono{items.length !== 1 ? "s" : ""}</td>
              <td className={clsx("px-2 py-2 text-right text-sm font-semibold tabular-nums", sumaOk ? "text-paper" : "text-loss")}>{fmtNum(suma, 1, "%")}</td>
              <td className="px-2 py-2 text-right text-sm tabular-nums">{fmtMonto(metricas.lineas.reduce((s, l) => s + l.monto, 0), moneda)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!bloqueado && (
        <div className="flex flex-wrap items-start gap-3">
          <div className="relative w-full sm:w-96">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agregar bono: buscá por nombre o ISIN…" className={clsx(input, "w-full")} type="search" />
            {sugerencias.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-ink-border bg-ink-panel shadow-lg">
                {sugerencias.map((i) => {
                  const e = efectivo(i);
                  return (
                    <li key={i.isin}>
                      <button type="button" onClick={() => agregar(i)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-ink">
                        <span className="text-sm text-paper">{i.nombre}</span>
                        <span className="text-[11px] text-muted">{i.isin} · {i.moneda} · {grupoDe(i)}{e.vencimiento ? ` · vence ${fmtFecha(e.vencimiento)}` : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button type="button" onClick={repartirIgual} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold">Repartir igual</button>
          {!sumaOk && items.length > 0 && (
            <button type="button" onClick={ajustarA100} className="rounded border border-loss/40 px-3 py-1.5 text-xs text-loss">Ajustar pesos a 100%</button>
          )}
        </div>
      )}
    </div>
  );
}
