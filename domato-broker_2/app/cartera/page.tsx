"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Bond, BondComputed } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatMoney } from "@/lib/calculations";
import { Panel } from "@/components/Card";
import PortfolioTable from "@/components/PortfolioTable";
import BondDetailPanel from "@/components/BondDetailPanel";
import AddBondForm from "@/components/AddBondForm";
import CsvImport from "@/components/CsvImport";
import HtmlImport from "@/components/HtmlImport";
import clsx from "clsx";

type CuentaFiltro = "todas" | "2191" | "2192";
type MonedaFiltro = "todas" | "USD" | "UYU" | "ARS" | "UI";
type TipoFiltro = "todos" | "bono" | "accion";
type OrigenFiltro = "todos" | "local" | "exterior";
type Tasas = { UYU_per_USD: number; ARS_per_USD: number; UI_in_UYU: number; fetched_at: string };

const CUENTAS: { value: CuentaFiltro; label: string }[] = [
  { value: "todas", label: "Todas las cuentas" },
  { value: "2191", label: "Cta. 2191 — Nelson" },
  { value: "2192", label: "Cta. 2192 — Conjunta" },
];

function formatValorResumen(value: number, moneda: string) {
  const isosValidos = ["USD", "UYU", "ARS", "EUR", "BRL"];
  if (!isosValidos.includes(moneda)) {
    return `${value.toLocaleString("es-UY", { maximumFractionDigits: 0 })} ${moneda}`;
  }
  return formatMoney(value, moneda);
}

function calcTotalUSD(
  totales: Record<string, { valorTotal: number }>,
  tasas: Tasas
): number {
  const usd = totales["USD"]?.valorTotal ?? 0;
  const uyu = (totales["UYU"]?.valorTotal ?? 0) / tasas.UYU_per_USD;
  const ui = ((totales["UI"]?.valorTotal ?? 0) * tasas.UI_in_UYU) / tasas.UYU_per_USD;
  const ars = (totales["ARS"]?.valorTotal ?? 0) / tasas.ARS_per_USD;
  return usd + uyu + ui + ars;
}

function getTipo(b: Bond): "bono" | "accion" {
  return (b.cupon != null && b.cupon > 0) || !!b.proximo_vencimiento ? "bono" : "accion";
}

function getOrigen(b: Bond): "local" | "exterior" {
  if (!b.isin) return "exterior";
  return b.isin.toUpperCase().startsWith("UY") ? "local" : "exterior";
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
        active
          ? "bg-gold text-ink"
          : "border border-ink-border text-muted hover:text-paper hover:border-paper/40"
      )}
    >
      {label}
      {count !== undefined && (
        <span className={clsx("ml-1.5", active ? "opacity-70" : "opacity-50")}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CarteraPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [cuentaFiltro, setCuentaFiltro] = useState<CuentaFiltro>("todas");
  const [monedaFiltro, setMonedaFiltro] = useState<MonedaFiltro>("todas");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [origenFiltro, setOrigenFiltro] = useState<OrigenFiltro>("todos");
  const [tasas, setTasas] = useState<Tasas | null>(null);
  const [selectedBond, setSelectedBond] = useState<BondComputed | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo")
      .order("moneda", { ascending: true });
    setBonds((data as Bond[]) ?? []);
  }

  useEffect(() => {
    load();
    fetch("/api/cotizaciones")
      .then((r) => r.json())
      .then((t: Tasas) => setTasas(t))
      .catch(() => {});
  }, []);

  async function actualizarPrecios() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const resp = await fetch("/api/precios");
      if (!resp.ok) throw new Error(`Error al consultar BVM: ${resp.status}`);
      const precios: Record<string, { precio: number; cupon: number; fecha: string }> =
        await resp.json();
      if ("error" in precios) throw new Error((precios as unknown as { error: string }).error);
      let actualizados = 0;
      const sinPrecio: string[] = [];
      for (const bond of bonds) {
        if (!bond.isin) continue;
        const dato = precios[bond.isin];
        if (dato) {
          await supabase
            .from("bonds")
            .update({ precio_actual: dato.precio })
            .eq("id", bond.id);
          actualizados++;
        } else {
          sinPrecio.push(bond.nombre);
        }
      }
      await load();
      const base = `✓ ${actualizados} precio${actualizados !== 1 ? "s" : ""} actualizados desde BVM`;
      setRefreshMsg(
        sinPrecio.length > 0
          ? `${base} · Sin precio BVM: ${sinPrecio.join(", ")}`
          : base
      );
    } catch (err) {
      setRefreshMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  const bondsPorCuenta =
    cuentaFiltro === "todas" ? bonds : bonds.filter((b) => b.cuenta === cuentaFiltro);

  const countMoneda = (m: MonedaFiltro) =>
    m === "todas" ? bondsPorCuenta.length : bondsPorCuenta.filter((b) => b.moneda === m).length;
  const countTipo = (t: TipoFiltro) =>
    t === "todos" ? bondsPorCuenta.length : bondsPorCuenta.filter((b) => getTipo(b) === t).length;
  const countOrigen = (o: OrigenFiltro) =>
    o === "todos" ? bondsPorCuenta.length : bondsPorCuenta.filter((b) => getOrigen(b) === o).length;

  const bondsFiltrados = bondsPorCuenta
    .filter((b) => monedaFiltro === "todas" || b.moneda === monedaFiltro)
    .filter((b) => tipoFiltro === "todos" || getTipo(b) === tipoFiltro)
    .filter((b) => origenFiltro === "todos" || getOrigen(b) === origenFiltro);

  const computed = computePortfolio(bondsFiltrados);
  const totales = portfolioTotals(computed);

  const ordenMonedas = ["USD", "UYU", "UI", "ARS"];
  const monedasOrdenadas = [
    ...ordenMonedas.filter((m) => totales[m]),
    ...Object.keys(totales).filter((m) => !ordenMonedas.includes(m)),
  ];

  const totalUSD = tasas ? calcTotalUSD(totales, tasas) : null;

  const monedasPresentes = [...new Set(bondsPorCuenta.map((b) => b.moneda))];
  const monedasFiltro: MonedaFiltro[] = (["USD", "UYU", "ARS", "UI"] as MonedaFiltro[]).filter(
    (m) => monedasPresentes.includes(m)
  );

  const totalMonedaSeleccionada = selectedBond
    ? totales[selectedBond.moneda]?.valorTotal ?? 0
    : 0;

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-paper">Cartera</h1>
          <p className="text-sm text-muted mt-1">
            {bondsFiltrados.length} activo{bondsFiltrados.length !== 1 ? "s" : ""}
            {cuentaFiltro !== "todas" && ` · cuenta ${cuentaFiltro}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CsvImport onImported={load} />
          <Link
            href="/precios"
            className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold hover:text-gold transition-colors"
          >
            ⚙ Actualizar precios
          </Link>
          <button
            onClick={actualizarPrecios}
            disabled={refreshing}
            className="rounded border border-gold/40 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 transition-colors disabled:opacity-50"
          >
            {refreshing ? "Actualizando…" : "↻ Precios BVM"}
          </button>
          <button
            onClick={() => setShowImport((s) => !s)}
            className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold hover:text-gold transition-colors"
          >
            {showImport ? "Cerrar importador" : "Importar informe BCE&M"}
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors"
          >
            {showForm ? "Cerrar formulario" : "+ Agregar"}
          </button>
        </div>
      </div>

      {refreshMsg && (
        <p className="text-xs text-muted bg-surface-2 rounded px-3 py-2">
          {refreshMsg}
        </p>
      )}

      {showImport && (
        <Panel title="Importar informe BCE&M (.htm)">
          <HtmlImport onImported={() => { load(); setShowImport(false); }} />
        </Panel>
      )}

      {totalUSD !== null && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gold">
              Total cartera equivalente USD
            </span>
            <p className="text-3xl font-mono font-bold text-gold mt-1">
              {formatMoney(totalUSD, "USD")}
            </p>
            <p className="text-xs text-muted mt-1">
              1 USD = {tasas!.UYU_per_USD.toFixed(2)} UYU · 1 UI = {tasas!.UI_in_UYU.toFixed(4)} UYU · 1 USD = {tasas!.ARS_per_USD.toFixed(0)} ARS
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-ink-border">
        {CUENTAS.map((c) => (
          <button
            key={c.value}
            onClick={() => {
              setCuentaFiltro(c.value);
              setMonedaFiltro("todas");
              setTipoFiltro("todos");
              setOrigenFiltro("todos");
            }}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors rounded-t",
              cuentaFiltro === c.value
                ? "text-gold border-b-2 border-gold -mb-px bg-ink/20"
                : "text-muted hover:text-paper",
            ].join(" ")}
          >
            {c.label}
            {c.value !== "todas" && (
              <span className="ml-2 text-xs text-muted font-normal">
                ({bonds.filter((b) => b.cuenta === c.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted font-medium mr-0.5">Moneda</span>
          <FilterChip active={monedaFiltro === "todas"} label="Todas" count={countMoneda("todas")} onClick={() => setMonedaFiltro("todas")} />
          {monedasFiltro.map((m) => (
            <FilterChip key={m} active={monedaFiltro === m} label={m} count={countMoneda(m)} onClick={() => setMonedaFiltro(m)} />
          ))}
        </div>
        <div className="w-px h-4 bg-ink-border hidden sm:block" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted font-medium mr-0.5">Tipo</span>
          {([{ value: "todos", label: "Todos" }, { value: "bono", label: "Bono" }, { value: "accion", label: "Accion" }] as { value: TipoFiltro; label: string }[]).map(({ value, label }) => (
            <FilterChip key={value} active={tipoFiltro === value} label={label} count={value !== "todos" ? countTipo(value) : undefined} onClick={() => setTipoFiltro(value)} />
          ))}
        </div>
        <div className="w-px h-4 bg-ink-border hidden sm:block" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted font-medium mr-0.5">Origen</span>
          {([{ value: "todos", label: "Todos" }, { value: "local", label: "Uruguay" }, { value: "exterior", label: "Exterior" }] as { value: OrigenFiltro; label: string }[]).map(({ value, label }) => (
            <FilterChip key={value} active={origenFiltro === value} label={label} count={value !== "todos" ? countOrigen(value) : undefined} onClick={() => setOrigenFiltro(value)} />
          ))}
        </div>
      </div>

      {monedasOrdenadas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {monedasOrdenadas.map((moneda) => {
            const t = totales[moneda];
            return (
              <div key={moneda} className="rounded-lg border border-ink-border bg-ink/30 p-4 flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {moneda}
                  {moneda === "UI" && <span className="ml-1 text-warn normal-case">aprox BCU</span>}
                </span>
                <span className="text-xl font-mono font-semibold text-paper">
                  {formatValorResumen(t.valorTotal, moneda)}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className={clsx("font-medium", t.gananciaTotal >= 0 ? "text-gain" : "text-loss")}>
                    {t.gananciaTotal >= 0 ? "+" : ""}{formatValorResumen(t.gananciaTotal, moneda)}
                  </span>
                  <span className="text-muted">
                    {t.rentabilidadTotal >= 0 ? "+" : ""}{t.rentabilidadTotal.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Panel title="Nuevo activo">
          <AddBondForm onAdded={() => { load(); setShowForm(false); }} />
        </Panel>
      )}

      <Panel title={cuentaFiltro === "todas" ? "Detalle de cartera" : `Cuenta ${cuentaFiltro}`}>
        <PortfolioTable bonds={computed} onChanged={load} onSelect={(b) => setSelectedBond(b)} />
      </Panel>

      {selectedBond && (
        <BondDetailPanel
          bond={selectedBond}
          totalMoneda={totalMonedaSeleccionada}
          onClose={() => setSelectedBond(null)}
        />
      )}
    </div>
  );
}
