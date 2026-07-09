"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const fields: { name: string; label: string; type: string; required?: boolean }[] = [
  { name: "nombre", label: "Nombre del bono", type: "text", required: true },
  { name: "codigo", label: "Código", type: "text" },
  { name: "isin", label: "ISIN", type: "text" },
  { name: "moneda", label: "Moneda (USD/UYU/UI)", type: "text", required: true },
  { name: "cantidad", label: "Cantidad", type: "number", required: true },
  { name: "valor_nominal", label: "Valor nominal", type: "number", required: true },
  { name: "precio_compra", label: "Precio de compra", type: "number", required: true },
  { name: "precio_actual", label: "Precio actual", type: "number", required: true },
  { name: "cupon", label: "Cupón anual (%)", type: "number" },
  { name: "proximo_pago_interes", label: "Próximo pago de interés", type: "date" },
  { name: "proximo_vencimiento", label: "Próximo vencimiento", type: "date" },
  { name: "fecha_compra", label: "Fecha de compra", type: "date" },
  { name: "corredor", label: "Corredor", type: "text" },
];

export default function AddBondForm({ onAdded }: { onAdded?: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      nombre: values.nombre,
      codigo: values.codigo || null,
      isin: values.isin || null,
      moneda: values.moneda || "USD",
      cantidad: Number(values.cantidad || 0),
      valor_nominal: Number(values.valor_nominal || 0),
      precio_compra: Number(values.precio_compra || 0),
      precio_actual: Number(values.precio_actual || values.precio_compra || 0),
      cupon: values.cupon ? Number(values.cupon) : null,
      proximo_pago_interes: values.proximo_pago_interes || null,
      proximo_vencimiento: values.proximo_vencimiento || null,
      fecha_compra: values.fecha_compra || null,
      corredor: values.corredor || null,
      estado: "activo",
    };

    const { error } = await supabase.from("bonds").insert(payload);
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setValues({});
    onAdded?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs text-muted">
          {f.label}
          <input
            type={f.type}
            required={f.required}
            value={values[f.name] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.name]: e.target.value }))
            }
            className="rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </label>
      ))}
      <div className="col-span-full flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Agregar bono"}
        </button>
        {error && <span className="text-xs text-loss">{error}</span>}
      </div>
    </form>
  );
}
