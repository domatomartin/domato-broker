"use client";
import { useRef, useState } from "react";
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

function PriceCell({
  bondId, field, value, onSaved,
}: {
  bondId: string;
  field: "precio_actual" | "precio_compra";
  value: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(value.toString());
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    const parsed = parseFloat(draft.replace(",", "."));
    if (isNaN(parsed) || parsed < 0) { setEditing(false); return; }
    setSaving(true);
    setEditing(false);
    const { error } = await supabase.from("bonds").update({ [field]: parsed }).eq("id", bondId);
    setSaving(false);
    if (error) { setFlash("err"); } else { setFlash("ok"); onSaved(); }
    setTimeout(() => setFlash(null), 1500);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-20 rounded border border-gold bg-ink px-1 py-0 text-right text-sm font-mono text-paper outline-none"
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title={`Click para editar ${field === "precio_actual" ? "precio actual" : "precio compra"}`}
      className={clsx(
        "cursor-pointer rounded px-1 transition-colors",
        saving && "opacity-50",
        flash === "ok" && "text-gain",
        flash === "err" && "text-loss",
        !saving && !flash && "hover:text-gold hover:bg-gold/10"
      )}
    >
      {saving ? "…" : value.toFixed(2)}
    </span>
  );
}

export default function PortfolioTable({
  bonds, onChanged, onSelect,
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
      <p className="text-[11px] text-muted mb-2 italic">
        Hacé click en cualquier precio para editarlo directamente.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-ink-border">
            <th className="py-2 pr-4">Bono</th>
            <th className="py-2 pr-4">ISIN</th>
            <th className="py-2 pr-4">Moneda</th>
            <th className="py-2 pr-4 text-right">V.Nominal</th>
            <th className="py-2 pr-4 text-right">P.Compra %</th>
            <th className="py-2 pr-4 text-right">P.Actual %</th>
            <th className="py-2 pr-4 text-right">V. Limpio</th>
            <th className="py-2 pr-4 text-right">Int. corrido</th>
            <th className="py-2 pr-4 text-right">V. Mercado</th>
            <th className="py-2 pr-4 text-right">G/P</th>
            <th className="py-2 pr-4 text-right">Rent. %</th>
            <th className="py-2 pr-4 text-right">Prox. venc.</th>
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
                <td className="py-2.5 pr-4 text-right font-mono">
                  {b.valor_nominal.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono" onClick={(e) => e.stopPropagation()}>
                  <PriceCell bondId={b.id} field="precio_compra" value={b.precio_compra} onSaved={() => onChanged?.()} />
                </td>
                <td className="py-2.5 pr-4 text-right font-mono" onClick={(e) => e.stopPropagation()}>
                  <PriceCell bondId={b.id} field="precio_actual" value={b.precio_actual} onSaved={() => onChanged?.()} />
                </td>
                <td className="py-2.5 pr-4 text-right font-mono">
                  {formatValor((b.precio_actual / 100) * b.valor_nominal * b.cantidad, b.moneda)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-muted">
                  {b.interes_corrido > 0 ? formatValor(b.interes_corrido, b.moneda) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono">{formatValor(b.valor_mercado, b.moneda)}</td>
                <td className={clsx("py-2.5 pr-4 text-right font-mono", b.ganancia >= 0 ? "text-gain" : "text-loss")}>
                  {formatValor(b.ganancia, b.moneda)}
                </td>
                <td className={clsx("py-2.5 pr-4 text-right font-mono", b.rentabilidad_pct >= 0 ? "text-gain" : "text-loss")}>
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
              <td className="py-2.5 pr-4 text-paper" colSpan={9}>Total {moneda}</td>
              <td className={clsx("py-2.5 pr-4 text-right font-mono", t.gananciaTotal >= 0 ? "text-gain" : "text-loss")}>
                {formatValor(t.gananciaTotal, moneda)}
              </td>
              <td className={clsx("py-2.5 pr-4 text-right font-mono", t.rentabilidadTotal >= 0 ? "text-gain" : "text-loss")}>
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
