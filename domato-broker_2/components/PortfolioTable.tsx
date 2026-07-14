"use client";
import { useState } from "react";
import { BondComputed } from "@/lib/types";
import { formatMoney, formatPct, daysUntil, portfolioTotals } from "@/lib/calculations";
import { supabase } from "@/lib/supabase";
import clsx from "clsx";

function formatValor(value: number, moneda: string) {
  const codigosValidos = ["USD", "UYU", "ARS", "EUR", "BRL"];
  if (!codigosValidos.includes(moneda)) {
    return value.toLocaleString("es-UY", { maximumFractionDigits: 0 }) + " " + moneda;
  }
  return formatMoney(value, moneda);
}

export default function PortfolioTable({
  bonds,
  onChanged,
  onSelect,
}: {
  bonds: BondComputed[];
  onChanged?: () => void;
  onSelect?: (bond: BondComputed) => void;
}) {
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  async function eliminarBono(id: string, nombre: string) {
    if (!window.confirm("Eliminar " + nombre + "?")) return;
    setBorrandoId(id);
    const { error } = await supabase.from("bonds").update({ estado: "inactivo" }).eq("id", id);
    setBorrandoId(null);
    if (error) { alert("Error: " + error.message); return; }
    onChanged?.();
  }

  if (bonds.length === 0) {
    return <p className="text-sm text-muted py-8 text-center">Sin bonos. Agregalos manualmente o importa un CSV.</p>;
  }

  const totalesPorMoneda = portfolioTotals(bonds);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-ink-border">
            <th className="py-2 pr-4">Bono</th>
            <th className="py-2 pr-4">ISIN</th>
            <th className="py-2 pr-4">Moneda</th>
            <th className="py-2 pr-4 text-right">Cantidad</th>
            <th className="py-2 pr-4 text-right">Precio actual</th>
            <th className="py-2 pr-4 text-right">V. Limpio</th>
            <th className="py-2 pr-4 text-right">Int. corrido</th>
            <th className="py-2 pr-4 text-right">V. Mercado</th>
            <th className="py-2 pr-4 text-right">G/P</th>
            <th className="py-2 pr-4 text-right">Rent. %</th>
            <th className="py-2 pr-4 text-right">Próx. vencimiento</th>
            <th className="py-2 pr-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {bonds.map((b) => {
            const dias = daysUntil(b.proximo_vencimiento);
            return (
              <tr
                key={b.id}
                onClick={() => onSelect?.(b)}
                className={clsx(
                  "border-b border-ink-border/50 transition-colors",
                  onSelect ? "cursor-pointer hover:bg-gold/5" : "hover:bg-ink/40"
                )}
              >
                <td className="py-2.5 pr-4">
                  <div className="text-paper font-medium">{b.nombre}</div>
                  <div className="text-xs text-muted">{b.codigo}</div>
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs text-muted">{b.isin ?? "—"}</td>
                <td className="py-2.5 pr-4">{b.moneda}</td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">{b.cantidad.toLocaleString("es-UY")}</td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">{b.precio_actual.toFixed(2)}</td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">{formatValor((b.precio_actual / 100) * b.valor_nominal * b.cantidad, b.moneda)}</td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num text-muted">
                  {b.cupon != null ? formatValor((b.cupon / 100) * b.valor_nominal * b.cantidad, b.moneda) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">{formatValor(b.valor_mercado, b.moneda)}</td>
                <td className={clsx("py-2.5 pr-4 text-right font-mono mono-num", b.ganancia >= 0 ? "text-gain" : "text-loss")}>
                  {formatValor(b.ganancia, b.moneda)}
                </td>
                <td className={clsx("py-2.5 pr-4 text-right font-mono mono-num", b.rentabilidad_pct >= 0 ? "text-gain" : "text-loss")}>
                  {formatPct(b.rentabilidad_pct)}
                </td>
                <td className="py-2.5 pr-4 text-right text-xs">
                  {b.proximo_vencimiento ?? "—"}
                  {dias !== null && dias >= 0 && dias <= 30 && (
                    <span className="ml-2 text-warn font-medium">({dias}d)</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); eliminarBono(b.id, b.nombre); }}
                    disabled={borrandoId === b.id}
                    className="text-xs text-loss hover:underline disabled:opacity-50"
                  >
                    {borrandoId === b.id ? "Eliminando…" : "Eliminar"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {Object.entries(totalesPorMoneda).map(([moneda, t]) => (
            <tr key={moneda} className="border-t border-ink-border font-medium">
              <td className="py-2.5 pr-4 text-paper" colSpan={8}>Total {moneda}</td>
              <td className={clsx("py-2.5 pr-4 text-right font-mono mono-num", t.gananciaTotal >= 0 ? "text-gain" : "text-loss")}>
                {formatValor(t.gananciaTotal, moneda)}
              </td>
              <td className={clsx("py-2.5 pr-4 text-right font-mono mono-num", t.rentabilidadTotal >= 0 ? "text-gain" : "text-loss")}>
                {formatPct(t.rentabilidadTotal)}
              </td>
              <td colSpan={2}></td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
