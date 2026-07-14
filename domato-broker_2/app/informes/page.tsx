"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond, PatrimonioSnapshot } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatMoney, formatPct } from "@/lib/calculations";
import { Panel } from "@/components/Card";

type Tasas = { UYU_per_USD: number; ARS_per_USD: number; UI_in_UYU: number; fetched_at: string };

function formatValorPDF(value: number, moneda: string): string {
  const isosValidos = ["USD", "UYU", "ARS", "EUR", "BRL"];
  if (!isosValidos.includes(moneda)) {
    return value.toLocaleString("es-UY", { maximumFractionDigits: 0 }) + " " + moneda;
  }
  return formatMoney(value, moneda);
}

function calcTotalUSD(totales: Record<string, { valorTotal: number }>, tasas: Tasas): number {
  const usd = totales["USD"]?.valorTotal ?? 0;
  const uyu = (totales["UYU"]?.valorTotal ?? 0) / tasas.UYU_per_USD;
  const ui = ((totales["UI"]?.valorTotal ?? 0) * tasas.UI_in_UYU) / tasas.UYU_per_USD;
  const ars = (totales["ARS"]?.valorTotal ?? 0) / tasas.ARS_per_USD;
  return usd + uyu + ui + ars;
}

export default function InformesPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([]);
  const [tasas, setTasas] = useState<Tasas | null>(null);

  // Historial
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [histFecha, setHistFecha] = useState("");
  const [histValor, setHistValor] = useState("");
  const [histLoading, setHistLoading] = useState(false);
  const [histMsg, setHistMsg] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase.from("bonds").select("*").eq("estado", "activo"),
        supabase.from("patrimonio_snapshots").select("*").order("fecha", { ascending: false }),
      ]);
      setBonds((b as Bond[]) ?? []);
      setSnapshots((s as PatrimonioSnapshot[]) ?? []);
    }
    load();
    fetch("/api/cotizaciones")
      .then((r) => r.json())
      .then((t: Tasas) => setTasas(t))
      .catch(() => {});
  }, []);

  const computed = computePortfolio(bonds);
  const totales = portfolioTotals(computed);

  async function exportarPDF(tipo: "diario" | "mensual" | "anual") {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Informe ${tipo} — Domato Broker`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generado el ${new Date().toLocaleDateString("es-UY")}`, 14, 25);

    let y = 32;

    if (tasas) {
      const totalUSD = calcTotalUSD(totales, tasas);
      doc.setFontSize(13);
      doc.setTextColor(180, 140, 60);
      doc.text(`Total cartera: ${formatMoney(totalUSD, "USD")} (equivalente USD)`, 14, y);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text(
        `Tasas: 1 USD = ${tasas.UYU_per_USD.toFixed(2)} UYU · 1 UI = ${tasas.UI_in_UYU.toFixed(4)} UYU · 1 USD = ${tasas.ARS_per_USD.toFixed(0)} ARS · fuente: open.er-api.com / BCU`,
        14, y + 6
      );
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      y += 14;
    }

    const ordenMonedas = ["USD", "UYU", "UI", "ARS"];
    const monedasOrdenadas = [
      ...ordenMonedas.filter((m) => totales[m]),
      ...Object.keys(totales).filter((m) => !ordenMonedas.includes(m)),
    ];
    for (const moneda of monedasOrdenadas) {
      const t = totales[moneda];
      doc.text(
        `Valor cartera ${moneda}: ${formatValorPDF(t.valorTotal, moneda)} · Rent.: ${formatPct(t.rentabilidadTotal)}`,
        14, y
      );
      y += 6;
    }

    autoTable(doc, {
      startY: y + 2,
      head: [["Bono", "Moneda", "Cuenta", "Valor de mercado", "G/P", "Rent. %"]],
      body: computed.map((b) => [
        b.nombre, b.moneda, b.cuenta ?? "—",
        formatValorPDF(b.valor_mercado, b.moneda),
        formatValorPDF(b.ganancia, b.moneda),
        formatPct(b.rentabilidad_pct),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [28, 32, 41] },
    });

    doc.save(`informe-${tipo}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      computed.map((b) => ({
        Bono: b.nombre, ISIN: b.isin, Moneda: b.moneda, Cuenta: b.cuenta ?? "—",
        Cantidad: b.cantidad, "Precio actual": b.precio_actual,
        "Valor de mercado": b.valor_mercado, "G/P": b.ganancia,
        "Rentabilidad %": b.rentabilidad_pct, "Próximo vencimiento": b.proximo_vencimiento,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cartera");
    XLSX.writeFile(wb, `cartera-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function resetHistorial() {
    if (!confirm("¿Borrar todo el historial y crear un snapshot de hoy con el valor actual?")) return;
    setResetLoading(true);
    setResetMsg("");
    try {
      const res = await fetch("/api/snapshots/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (data.ok) {
        setResetMsg(`✓ Historial reiniciado. Valor hoy: ${formatMoney(data.valor_total, "USD")}`);
        const { data: s } = await supabase.from("patrimonio_snapshots").select("*").order("fecha", { ascending: false });
        setSnapshots((s as PatrimonioSnapshot[]) ?? []);
      } else {
        setResetMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setResetMsg("Error de red");
    }
    setResetLoading(false);
  }

  async function cargarHistorico(e: React.FormEvent) {
    e.preventDefault();
    if (!histFecha || !histValor) return;
    setHistLoading(true);
    setHistMsg("");
    try {
      const res = await fetch("/api/snapshots/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "historico", fecha: histFecha, valor_total: parseFloat(histValor) }),
      });
      const data = await res.json();
      if (data.ok) {
        setHistMsg(`✓ Cierre ${histFecha} cargado: ${formatMoney(parseFloat(histValor), "USD")}`);
        setHistFecha(""); setHistValor("");
        const { data: s } = await supabase.from("patrimonio_snapshots").select("*").order("fecha", { ascending: false });
        setSnapshots((s as PatrimonioSnapshot[]) ?? []);
      } else {
        setHistMsg(`Error: ${data.error}`);
      }
    } catch {
      setHistMsg("Error de red");
    }
    setHistLoading(false);
  }

  const bonosOrdenados = [...computed].sort((a, b) => b.rentabilidad_pct - a.rentabilidad_pct);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Informes</h1>
        <p className="text-sm text-muted mt-1">Reportes exportables en PDF y Excel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel title="Informe diario">
          <p className="text-xs text-muted mb-4">Valor de cartera por moneda, rentabilidad y posición completa.</p>
          <button onClick={() => exportarPDF("diario")} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors">Descargar PDF</button>
        </Panel>
        <Panel title="Informe mensual">
          <p className="text-xs text-muted mb-4">Rentabilidad mensual, evolución patrimonial y bonos más/menos rentables.</p>
          <button onClick={() => exportarPDF("mensual")} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors">Descargar PDF</button>
        </Panel>
        <Panel title="Informe anual">
          <p className="text-xs text-muted mb-4">Rentabilidad anual, rendimiento por activo y por moneda.</p>
          <button onClick={() => exportarPDF("anual")} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors">Descargar PDF</button>
        </Panel>
      </div>

      <Panel title="Exportar cartera completa a Excel" action={
        <button onClick={exportarExcel} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold hover:text-gold transition-colors">Descargar .xlsx</button>
      }>
        <p className="text-xs text-muted">Incluye todos los campos de cada bono con valores y rentabilidad calculados al día de hoy.</p>
      </Panel>

      {/* Historial de patrimonio */}
      <Panel title="Historial patrimonial">
        <div className="flex flex-col gap-6">

          {/* Reset */}
          <div>
            <p className="text-xs text-muted mb-3">
              Reinicia el historial borrando todos los snapshots anteriores e inserta uno nuevo con el valor actual de la cartera convertido a USD.
            </p>
            <button
              onClick={resetHistorial}
              disabled={resetLoading}
              className="rounded border border-loss/50 px-4 py-2 text-sm font-medium text-loss hover:bg-loss/10 transition-colors disabled:opacity-50"
            >
              {resetLoading ? "Reiniciando…" : "Reiniciar historial desde hoy"}
            </button>
            {resetMsg && <p className="mt-2 text-xs text-muted">{resetMsg}</p>}
          </div>

          <hr className="border-ink-border" />

          {/* Cierres históricos */}
          <div>
            <p className="text-xs font-medium text-paper mb-1">Cargar cierre anual / histórico</p>
            <p className="text-xs text-muted mb-3">
              Ingresá la fecha (ej. 31/12/2022) y el valor total de cartera en dólares equivalentes de ese momento.
            </p>
            <form onSubmit={cargarHistorico} className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Fecha</label>
                <input
                  type="date"
                  value={histFecha}
                  onChange={(e) => setHistFecha(e.target.value)}
                  className="rounded border border-ink-border bg-transparent px-3 py-1.5 text-sm text-paper focus:outline-none focus:border-gold"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Valor total (USD equivalente)</label>
                <input
                  type="number"
                  value={histValor}
                  onChange={(e) => setHistValor(e.target.value)}
                  placeholder="ej. 18500000"
                  className="rounded border border-ink-border bg-transparent px-3 py-1.5 text-sm text-paper focus:outline-none focus:border-gold w-48"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={histLoading}
                className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors disabled:opacity-50"
              >
                {histLoading ? "Guardando…" : "Guardar"}
              </button>
            </form>
            {histMsg && <p className="mt-2 text-xs text-muted">{histMsg}</p>}
          </div>

          {/* Tabla de snapshots actuales */}
          {snapshots.length > 0 && (
            <div>
              <p className="text-xs font-medium text-paper mb-2">Historial cargado ({snapshots.length} entradas)</p>
              <div className="overflow-auto max-h-48 rounded border border-ink-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-ink/40">
                      <th className="px-3 py-2 text-left text-muted font-medium">Fecha</th>
                      <th className="px-3 py-2 text-right text-muted font-medium">Valor (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.fecha} className="border-t border-ink-border/50">
                        <td className="px-3 py-1.5 text-paper">{s.fecha}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-paper">{formatMoney(s.valor_total, "USD")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Ranking de rentabilidad">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase text-muted mb-2">Más rentables</p>
            {bonosOrdenados.slice(0, 3).map((b) => (
              <div key={b.id} className="flex justify-between py-1 border-b border-ink-border/40">
                <span>{b.nombre}</span>
                <span className="text-gain font-mono">{formatPct(b.rentabilidad_pct)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs uppercase text-muted mb-2">Menos rentables</p>
            {[...bonosOrdenados].reverse().slice(0, 3).map((b) => (
              <div key={b.id} className="flex justify-between py-1 border-b border-ink-border/40">
                <span>{b.nombre}</span>
                <span className="text-loss font-mono">{formatPct(b.rentabilidad_pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
