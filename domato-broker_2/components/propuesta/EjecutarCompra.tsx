"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hoyIso, analizarBono } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";
import type { EjecucionItem, MetricasCartera } from "@/lib/propuesta";
import { fmtNum } from "@/components/BondAnalysis";

type Fila = { isin: string; nombre: string; moneda: string; precio: string; vn: string };

/**
 * Registra la compra: crea los bonos en la cartera del cliente con los precios reales
 * y los vincula a la propuesta para el seguimiento.
 */
export default function EjecutarCompra({
  propuestaId,
  cliente,
  metricas,
  catalogo,
  onCancel,
  onDone,
}: {
  propuestaId: string;
  cliente: string;
  metricas: MetricasCartera;
  catalogo: Map<string, Instrumento>;
  onCancel: () => void;
  onDone: (ejecucion: EjecucionItem[], cuenta: string, fecha: string) => Promise<void>;
}) {
  const hoy = hoyIso();
  const [cuenta, setCuenta] = useState(cliente || "Cliente");
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState<Fila[]>(
    metricas.lineas
      .filter((l) => l.a.completo)
      .map((l) => ({
        isin: l.item.isin,
        nombre: l.item.nombre,
        moneda: l.item.moneda,
        precio: String(l.item.precio ?? ""),
        vn: String(Math.round(l.vn)),
      }))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(isin: string, campo: "precio" | "vn", v: string) {
    setFilas((f) => f.map((x) => (x.isin === isin ? { ...x, [campo]: v } : x)));
  }

  async function confirmar() {
    setError(null);
    const nombreCuenta = cuenta.trim();
    if (!nombreCuenta) { setError("Poné un nombre para la cartera."); return; }
    const parse = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
    const ejecucion: EjecucionItem[] = [];
    for (const f of filas) {
      const precio = Number(f.precio.replace(",", "."));
      const vn = parse(f.vn);
      if (!(precio > 0) || !(vn > 0)) { setError(`Revisá precio y nominal de “${f.nombre}”.`); return; }
      ejecucion.push({ isin: f.isin, precio_compra: precio, valor_nominal: vn, fecha });
    }

    setGuardando(true);
    const registros = ejecucion.map((x) => {
      const item = metricas.lineas.find((l) => l.item.isin === x.isin)!.item;
      const ins = catalogo.get(x.isin);
      const e = ins ? efectivo(ins) : null;
      const precioActual = e?.precio ?? x.precio_compra;
      const a = analizarBono({ cupon: item.cupon, frecuencia: item.frecuencia, vencimiento: item.vencimiento, precio: precioActual });
      return {
        nombre: item.nombre,
        codigo: ins?.codigo ?? null,
        isin: item.isin,
        moneda: item.moneda,
        cantidad: 1,
        valor_nominal: x.valor_nominal,
        precio_compra: x.precio_compra,
        precio_actual: Number(precioActual.toFixed(4)),
        cupon: item.cupon,
        frecuencia: item.frecuencia,
        proximo_pago_interes: a.proximoCupon,
        proximo_vencimiento: item.vencimiento,
        fecha_compra: x.fecha,
        corredor: "BCE&M",
        cuenta: nombreCuenta,
        estado: "activo",
        propuesta_id: propuestaId,
        tir: a.completo ? a.tir : null,
        duration: a.completo ? a.duration : null,
        duration_modificada: a.completo ? a.durationModificada : null,
        convexidad: a.completo ? a.convexidad : null,
      };
    });

    const { error: err } = await supabase.from("bonds").insert(registros);
    if (err) { setGuardando(false); setError(`No se pudo registrar la compra: ${err.message}`); return; }
    await onDone(ejecucion, nombreCuenta, fecha);
    setGuardando(false);
  }

  const input = "rounded border border-ink-border bg-ink px-2 py-1 text-sm text-paper";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-paper/40 p-4">
      <div className="mt-10 w-full max-w-2xl rounded-2xl bg-ink-panel p-5 shadow-xl flex flex-col gap-4">
        <div>
          <p className="text-lg font-semibold text-paper">Registrar la compra ejecutada</p>
          <p className="text-sm text-muted">
            Cargá los precios y nominales reales que confirmó el corredor. Se crea la cartera del cliente y la propuesta pasa a seguimiento.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Nombre de la cartera
            <input className={input} value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Fecha de compra
            <input type="date" className={input} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-muted border-b border-ink-border">
              <tr>
                <th className="py-2 text-left font-medium">Bono</th>
                <th className="py-2 text-right font-medium">Precio pagado</th>
                <th className="py-2 text-right font-medium">Valor nominal</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const prop = metricas.lineas.find((l) => l.item.isin === f.isin)!;
                return (
                  <tr key={f.isin} className="border-b border-ink-border/60">
                    <td className="py-2 pr-2">
                      <p className="text-paper">{f.nombre}</p>
                      <p className="text-[11px] text-muted">Propuesto: precio {fmtNum(prop.item.precio, 2)} · VN {fmtNum(prop.vn, 0)}</p>
                    </td>
                    <td className="py-2 text-right"><input className={`${input} w-24 text-right`} value={f.precio} onChange={(e) => set(f.isin, "precio", e.target.value)} inputMode="decimal" /></td>
                    <td className="py-2 text-right"><input className={`${input} w-28 text-right`} value={f.vn} onChange={(e) => set(f.isin, "vn", e.target.value)} inputMode="decimal" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {metricas.lineas.some((l) => !l.a.completo) && (
          <p className="text-xs text-warn">Los bonos sin datos completos no se registran; completalos y volvé a ejecutar si hace falta.</p>
        )}
        {error && <p className="rounded bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={guardando} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando || !filas.length} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel disabled:opacity-50">
            {guardando ? "Registrando…" : `Registrar ${filas.length} compra${filas.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
