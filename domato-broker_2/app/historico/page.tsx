"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PatrimonioSnapshot } from "@/lib/types";
import { formatMoney, formatPct } from "@/lib/calculations";
import { Panel, StatCard } from "@/components/Card";
import PatrimonioChart from "@/components/PatrimonioChart";

function findClosest(snapshots: PatrimonioSnapshot[], daysAgo: number) {
  const target = Date.now() - daysAgo * 86400000;
  return snapshots.reduce((best, s) => {
    const t = new Date(s.fecha).getTime();
    if (t > target) return best;
    if (!best || t > new Date(best.fecha).getTime()) return s;
    return best;
  }, null as PatrimonioSnapshot | null);
}

export default function HistoricoPage() {
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([]);

  useEffect(() => {
    supabase
      .from("patrimonio_snapshots")
      .select("*")
      .order("fecha", { ascending: true })
      .then(({ data }) => setSnapshots((data as PatrimonioSnapshot[]) ?? []));
  }, []);

  const last = snapshots[snapshots.length - 1];
  const ayer = findClosest(snapshots, 1);
  const mesPasado = findClosest(snapshots, 30);
  const anioPasado = findClosest(snapshots, 365);

  function comparar(base: PatrimonioSnapshot | null) {
    if (!last || !base) return null;
    return ((last.valor_total - base.valor_total) / base.valor_total) * 100;
  }

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Histórico patrimonial</h1>
        <p className="text-sm text-muted mt-1">
          Comparativo de tu patrimonio en el tiempo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Hoy vs. ayer"
          value={ayer ? formatPct(comparar(ayer) ?? 0) : "—"}
          tone={(comparar(ayer) ?? 0) >= 0 ? "gain" : "loss"}
        />
        <StatCard
          label="Hoy vs. hace un mes"
          value={mesPasado ? formatPct(comparar(mesPasado) ?? 0) : "—"}
          tone={(comparar(mesPasado) ?? 0) >= 0 ? "gain" : "loss"}
        />
        <StatCard
          label="Hoy vs. hace un año"
          value={anioPasado ? formatPct(comparar(anioPasado) ?? 0) : "—"}
          tone={(comparar(anioPasado) ?? 0) >= 0 ? "gain" : "loss"}
        />
      </div>

      <Panel title="Patrimonio diario">
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
            El histórico se completa automáticamente día a día.
          </p>
        )}
      </Panel>

      <Panel title="Registro de valores">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-panel">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-ink-border">
                <th className="py-2">Fecha</th>
                <th className="py-2 text-right">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((s) => (
                <tr key={s.id ?? s.fecha} className="border-b border-ink-border/50">
                  <td className="py-2">{new Date(s.fecha).toLocaleDateString("es-UY")}</td>
                  <td className="py-2 text-right font-mono mono-num">
                    {formatMoney(s.valor_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
