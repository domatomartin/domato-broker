"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond, PatrimonioSnapshot } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatPct, formatMoney } from "@/lib/calculations";
import {
  portfolioDuration,
  portfolioModifiedDuration,
  portfolioConvexity,
  concentrationBy,
  durationBucket,
  historicalDailyVaR,
  parametricDailyVaR,
  BENCHMARKS,
  annualizedPortfolioReturn,
} from "@/lib/risk";
import { Panel, StatCard } from "@/components/Card";

function ConcentrationBars({ data }: { data: { label: string; pct: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">Sin datos suficientes.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-paper">{d.label}</span>
            <span className="text-muted font-mono">{d.pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-ink overflow-hidden">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${Math.min(100, d.pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RiesgoPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([]);

  useEffect(() => {
    async function load() {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase.from("bonds").select("*").eq("estado", "activo"),
        supabase.from("patrimonio_snapshots").select("*").order("fecha", { ascending: true }),
      ]);
      setBonds((b as Bond[]) ?? []);
      setSnapshots((s as PatrimonioSnapshot[]) ?? []);
    }
    load();
  }, []);

  const computed = computePortfolio(bonds);
  const totals = portfolioTotals(computed);

  const duration = portfolioDuration(computed);
  const modDuration = portfolioModifiedDuration(computed);
  const convexity = portfolioConvexity(computed);

  const varHist = historicalDailyVaR(snapshots);
  const varParam = parametricDailyVaR(modDuration);

  const porMoneda = concentrationBy(computed, (b) => b.moneda);
  const porEmisor = concentrationBy(computed, (b) => b.corredor);
  const porDuration = concentrationBy(computed, (b) => durationBucket(b.duration));

  const retornoAnualizado = annualizedPortfolioReturn(snapshots);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Riesgo y benchmark</h1>
        <p className="text-sm text-muted mt-1">
          Sensibilidad a tasas, concentración de la cartera y comparación contra referencias de mercado.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Duration promedio"
          value={duration != null ? `${duration.toFixed(2)} años` : "—"}
          sub="Ponderada por valor de mercado"
        />
        <StatCard
          label="Duration modificada"
          value={modDuration != null ? modDuration.toFixed(2) : "—"}
          sub="Sensibilidad % ante ±100pb"
        />
        <StatCard
          label="Convexidad"
          value={convexity != null ? convexity.toFixed(2) : "—"}
          sub={convexity == null ? "Cargá el dato por bono" : undefined}
        />
        <StatCard
          label="VaR diario (95%)"
          value={
            varHist != null
              ? formatPct(varHist * 100)
              : varParam != null
                ? formatPct(varParam * 100)
                : "—"
          }
          tone="loss"
          sub={varHist != null ? "Histórico (snapshots)" : varParam != null ? "Paramétrico (estimado)" : undefined}
        />
      </div>

      <Panel title="Métricas de riesgo — cómo leerlas">
        <ul className="text-xs text-muted flex flex-col gap-1.5 list-disc pl-4">
          <li>
            <strong className="text-paper">Duration</strong>: años promedio hasta recuperar el valor invertido vía
            cupones y capital. A mayor duration, mayor sensibilidad a cambios de tasas.
          </li>
          <li>
            <strong className="text-paper">Duration modificada</strong>: aproxima cuánto se mueve el precio (%) ante
            un cambio de 100 puntos básicos en la tasa de interés.
          </li>
          <li>
            <strong className="text-paper">VaR (Value at Risk) diario al 95%</strong>: pérdida que, con 95% de
            confianza, no debería superarse en un día. El histórico usa tu propio track record de patrimonio; el
            paramétrico es una estimación basada en duration mientras se acumula historial (necesita ~3 semanas de
            snapshots para calcularse solo).
          </li>
        </ul>
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel title="Concentración por moneda">
          <ConcentrationBars data={porMoneda} />
        </Panel>
        <Panel title="Concentración por corredor">
          <ConcentrationBars data={porEmisor} />
        </Panel>
        <Panel title="Concentración por duration">
          <ConcentrationBars data={porDuration} />
        </Panel>
      </div>

      <Panel title="Cartera vs. benchmarks">
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between text-sm py-1.5 border-b border-ink-border/60">
            <span className="text-paper font-medium">Tu cartera (anualizada)</span>
            <span className="font-mono mono-num text-paper">
              {retornoAnualizado != null ? formatPct(retornoAnualizado) : "Necesita más historial"}
            </span>
          </div>
          {BENCHMARKS.map((bmk) => {
            const diff = retornoAnualizado != null ? retornoAnualizado - bmk.annualReturnPct : null;
            return (
              <div key={bmk.key} className="flex justify-between text-sm py-1.5 border-b border-ink-border/40 last:border-0">
                <span className="text-muted">{bmk.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono mono-num text-muted">{formatPct(bmk.annualReturnPct)}</span>
                  {diff != null && (
                    <span className={`font-mono mono-num text-xs ${diff >= 0 ? "text-gain" : "text-loss"}`}>
                      ({diff >= 0 ? "+" : ""}{diff.toFixed(1)}pp)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-3">
          Los benchmarks son valores de referencia editables (no hay API pública gratuita para el índice de bonos
          uruguayos ni la inflación en tiempo real) — ajustalos en <code className="text-gold">lib/risk.ts</code> con
          tu fuente preferida (BCU, BEVSA, etc.).
        </p>
      </Panel>
    </div>
  );
}
