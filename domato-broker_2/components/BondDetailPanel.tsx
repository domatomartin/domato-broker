"use client";

import { BondComputed } from "@/lib/types";
import { formatMoney, formatPct } from "@/lib/calculations";
import clsx from "clsx";

function fmtVal(value: number, moneda: string) {
  const iso = ["USD", "UYU", "ARS", "EUR", "BRL"];
  if (!iso.includes(moneda))
    return `${value.toLocaleString("es-UY", { maximumFractionDigits: 0 })} ${moneda}`;
  return formatMoney(value, moneda);
}

function DataRow({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ink-border/40 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={clsx("text-sm font-mono font-medium",
        tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-paper"
      )}>{value}</span>
    </div>
  );
}

export default function BondDetailPanel({
  bond,
  totalMoneda,
  onClose,
}: {
  bond: BondComputed;
  totalMoneda: number;
  onClose: () => void;
}) {
  const costo = (bond.precio_compra / 100) * bond.valor_nominal * bond.cantidad;
  const cuponRate = bond.cupon ?? null;
  const importeCupon = cuponRate != null
    ? (cuponRate / 100) * bond.valor_nominal * bond.cantidad
    : null;
  const pesoPct = totalMoneda > 0 ? (bond.valor_mercado / totalMoneda) * 100 : 0;

  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-ink border-l border-ink-border shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-5 border-b border-ink-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] uppercase tracking-wider bg-gold/10 text-gold border border-gold/30 rounded px-1.5 py-0.5">
                {bond.moneda}
              </span>
              {bond.corredor && (
                <span className="text-[10px] text-muted">{bond.corredor}</span>
              )}
            </div>
            <h2 className="font-display text-lg text-paper leading-tight">{bond.nombre}</h2>
            <p className="text-xs text-muted mt-0.5">
              {bond.codigo}{bond.isin ? ` · ${bond.isin}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper text-xl shrink-0 mt-0.5 px-1">✕</button>
        </div>

        {/* Valor de mercado */}
        <div className="px-5 py-4 border-b border-ink-border">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Valor de mercado</p>
          <p className="font-mono text-2xl font-semibold text-paper">{fmtVal(bond.valor_mercado, bond.moneda)}</p>
        </div>

        {/* Costo / G-P / Rent */}
        <div className="grid grid-cols-3 border-b border-ink-border">
          <div className="px-4 py-3 border-r border-ink-border/50">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Costo</p>
            <p className="font-mono text-sm text-paper">{fmtVal(costo, bond.moneda)}</p>
          </div>
          <div className="px-4 py-3 border-r border-ink-border/50">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">G/P</p>
            <p className={clsx("font-mono text-sm font-semibold",
              bond.ganancia >= 0 ? "text-gain" : "text-loss"
            )}>
              {bond.ganancia >= 0 ? "+" : ""}{fmtVal(bond.ganancia, bond.moneda)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Rent.</p>
            <p className={clsx("font-mono text-sm font-semibold",
              bond.rentabilidad_pct >= 0 ? "text-gain" : "text-loss"
            )}>
              {formatPct(bond.rentabilidad_pct)}
            </p>
          </div>
        </div>

        {/* Cupón */}
        <div className="px-5 py-4 border-b border-ink-border">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Cupón</p>
          {cuponRate != null ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-paper font-semibold">{cuponRate}% anual</p>
                {bond.proximo_pago_interes && (
                  <p className="text-xs text-muted mt-0.5">Próx. pago: {fmtDate(bond.proximo_pago_interes)}</p>
                )}
              </div>
              {importeCupon != null && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted uppercase tracking-widest">Importe est.</p>
                  <p className="font-mono font-semibold text-gain">{fmtVal(importeCupon, bond.moneda)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted italic">Sin tasa de cupón cargada</p>
          )}
        </div>

        {/* Datos técnicos */}
        <div className="px-5 py-3 border-b border-ink-border">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Datos del bono</p>
          <DataRow label="Cantidad" value={bond.cantidad.toLocaleString("es-UY") + " títulos"} />
          <DataRow label="Valor nominal" value={fmtVal(bond.valor_nominal, bond.moneda)} />
          <DataRow label="Precio compra" value={bond.precio_compra.toFixed(2)} />
          <DataRow label="Precio actual" value={bond.precio_actual.toFixed(2)} />
          <DataRow label="Vencimiento" value={fmtDate(bond.proximo_vencimiento)} />
          {bond.tir != null && <DataRow label="TIR" value={formatPct(bond.tir)} />}
          {bond.duration != null && <DataRow label="Duración" value={bond.duration.toFixed(2) + " años"} />}
          {bond.duration_modificada != null && <DataRow label="Dur. modificada" value={bond.duration_modificada.toFixed(2)} />}
          {bond.convexidad != null && <DataRow label="Convexidad" value={bond.convexidad.toFixed(2)} />}
          {bond.fecha_compra && <DataRow label="Fecha compra" value={fmtDate(bond.fecha_compra)} />}
        </div>

        {/* Peso en cartera */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-muted uppercase tracking-widest">Peso en cartera {bond.moneda}</p>
            <p className="text-sm font-mono font-semibold text-paper">{pesoPct.toFixed(1)}%</p>
          </div>
          <div className="h-1.5 rounded-full bg-ink-border overflow-hidden">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.min(pesoPct, 100)}%` }} />
          </div>
        </div>

      </aside>
    </>
  );
}
