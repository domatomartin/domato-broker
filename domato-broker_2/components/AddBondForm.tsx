"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CARTERAS_BASE, carteraLabel } from "@/lib/carteras";
import type { InstrumentoBvm } from "@/lib/bvm";
import CatalogoBvmSync from "@/components/CatalogoBvmSync";

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
  const [catalogo, setCatalogo] = useState<InstrumentoBvm[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);

  async function cargarCatalogo() {
    const { data } = await supabase
      .from("instrumentos")
      .select("isin, codigo, nombre, especie, moneda, cupon, vencimiento, precio, cupon_corrido, fecha_precio")
      .order("nombre");
    setCatalogo((data as InstrumentoBvm[]) ?? []);
  }

  useEffect(() => { cargarCatalogo(); }, []);

  const q = busqueda.trim().toLowerCase();
  const sugerencias = q.length < 2
    ? []
    : catalogo
        .filter((i) =>
          [i.nombre, i.isin, i.codigo, i.especie].some((t) => t?.toLowerCase().includes(q))
        )
        .slice(0, 10);

  function elegir(i: InstrumentoBvm) {
    setValues((v) => ({
      ...v,
      nombre: i.nombre,
      codigo: i.codigo ?? "",
      isin: i.isin,
      moneda: i.moneda,
      cupon: i.cupon != null ? String(i.cupon) : "",
      proximo_vencimiento: i.vencimiento ?? "",
      precio_actual: i.precio != null ? String(i.precio) : "",
      precio_compra: v.precio_compra || (i.precio != null ? String(i.precio) : ""),
      cantidad: v.cantidad || "1",
    }));
    setElegido(i.isin);
    setBusqueda("");
  }
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
    setElegido(null);
    if (cartera === NUEVA_CARTERA) { setCartera(cuenta); setNuevaCartera(""); }
    onAdded?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {/* Buscador en el catálogo BVM */}
      <div className="col-span-full flex flex-col gap-2 rounded border border-ink-border/60 bg-ink/20 p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Buscar en el catálogo BVM (nombre, ISIN o código)
          <div className="relative">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={catalogo.length ? "Ej: Notas UI 2030, UYNA00033UI5…" : "Catálogo vacío: actualizalo abajo"}
              className="w-full rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
            {sugerencias.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-ink-border bg-ink shadow-lg">
                {sugerencias.map((i) => (
                  <li key={i.isin}>
                    <button
                      type="button"
                      onClick={() => elegir(i)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gold/10"
                    >
                      <span className="text-sm text-paper">{i.nombre}</span>
                      <span className="text-[11px] text-muted">
                        {i.isin} · {i.moneda}
                        {i.cupon != null && ` · ${i.cupon}%`}
                        {i.vencimiento && ` · vence ${i.vencimiento}`}
                        {i.precio != null && ` · precio ${i.precio}`}
                        {i.especie && ` · ${i.especie}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>
        {elegido && (
          <p className="text-xs text-gain">
            Datos cargados desde el catálogo ({elegido}). Completá valor nominal y precio de compra, y revisá la frecuencia y el próximo pago.
          </p>
        )}
        <CatalogoBvmSync onSynced={cargarCatalogo} />
      </div>

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
