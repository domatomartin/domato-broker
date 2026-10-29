"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { CARTERAS_BASE, carteraLabel } from "@/lib/carteras";

const NUEVA_CARTERA = "__nueva__";

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

const FRECUENCIA_OPTIONS = [
  { value: "2", label: "Semestral (cada 6 meses)" },
  { value: "1", label: "Anual (1 vez/año)" },
  { value: "4", label: "Trimestral (cada 3 meses)" },
  { value: "12", label: "Mensual (cada mes)" },
];

export default function AddBondForm({
  onAdded,
  carteras = CARTERAS_BASE,
  carteraInicial,
}: {
  onAdded?: () => void;
  carteras?: string[];
  carteraInicial?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({ frecuencia: "2" });
  const [cartera, setCartera] = useState<string>(carteraInicial ?? carteras[0] ?? NUEVA_CARTERA);
  const [nuevaCartera, setNuevaCartera] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const cuenta = cartera === NUEVA_CARTERA ? nuevaCartera.trim() : cartera;
    if (!cuenta) {
      setSaving(false);
      setError("Indicá el nombre de la nueva cartera.");
      return;
    }

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
      frecuencia: values.frecuencia ? Number(values.frecuencia) : 2,
      proximo_pago_interes: values.proximo_pago_interes || null,
      proximo_vencimiento: values.proximo_vencimiento || null,
      fecha_compra: values.fecha_compra || null,
      corredor: values.corredor || null,
      cuenta,
      estado: "activo",
    };

    const { error } = await supabase.from("bonds").insert(payload);
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setValues({ frecuencia: "2" });
    if (cartera === NUEVA_CARTERA) { setCartera(cuenta); setNuevaCartera(""); }
    onAdded?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {/* Cartera / cuenta */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Cartera
        <select
          value={cartera}
          onChange={(e) => setCartera(e.target.value)}
          className="rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
        >
          {carteras.map((c) => (
            <option key={c} value={c}>{carteraLabel(c)}</option>
          ))}
          <option value={NUEVA_CARTERA}>+ Nueva cartera…</option>
        </select>
      </label>
      {cartera === NUEVA_CARTERA && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Nombre de la nueva cartera
          <input
            type="text"
            required
            placeholder="Ej: Inversiones Martín"
            value={nuevaCartera}
            onChange={(e) => setNuevaCartera(e.target.value)}
            className="rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </label>
      )}

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

      {/* Frecuencia de cupones */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Frecuencia de cupones
        <select
          value={values.frecuencia ?? "2"}
          onChange={(e) => setValues((v) => ({ ...v, frecuencia: e.target.value }))}
          className="rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
        >
          {FRECUENCIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

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
