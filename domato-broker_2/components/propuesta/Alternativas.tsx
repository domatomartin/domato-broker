"use client";

import clsx from "clsx";
import { fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { gananciaEn, type Alternativa } from "@/lib/alternativas";

/** Tabla de la propuesta contra alternativas (sirve en pantalla y en el informe impreso). */
export default function Alternativas({ filas, monto, moneda, anios, impreso = false }: { filas: Alternativa[]; monto: number; moneda: string; anios: number; impreso?: boolean }) {
  if (filas.length < 2) return null;
  const prop = filas.find((f) => f.propuesta);
  const h = Math.max(1, Math.round(anios));
  return (
    <div className="flex flex-col gap-2">
      <div className={impreso ? "" : "-mx-2 overflow-x-auto px-2"}>
      <table className={clsx("w-full tabular-nums", impreso ? "text-[10px]" : "min-w-[520px] text-sm")}>
        <thead>
          <tr className={clsx("border-b text-left", impreso ? "border-[#1E3A5F] text-[9px] uppercase tracking-[0.06em] text-muted" : "border-ink-border text-xs text-muted")}>
            <th className="py-1.5 font-medium">Alternativa</th>
            <th className="py-1.5 text-right font-medium">Tasa anual</th>
            <th className="py-1.5 text-right font-medium">Gana en 1 año</th>
            <th className="py-1.5 text-right font-medium">Gana en {h} años</th>
            {prop && <th className="py-1.5 text-right font-medium">Diferencia</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const g1 = gananciaEn(monto, f.tasa, 1), gh = gananciaEn(monto, f.tasa, h);
            const dif = prop && !f.propuesta ? gananciaEn(monto, prop.tasa, h) - gh : null;
            return (
              <tr key={f.nombre} className={clsx("border-b", impreso ? "border-[#EEF0F3]" : "border-ink-border/50", f.propuesta && "font-semibold")}>
                <td className="py-1.5 pr-2">
                  <span className={f.propuesta ? "text-paper" : "text-paper"}>{f.nombre}</span>
                  <span className={clsx("block text-muted", impreso ? "text-[8.5px]" : "text-[11px]")}>{f.nota}</span>
                </td>
                <td className="py-1.5 text-right">{fmtNum(f.tasa, 2, "%")}</td>
                <td className="py-1.5 text-right">{fmtMonto(g1, moneda)}</td>
                <td className="py-1.5 text-right">{fmtMonto(gh, moneda)}</td>
                {prop && <td className={clsx("py-1.5 text-right", dif == null ? "" : dif >= 0 ? "text-gain" : "text-loss")}>{dif == null ? "—" : `${dif >= 0 ? "+" : ""}${fmtMonto(dif, moneda)}`}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className={clsx("text-muted", impreso ? "text-[8.5px]" : "text-[11px]")}>
        Sobre {fmtMonto(monto, moneda)}, con interés compuesto. “Diferencia” es cuánto más gana la propuesta en {h} años frente a cada alternativa.
        El plazo fijo se muestra antes de IRPF (los depósitos también lo pagan) y su tasa puede cambiar al renovar.
      </p>
    </div>
  );
}
