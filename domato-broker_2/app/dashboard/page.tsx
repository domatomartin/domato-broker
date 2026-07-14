"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond, PatrimonioSnapshot } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatMoney, formatPct } from "@/lib/calculations";
import { StatCard, Panel, Badge } from "@/components/Card";
import PatrimonioChart from "@/components/PatrimonioChart";
import TickerStrip, { TickerItem } from "@/components/TickerStrip";
import { computeBondAlerts, severityOrder } from "@/lib/alerts";
import Link from "next/link";

export default function DashboardPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([]);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: bondsData }, { data: snapData }] = await Promise.all([
        supabase.from("bonds").select("*").eq("estado", "activo"),
        supabase.from("patrimonio_snapshots").select("*").order("fecha", { ascending: true }),
      ]);
      setBonds((bondsData as Bond[]) ?? []);
      setSnapshots((snapData as PatrimonioSnapshot[]) ?? []);
      setLoading(false);
    }
    load();

    fetch("/api/indices")
      .then((r) => r.json())
      .then((data) => setTicker(data.items ?? []))
      .catch(() => setTicker([]));
  }, []);

  const computed = computePortfolio(bonds);
  const totalsPerCurrency = portfolioTotals(computed);
const _tv = Object.values(totalsPerCurrency);
const valorTotal = _tv.reduce((s, t) => s + t.valorTotal, 0);
const costoTotal = _tv.reduce((s, t) => s + t.costoTotal, 0);
const gananciaTotal = valorTotal - costoTotal;
const rentabilidadTotal = costoTotal > 0 ? (gananciaTotal / costoTotal) * 100 : 0;
const totals = { valorTotal, costoTotal, gananciaTotal, rentabilidadTotal };

  const last = snapshots[snapshots.length - 1];
  const prevDay = snapshots[snapshots.length - 2];
  const prevMonth = snapshots.find(
    (s) => new Date(s.fecha) <= new Date(Date.now() - 30 * 86400000)
  );
  const prevYear = snapshots.find(
    (s) => new Date(s.fecha) <= new Date(Date.now() - 365 * 86400000)
  );

  const varDia = last && prevDay ? ((last.valor_total - prevDay.valor_total) / prevDay.valor_total) * 100 : 0;
  const varMes = last && prevMonth ? ((last.valor_total - prevMonth.valor_total) / prevMonth.valor_total) * 100 : 0;
  const varAnio = last && prevYear ? ((last.valor_total - prevYear.valor_total) / prevYear.valor_total) * 100 : 0;
  const maxHistorico = snapshots.reduce((max, s) => Math.max(max, s.valor_total), totals.valorTotal);

  return (
    <div className="flex flex-col">
      {ticker.length > 0 && <TickerStrip items={ticker} />}

      <div className="p-6 md:p-8 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl text-paper">Buenos días, Martín</h1>
          <p className="text-sm text-muted mt-1">
            Esto es lo que cambió en tu patrimonio desde ayer.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Valor total"
            value={loading ? "…" : formatMoney(totals.valorTotal)}
            tone="gold"
          />
          <StatCard
            label="Variación diaria"
            value={formatPct(varDia)}
            tone={varDia >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Variación mensual"
            value={formatPct(varMes)}
            tone={varMes >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Variación anual"
            value={formatPct(varAnio)}
            tone={varAnio >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Rentabilidad acumulada"
            value={formatPct(totals.rentabilidadTotal)}
            tone={totals.rentabilidadTotal >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Resultado del día"
            value={last && prevDay ? formatMoney(last.valor_total - prevDay.valor_total) : "—"}
            tone={varDia >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Patrimonio máximo"
            value={formatMoney(maxHistorico)}
          />
          <StatCard
            label="Bonos en cartera"
            value={String(bonds.length)}
          />
        </div>

        <Panel title="Evolución patrimonial">
          {snapshots.length > 0 ? (
            <PatrimonioChart
              data={snapshots.map((s) => ({
                fecha: new Date(s.fecha).toLocaleDateString("es-UY", {
                  day: "2-digit",
                  month: "short",
                }),
                valor: s.valor_total,
              }))}
            />
          ) : (
            <p className="text-sm text-muted py-8 text-center">
              Todavía no hay historial. Se genera automáticamente cada día a
              partir de tu cartera cargada.
            </p>
          )}
        </Panel>

        {(() => {
          const alerts = [...computeBondAlerts(computed)].sort(
            (a, b) => severityOrder(a.severidad) - severityOrder(b.severidad)
          );
          if (alerts.length === 0) return null;
          return (
            <Panel
              title={`${alerts.length} alerta${alerts.length === 1 ? "" : "s"}`}
              action={
                <Link href="/alertas" className="text-xs text-gold hover:underline">
                  Ver todas
                </Link>
              }
            >
              <div className="flex flex-col divide-y divide-ink-border/50">
                {alerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="py-2 flex items-center gap-3">
                    <Badge tone={a.severidad === "critical" ? "critical" : a.severidad === "warning" ? "warning" : "info"}>
                      {a.severidad === "critical" ? "Crítica" : a.severidad === "warning" ? "Atención" : "Info"}
                    </Badge>
                    <p className="text-sm text-paper">{a.mensaje}</p>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })()}
      </div>
    </div>
  );
}
