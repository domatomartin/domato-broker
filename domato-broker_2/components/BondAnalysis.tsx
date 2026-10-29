"use client";

import { useState } from "react";
import clsx from "clsx";
import { analizarBono, escalar, type DatosBono, type AnalisisBono } from "@/lib/bondMath";

const ISO = ["USD", "UYU", "ARS", "EUR", "BRL", "COP"];

export function fmtMonto(v: number, moneda: string, dec = 0) {
  if (ISO.includes(moneda)) {
    return new Intl.NumberFormat("es-UY", { style: "currency", currency: moneda, maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v);
  }
  return `${v.toLocaleString("es-UY", { maximumFractionDigits: dec, minimumFractionDigits: dec })} ${moneda}`;
}

export function fmtNum(v: number | null | undefined, dec = 2, suf = "") {
  return v == null || !isFinite(v) ? "—" : `${v.toLocaleString("es-UY", { maximumFractionDigits: dec, minimumFractionDigits: dec })}${suf}`;
}

export function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "gain" | "gold" }) {
  return (
    <div className="rounded-xl border border-ink-border bg-ink-panel px-3 py-2.5 min-w-0" title={hint}>
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted truncate">{label}</p>
      <p className={clsx("font-mono text-base sm:text-lg leading-tight", tone === "gain" ? "text-gain" : "text-paper")}>{value}</p>
      {hint && <p className="text-[10px] text-muted mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

export default function BondAnalysis({
  datos,
  moneda,
  valorNominal,
  analisis,
  mostrarFlujos = true,
}: {
  datos: DatosBono;
  moneda: string;
  valorNominal?: number;
  analisis?: AnalisisBono;
  mostrarFlujos?: boolean;
}) {
  const [verFlujos, setVerFlujos] = useState(false);
  const a = analisis ?? analizarBono(datos);
  const real = moneda === "UI" || moneda === "UP" || moneda === "UR";

  if (!a.completo) {
    return (
      <p className="rounded-lg border border-dashed border-ink-border px-3 py-2 text-xs text-muted">
        Para simular la tasa y los flujos falta: <span className="text-paper">{a.faltan.join(", ")}</span>.
        {a.currentYield != null && ` Rendimiento corriente: ${fmtNum(a.currentYield, 2, "%")}.`}
      </p>
    );
  }

  const vn = valorNominal && valorNominal > 0 ? valorNominal : null;
  const m = vn ? escalar(a, vn) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label={real ? `TIR real (en ${moneda})` : "TIR al día"} value={fmtNum(a.tir, 2, "%")} hint={`Nominal ${fmtNum(a.tirNominal, 2, "%")} anual`} tone="gain" />
        <Kpi label="Rendimiento corriente" value={fmtNum(a.currentYield, 2, "%")} hint="Cupón ÷ precio limpio" />
        <Kpi label="Interés corrido" value={fmtNum(a.interesCorrido, 4)} hint={`Precio sucio ${fmtNum(a.precioSucio, 4)}`} />
        <Kpi label="Plazo al vencimiento" value={fmtNum(a.aniosAlVencimiento, 1, " años")} hint={`Vence ${fmtFecha(datos.vencimiento)}`} />
        <Kpi label="Duration" value={fmtNum(a.duration, 2, " años")} hint={`Modificada ${fmtNum(a.durationModificada, 2)}`} />
        <Kpi label="Sensibilidad (DV01)" value={fmtNum(a.dv01, 4)} hint="Cambio de precio por +/−1 pb c/100" />
        <Kpi label="Convexidad" value={fmtNum(a.convexidad, 1)} />
        <Kpi label="Próximo cupón" value={fmtFecha(a.proximoCupon)} hint={`${a.flujos.length} pagos restantes`} />
      </div>

      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Kpi label="Inversión hoy" value={fmtMonto(m.inversion, moneda)} hint={`VN ${fmtNum(vn, 0)} + corrido`} />
          <Kpi label="Interés anual" value={fmtMonto(m.interesAnual, moneda)} />
          <Kpi label="Intereses futuros" value={fmtMonto(m.totalIntereses, moneda)} hint="Sin reinvertir" />
          <Kpi label="Total a cobrar" value={fmtMonto(m.totalACobrar, moneda)} hint="Intereses + capital" />
          <Kpi label="Ganancia al vencimiento" value={fmtMonto(m.ganancia, moneda)} hint={fmtNum(a.gananciaAlVencimiento, 1, "% sobre lo invertido")} tone="gain" />
        </div>
      )}

      {mostrarFlujos && (
        <div>
          <button type="button" onClick={() => setVerFlujos((v) => !v)} className="text-xs text-muted underline hover:text-paper">
            {verFlujos ? "Ocultar" : "Ver"} flujo de pagos futuros ({a.flujos.length})
          </button>
          {verFlujos && (
            <div className="mt-2 max-h-72 overflow-auto rounded border border-ink-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ink text-muted">
                  <tr>
                    <th className="text-left px-2 py-1.5">Fecha</th>
                    <th className="text-right px-2 py-1.5">Interés</th>
                    <th className="text-right px-2 py-1.5">Capital</th>
                    <th className="text-right px-2 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(m ? m.flujos : a.flujos).map((f) => (
                    <tr key={f.fecha} className="border-t border-ink-border/60">
                      <td className="px-2 py-1">{fmtFecha(f.fecha)}</td>
                      <td className="px-2 py-1 text-right font-mono">{m ? fmtMonto(f.interes, moneda, 2) : fmtNum(f.interes, 4)}</td>
                      <td className="px-2 py-1 text-right font-mono">{f.amortizacion ? (m ? fmtMonto(f.amortizacion, moneda, 2) : fmtNum(f.amortizacion, 2)) : "—"}</td>
                      <td className="px-2 py-1 text-right font-mono">{m ? fmtMonto(f.total, moneda, 2) : fmtNum(f.total, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!m && <p className="px-2 py-1 text-[10px] text-muted">Importes cada 100 de valor nominal.</p>}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted">
        Simulación con cupón fijo y amortización total al vencimiento; si el bono amortiza en cuotas, la TIR es aproximada.
        {real && ` En ${moneda} la tasa es real: no incluye la inflación.`} No constituye asesoramiento de inversión.
      </p>
    </div>
  );
}
