"use client";

import { useEffect, useState } from "react";
import { COSTOS_DEFECTO, ETIQUETAS_COSTOS, type Costos } from "@/lib/costos";

/** Botón + panel para ver y editar los costos del corredor. */
export default function CostosEditor({
  costos,
  onGuardar,
}: {
  costos: Costos;
  onGuardar: (c: Costos) => Promise<string | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [vals, setVals] = useState<Record<keyof Costos, string>>(() => aTexto(costos));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setVals(aTexto(costos)); }, [costos]);

  async function guardar() {
    const nuevos = { ...COSTOS_DEFECTO };
    for (const k of Object.keys(nuevos) as (keyof Costos)[]) {
      const n = Number(String(vals[k]).replace(",", "."));
      if (!isFinite(n) || n < 0) { setMsg(`Valor inválido en “${ETIQUETAS_COSTOS[k]}”.`); return; }
      nuevos[k] = n;
    }
    const err = await onGuardar(nuevos);
    setMsg(err ? `No se pudo guardar: ${err}` : "Guardado.");
  }

  const resumen = `Compra ${fmt(costos.comision_compra_pct)}% · custodia ${fmt(costos.custodia_anual_pct)}% · IRPF ${fmt(costos.irpf_soberano_pct)}/${fmt(costos.irpf_privado_pct)}/${fmt(costos.irpf_exterior_pct)}%`;

  return (
    <div className="relative print:hidden">
      <button
        type="button"
        onClick={() => { setAbierto((v) => !v); setMsg(null); }}
        className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold"
        title={resumen}
      >
        Costos e IRPF: <span className="text-muted">{resumen}</span>
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-ink-border bg-ink-panel p-4 shadow-lg">
          <p className="mb-3 text-xs text-muted">
            Se descuentan de la rentabilidad en todas las simulaciones, propuestas e informes. Cargá las tarifas reales de BCE&amp;M.
            El IRPF se retiene sobre cada pago de intereses según el tipo de bono (se puede fijar una tasa propia por bono en Opciones de inversión).
          </p>
          <div className="flex flex-col gap-2">
            {(Object.keys(COSTOS_DEFECTO) as (keyof Costos)[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-xs text-muted">
                {ETIQUETAS_COSTOS[k]}
                <input
                  value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  inputMode="decimal"
                  className="w-20 rounded border border-ink-border bg-ink px-2 py-1 text-right text-sm text-paper"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={guardar} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-ink-panel">Guardar</button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted underline">Cerrar</button>
            {msg && <span className="text-xs text-muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function aTexto(c: Costos) {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Record<keyof Costos, string>;
}
function fmt(n: number) {
  return n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
}
