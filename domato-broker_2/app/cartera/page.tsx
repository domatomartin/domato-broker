"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { computePortfolio } from "@/lib/calculations";
import { Panel } from "@/components/Card";
import PortfolioTable from "@/components/PortfolioTable";
import AddBondForm from "@/components/AddBondForm";
import CsvImport from "@/components/CsvImport";

export default function CarteraPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [showForm, setShowForm] = useState(false);

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

  const computed = computePortfolio(bonds);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-paper">Cartera</h1>
          <p className="text-sm text-muted mt-1">
            {bonds.length} bono{bonds.length !== 1 ? "s" : ""} activo{bonds.length !== 1 ? "s" : ""}
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

      <Panel title="Detalle de cartera">
        <PortfolioTable bonds={computed} onChanged={load} />
      </Panel>
    </div>
  );
}
