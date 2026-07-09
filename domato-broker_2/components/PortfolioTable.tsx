"use client";

import { BondComputed } from "@/lib/types";
import { formatMoney, formatPct, daysUntil } from "@/lib/calculations";
import clsx from "clsx";

export default function PortfolioTable({ bonds }: { bonds: BondComputed[] }) {
  if (bonds.length === 0) {
    return (
      <p className="text-sm text-muted py-8 text-center">
        Todavía no cargaste ningún bono. Agregalo manualmente o importá un CSV.
      </p>
    );
  }

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
            <th className="py-2 pr-4 text-right">Valor de mercado</th>
            <th className="py-2 pr-4 text-right">G/P</th>
            <th className="py-2 pr-4 text-right">Rent. %</th>
            <th className="py-2 pr-4 text-right">Próx. vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {bonds.map((b) => {
            const dias = daysUntil(b.proximo_vencimiento);
            return (
              <tr
                key={b.id}
                className="border-b border-ink-border/50 hover:bg-ink/40"
              >
                <td className="py-2.5 pr-4">
                  <div className="text-paper">{b.nombre}</div>
                  <div className="text-xs text-muted">{b.codigo}</div>
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs text-muted">
                  {b.isin ?? "—"}
                </td>
                <td className="py-2.5 pr-4">{b.moneda}</td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">
                  {b.cantidad.toLocaleString("es-UY")}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">
                  {b.precio_actual.toFixed(2)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono mono-num">
                  {formatMoney(b.valor_mercado, b.moneda === "UYU" ? "UYU" : "USD")}
                </td>
                <td
                  className={clsx(
                    "py-2.5 pr-4 text-right font-mono mono-num",
                    b.ganancia >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {formatMoney(b.ganancia, b.moneda === "UYU" ? "UYU" : "USD")}
                </td>
                <td
                  className={clsx(
                    "py-2.5 pr-4 text-right font-mono mono-num",
                    b.rentabilidad_pct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {formatPct(b.rentabilidad_pct)}
                </td>
                <td className="py-2.5 pr-4 text-right text-xs">
                  {b.proximo_vencimiento ?? "—"}
                  {dias !== null && dias >= 0 && dias <= 30 && (
                    <span className="ml-2 text-warn font-medium">({dias}d)</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
