"use client";

import { useState } from "react";
import clsx from "clsx";
import { analizarBono, escalar, type DatosBono, type AnalisisBono } from "@/lib/bondMath";
import { CobrosChart, SensibilidadChart } from "@/components/BondCharts";

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

export const AVISO_SIMULACION =
  "Simulación orientativa con precios del vector BCU/BVM, cupón fijo y capital al vencimiento (si el bono amortiza en cuotas la TIR es aproximada). No incluye comisiones. No constituye asesoramiento ni oferta de inversión.";

function Dato({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-ink-border/60 last:border-0">
      <span className="text-xs text-muted">
        {label}
        {hint && <span className="block text-[10px] leading-tight opacity-80">{hint}</span>}
      </span>
      <span className="text-sm font-medium text-paper tabular-nums text-right whitespace-nowrap">{value}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted mb-1">{titulo}</p>
      <div>{children}</div>
    </div>
  );
}

export default function BondAnalysis({
  datos,
  moneda,
  valorNominal,
  analisis,
  titulo,
  subtitulo,
  mostrarAviso = true,
}: {
  datos: DatosBono;
  moneda: string;
  valorNominal?: number;
  analisis?: AnalisisBono;
  titulo?: string;
  subtitulo?: string;
  mostrarAviso?: boolean;
  mostrarFlujos?: boolean;
}) {
  const [verTabla, setVerTabla] = useState(false);
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
  const k = vn ? vn / 100 : 1;
  const enPlata = (v: number) => (m ? fmtMonto(v * k, moneda) : fmtNum(v, 2));
  const caidaPct = a.durationModificada != null ? a.durationModificada : null; // % por cada 1 punto de tasa
  const cuponPorPago = a.flujos[0]?.interes ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {(titulo || subtitulo) && (
        <div>
          {titulo && <p className="text-base font-semibold text-paper">{titulo}</p>}
          {subtitulo && <p className="text-xs text-muted">{subtitulo}</p>}
        </div>
      )}

      {/* Lo principal, grande */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-gain/10 px-4 py-3">
          <p className="text-xs text-muted">{real ? `TIR real en ${moneda}` : "TIR al día"}</p>
          <p className="text-3xl font-semibold text-gain tabular-nums leading-tight">{fmtNum(a.tir, 2, "%")}</p>
          <p className="text-[11px] text-muted">anual efectiva · nominal {fmtNum(a.tirNominal, 2, "%")}</p>
        </div>
        {m ? (
          <>
            <div className="rounded-xl bg-ink px-4 py-3">
              <p className="text-xs text-muted">Invertís hoy</p>
              <p className="text-2xl font-semibold text-paper tabular-nums leading-tight">{fmtMonto(m.inversion, moneda)}</p>
              <p className="text-[11px] text-muted">compra {fmtNum(vn, 0)} de valor nominal</p>
            </div>
            <div className="rounded-xl bg-ink px-4 py-3">
              <p className="text-xs text-muted">Cobrás hasta el vencimiento</p>
              <p className="text-2xl font-semibold text-paper tabular-nums leading-tight">{fmtMonto(m.totalACobrar, moneda)}</p>
              <p className="text-[11px] text-gain font-medium">ganancia {fmtMonto(m.ganancia, moneda)} · +{fmtNum(a.gananciaAlVencimiento, 1, "%")}</p>
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-ink px-4 py-3 sm:col-span-2 text-xs text-muted flex items-center">
            Ingresá el valor nominal para ver cuánto invertís y cuánto cobrás.
          </div>
        )}
      </div>

      {/* Detalle en tres bloques */}
      <div className="grid gap-5 sm:grid-cols-3">
        <Bloque titulo="Rendimiento">
          <Dato label="Cupón anual" value={fmtNum(a.cupon, 3, "%")} hint={a.frecuencia === 2 ? "se paga cada 6 meses" : `${a.frecuencia} pagos por año`} />
          <Dato label="Rendimiento corriente" value={fmtNum(a.currentYield, 2, "%")} hint="cupón ÷ precio" />
          {m && <Dato label="Interés por año" value={fmtMonto(m.interesAnual, moneda)} />}
          <Dato label={m ? "Cobro por cupón" : "Cupón por pago c/100"} value={enPlata(cuponPorPago)} />
          {m && <Dato label="Intereses futuros" value={fmtMonto(m.totalIntereses, moneda)} hint="sin reinvertir" />}
        </Bloque>

        <Bloque titulo="Plazo y riesgo">
          <Dato label="Vencimiento" value={fmtFecha(datos.vencimiento)} hint={`en ${fmtNum(a.aniosAlVencimiento, 1)} años`} />
          <Dato label="Próximo cupón" value={fmtFecha(a.proximoCupon)} hint={`quedan ${a.flujos.length} pagos`} />
          <Dato label="Duration" value={fmtNum(a.duration, 2, " años")} hint={`modificada ${fmtNum(a.durationModificada, 2)}`} />
          <Dato
            label="Si la tasa sube 1 punto"
            value={caidaPct != null ? `−${fmtNum(caidaPct, 1, "%")}` : "—"}
            hint={m && caidaPct != null ? `el precio bajaría ~${fmtMonto((m.inversion * caidaPct) / 100, moneda)}` : "baja aproximada del precio"}
          />
        </Bloque>

        <Bloque titulo="Precio">
          <Dato label="Precio limpio" value={fmtNum(a.precioSucio - a.interesCorrido, 2)} hint="cada 100 de nominal" />
          <Dato label="Interés corrido" value={fmtNum(a.interesCorrido, 2)} hint="se paga al comprar" />
          <Dato label="Precio sucio" value={fmtNum(a.precioSucio, 2)} />
          <Dato label="Convexidad" value={fmtNum(a.convexidad, 1)} />
        </Bloque>
      </div>

      {/* Gráficos */}
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              Lo que vas cobrando{m ? ` (${moneda})` : " (cada 100 de nominal)"}
            </p>
            <button type="button" onClick={() => setVerTabla((v) => !v)} className="text-[11px] text-muted underline hover:text-paper print:hidden">
              {verTabla ? "Ocultar pagos" : "Ver cada pago"}
            </button>
          </div>
          <CobrosChart a={a} k={k} moneda={m ? moneda : null} />
          <p className="text-[11px] text-muted">
            {a.flujos.length} cupones de {enPlata(cuponPorPago)} y el capital ({m ? fmtMonto(vn!, moneda) : "100"}) el {fmtFecha(a.flujos[a.flujos.length - 1].fecha)}.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">Si la tasa de mercado cambia hoy</p>
          <SensibilidadChart a={a} k={k} moneda={m ? moneda : null} />
          <p className="mt-2 text-[10px] text-muted">Afecta el precio si se vende antes; si se mantiene al vencimiento, los cobros no cambian.</p>
        </div>
      </div>

      <div>
        {verTabla && (
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-ink-border">
            <table className="w-full text-xs tabular-nums">
              <thead className="sticky top-0 bg-ink text-muted">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Fecha</th>
                  <th className="text-right px-3 py-1.5 font-medium">Interés</th>
                  <th className="text-right px-3 py-1.5 font-medium">Capital</th>
                  <th className="text-right px-3 py-1.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {a.flujos.map((f) => (
                  <tr key={f.fecha} className="border-t border-ink-border/60">
                    <td className="px-3 py-1">{fmtFecha(f.fecha)}</td>
                    <td className="px-3 py-1 text-right">{enPlata(f.interes)}</td>
                    <td className="px-3 py-1 text-right">{f.amortizacion ? enPlata(f.amortizacion) : "—"}</td>
                    <td className="px-3 py-1 text-right font-medium">{enPlata(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostrarAviso && (
        <p className="text-[10px] text-muted">
          {real && `En ${moneda} la tasa es real: no incluye la inflación. `}
          {AVISO_SIMULACION}
        </p>
      )}
    </div>
  );
}
