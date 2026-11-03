"use client";

import { aUSD, type TasasFx } from "@/lib/fx";

import { useEffect, useMemo, useState } from "react";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { posiciones, resumen } from "@/lib/estadoCuenta";
import { supabase } from "@/lib/supabase";
import { Bond, PatrimonioSnapshot } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatMoney, formatPct } from "@/lib/calculations";
import { StatCard, Panel, Badge } from "@/components/Card";
import PatrimonioChart from "@/components/PatrimonioChart";
import TickerStrip, { TickerItem } from "@/components/TickerStrip";
import { computeBondAlerts, severityOrder } from "@/lib/alerts";
import Link from "next/link";
import ResumenDia from "@/components/ResumenDia";

type Tasas = TasasFx & { ARS_per_USD: number; fetched_at: string };

function toUSD(valor: number, moneda: string, tasas: Tasas): number {
  return aUSD(valor, moneda, tasas);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function DashboardPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([]);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasas, setTasas] = useState<Tasas | null>(null);
  const [greeting, setGreeting] = useState("Buenos días");
  const [userName, setUserName] = useState("Martín");

  useEffect(() => {
    setGreeting(getGreeting());

    supabase.auth.getSession().then(({ data }) => {
      const meta = data.session?.user?.user_metadata;
      if (meta?.name) {
        setUserName(meta.name.split(" ")[0]);
      } else if (data.session?.user?.email) {
        const local = data.session.user.email.split("@")[0];
        setUserName(local.charAt(0).toUpperCase() + local.slice(1));
      }
    });

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

    fetch("/api/cotizaciones")
      .then((r) => r.json())
      .then((t: Tasas) => setTasas(t))
      .catch(() => {});

    fetch("/api/indices")
      .then((r) => r.json())
      .then((data) => setTicker(data.items ?? []))
      .catch(() => setTicker([]));
  }, []);

  // Mismo cálculo que Clientes, Estado de cuenta y el portal: precio + cupón corrido, con costos de compra.
  const datos = useDatosCartera();
  const res = useMemo(() => (datos.cargando ? null : resumen(posiciones(datos.bonds, datos.costos, datos.instrumentos, datos.tasas, datos.fxPorPropuesta))), [datos]);
  const valorTotalUSD = res ? res.valorUSD : null;
  const rentabilidadTotal = res && res.invertidoUSD > 0 ? (res.resultadoUSD / res.invertidoUSD) * 100 : 0;
  const computed = computePortfolio(bonds);
  void toUSD; void tasas; void portfolioTotals;

  // El histórico arranca con la cartera actual (los registros anteriores eran de otra cartera).
  const inicioCartera = bonds.reduce((m, b) => { const f = (b.fecha_compra ?? b.created_at ?? "").slice(0, 10); return f && f < m ? f : m; }, "9999-12-31");
  // Se descartan registros vacíos o claramente erróneos (más de 3 veces lejos del valor actual).
  const snapshotsCartera = snapshots.filter((x) => x.fecha >= inicioCartera && x.valor_total > 0 && (!valorTotalUSD || (x.valor_total < valorTotalUSD * 3 && x.valor_total > valorTotalUSD / 3)));
  const last = snapshotsCartera[snapshotsCartera.length - 1];
  const prevDay = snapshotsCartera[snapshotsCartera.length - 2];
  const prevMonth = snapshotsCartera.find(
    (s) => new Date(s.fecha) <= new Date(Date.now() - 30 * 86400000)
  );
  const prevYear = snapshotsCartera.find(
    (s) => new Date(s.fecha) <= new Date(Date.now() - 365 * 86400000)
  );

  const varDia = last && prevDay ? ((last.valor_total - prevDay.valor_total) / prevDay.valor_total) * 100 : 0;
  const varMes = last && prevMonth ? ((last.valor_total - prevMonth.valor_total) / prevMonth.valor_total) * 100 : 0;
  const varAnio = last && prevYear ? ((last.valor_total - prevYear.valor_total) / prevYear.valor_total) * 100 : 0;
  const maxHistorico = snapshotsCartera.reduce(
    (max, s) => Math.max(max, s.valor_total),
    valorTotalUSD ?? 0
  );

  return (
    <div className="flex flex-col">
      {ticker.length > 0 && <TickerStrip items={ticker} />}

      <div className="p-6 md:p-8 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl text-paper">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-muted mt-1">
            Lo importante de hoy y cómo viene tu patrimonio.
          </p>
        </div>

        <ResumenDia />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Valor total (eq. USD)"
            value={loading || valorTotalUSD === null ? "…" : formatMoney(valorTotalUSD, "USD")}
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
            value={formatPct(rentabilidadTotal)}
            tone={rentabilidadTotal >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Resultado del día (USD)"
            value={last && prevDay ? formatMoney(last.valor_total - prevDay.valor_total, "USD") : "—"}
            tone={varDia >= 0 ? "gain" : "loss"}
          />
          <StatCard
            label="Patrimonio máximo (USD)"
            value={formatMoney(maxHistorico, "USD")}
          />
          <StatCard
            label="Bonos en cartera"
            value={String(bonds.length)}
          />
        </div>

        <Panel title="Evolución patrimonial">
          {snapshotsCartera.length > 0 ? (
            <PatrimonioChart
              data={snapshotsCartera.map((s) => ({
                fecha: new Date(s.fecha).toLocaleDateString("es-UY", {
                  day: "2-digit",
                  month: "short",
                }),
                valor: s.valor_total,
              }))}
            />
          ) : (
            <div className="py-8 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-muted">
                Todavía no hay historial. Se genera automáticamente cada día a partir de tu cartera cargada.
              </p>
              <Link href="/cartera" className="text-xs text-gold hover:underline">
                Ir a cartera →
              </Link>
            </div>
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
