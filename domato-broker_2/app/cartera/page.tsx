"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { computePortfolio } from "@/lib/calculations";
import { Panel } from "@/components/Card";
import PortfolioTable from "@/components/PortfolioTable";
import AddBondForm from "@/components/AddBondForm";
import CsvImport from "@/components/CsvImport";

type CuentaFiltro = "todas" | "2191" | "2192";

const CUENTAS: { value: CuentaFiltro; label: string }[] = [
  { value: "todas", label: "Todas las cuentas" },
  { value: "2191", label: "Cta. 2191 — Nelson" },
  { value: "2192", label: "Cta. 2192 — Conjunta" },
];

export default function CarteraPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [cuentaFiltro, setCuentaFiltro] = useState<CuentaFiltro>("todas");

  async function load() {
    const { data } = await supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo")
      .order("proximo_vencimiento", { ascending: true });
    setBonds((data as Bond[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const bondsFiltrados =
    cuentaFiltro === "todas"
      ? bonds
      : bonds.filter((b) => b.cuenta === cuentaFiltro);

  const computed = computePortfolio(bondsFiltrados);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-paper">Cartera</h1>
          <p className="text-sm text-muted mt-1">
            {bondsFiltrados.length} bono{bondsFiltrados.length !== 1 ? "s" : ""} activo
            {bondsFiltrados.length !== 1 ? "s" : ""}
            {cuentaFiltro !== "todas" && ` · cuenta ${cuentaFiltro}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CsvImport onImported={load} />
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-bright transition-colors"
          >
            {showForm ? "Cerrar formulario" : "+ Agregar bono"}
          </button>
        </div>
      </div>

      {/* Tabs de cuenta */}
      <div className="flex gap-1 border-b border-ink-border">
        {CUENTAS.map((c) => (
          <button
            key={c.value}
            onClick={() => setCuentaFiltro(c.value)}
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

      {/* Formulario nuevo bono */}
      {showForm && (
        <Panel title="Nuevo bono">
          <AddBondForm
            onAdded={() => {
              load();
              setShowForm(false);
            }}
          />
        </Panel>
      )}

      {/* Tabla */}
      <Panel title={cuentaFiltro === "todas" ? "Detalle de cartera" : `Cuenta ${cuentaFiltro}`}>
        <PortfolioTable bonds={computed} onChanged={load} />
      </Panel>
    </div>
  );
}
