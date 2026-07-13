"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";
import { CSV_BOND_COLUMNS } from "@/lib/types";

// Convierte DD/MM/YYYY a YYYY-MM-DD. Si ya viene en ISO o está vacía, la deja.
function normalizarFecha(s: string | undefined | null): string | null {
  if (!s || s.trim() === "") return null;
  const matchDMY = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchDMY) return matchDMY[3] + "-" + matchDMY[2] + "-" + matchDMY[1];
  return s.trim();
}

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

        if (rows.length === 0 || !rows[0].nombre) {
          setError("El CSV debe tener las columnas:\n" + CSV_BOND_COLUMNS.join(", "));
          setStatus(null);
          return;
        }

        // Deduplicación: traer ISINs ya existentes
        const isinsCsv = rows.map((r) => r.isin?.trim()).filter((v): v is string => !!v);
        let isinsDuplicados = new Set<string>();
        if (isinsCsv.length > 0) {
          const { data: existentes } = await supabase
            .from("bonds")
            .select("isin")
            .eq("estado", "activo")
            .in("isin", isinsCsv);
          isinsDuplicados = new Set((existentes ?? []).map((e: { isin: string }) => e.isin));
        }

        const payload = rows
          .filter((row) => {
            const isin = row.isin?.trim();
            if (isin && isinsDuplicados.has(isin)) return false;
            return true;
          })
          .map((row) => ({
            nombre: row.nombre,
            codigo: row.codigo?.trim() || null,
            isin: row.isin?.trim() || null,
            moneda: row.moneda?.trim() || "USD",
            cantidad: Number(row.cantidad || 0),
            valor_nominal: Number(row.valor_nominal || 0),
            precio_compra: Number(row.precio_compra || 0),
            precio_actual: Number(row.precio_actual || row.precio_compra || 0),
            cupon: row.cupon ? Number(row.cupon) : null,
            proximo_pago_interes: normalizarFecha(row.proximo_pago_interes),
            proximo_vencimiento: normalizarFecha(row.proximo_vencimiento),
            fecha_compra: normalizarFecha(row.fecha_compra),
            corredor: row.corredor?.trim() || null,
            cuenta: row.cuenta?.trim() || null,
            estado: "activo",
          }));

        const omitidos = rows.length - payload.length;

        if (payload.length === 0) {
          setStatus(
            omitidos > 0
              ? "Todos los bonos del CSV ya existen en la cartera (" + omitidos + " omitido" + (omitidos > 1 ? "s" : "") + ")."
              : "No hay filas válidas para importar."
          );
          return;
        }

        const { error: insertError } = await supabase.from("bonds").insert(payload);
        if (insertError) {
          setError(insertError.message);
          setStatus(null);
          return;
        }

        const msg =
          omitidos > 0
            ? "Se importaron " + payload.length + " bono" + (payload.length > 1 ? "s" : "") + ". " + omitidos + " omitido" + (omitidos > 1 ? "s" : "") + " por duplicado."
            : "Se importaron " + payload.length + " bono" + (payload.length > 1 ? "s" : "") + ".";
        setStatus(msg);
        onImported?.();
        if (inputRef.current) inputRef.current.value = "";
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
        <a href="/plantilla-cartera.csv" download className="text-xs text-muted underline hover:text-gold">
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
