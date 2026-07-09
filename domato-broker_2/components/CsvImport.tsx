"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";
import { CSV_BOND_COLUMNS } from "@/lib/types";

export default function CsvImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setStatus("Procesando…");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const payload = rows.map((row) => ({
          nombre: row.nombre,
          codigo: row.codigo || null,
          isin: row.isin || null,
          moneda: row.moneda || "USD",
          cantidad: Number(row.cantidad || 0),
          valor_nominal: Number(row.valor_nominal || 0),
          precio_compra: Number(row.precio_compra || 0),
          precio_actual: Number(row.precio_actual || row.precio_compra || 0),
          cupon: row.cupon ? Number(row.cupon) : null,
          proximo_pago_interes: row.proximo_pago_interes || null,
          proximo_vencimiento: row.proximo_vencimiento || null,
          fecha_compra: row.fecha_compra || null,
          corredor: row.corredor || null,
          estado: "activo",
        }));

        if (payload.length === 0 || !payload[0].nombre) {
          setError(
            `El CSV debe tener columnas: ${CSV_BOND_COLUMNS.join(", ")}`
          );
          setStatus(null);
          return;
        }

        const { error } = await supabase.from("bonds").insert(payload);
        if (error) {
          setError(error.message);
          setStatus(null);
          return;
        }

        setStatus(`Se importaron ${payload.length} bonos.`);
        onImported?.();
      },
      error: (err) => {
        setError(err.message);
        setStatus(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold hover:text-gold transition-colors"
        >
          Importar CSV
        </button>
        <a
          href="/plantilla-cartera.csv"
          download
          className="text-xs text-muted underline hover:text-gold"
        >
          Descargar plantilla
        </a>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {status && <p className="text-xs text-gain">{status}</p>}
      {error && <p className="text-xs text-loss whitespace-pre-line">{error}</p>}
    </div>
  );
}
