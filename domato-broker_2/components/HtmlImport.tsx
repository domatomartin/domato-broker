"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ParsedBond {
  nombre: string;
  isin: string | null;
  moneda: string;
  valor_nominal: number;
  fecha_compra: string | null;
  cupon: number | null;
  frecuencia: number | null;
  proximo_vencimiento: string | null;
  proximo_pago_interes: string | null;
  interes_corrido: number;
}

interface ParseResult {
  cuenta: string | null;
  bonds: ParsedBond[];
}

function parseFecha(s: string | undefined | null): string | null {
  const m = s?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseNum(s: string | undefined | null): number {
  return parseFloat((s ?? "").replace(/,/g, "")) || 0;
}

function mapMoneda(code: string): string {
  const MAP: Record<string, string> = { $: "UYU", UST: "USD", USD: "USD", UI: "UI", ARS: "ARS" };
  return MAP[code] ?? code;
}

const CASH_NOMBRES = new Set([
  "Pesos Uruguayos",
  "Dólares USA (Billetes)",
  "Dólares USA (Transferencia)",
]);

function parseHtml(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));

  if (tables.length < 9) {
    throw new Error(
      `Formato inesperado: se encontraron ${tables.length} tablas (se esperan al menos 9). ¿Es un informe BCE&M?`
    );
  }

  let cuenta: string | null = null;
  for (const tr of Array.from(tables[2]?.querySelectorAll("tr") ?? [])) {
    const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => td.textContent?.trim() ?? "");
    if (cells[0]?.includes("Cuenta")) { cuenta = cells[1]?.replace(/[^0-9]/g, "") || null; break; }
  }

  const posMap = new Map<string, { moneda: string; valor_nominal: number; fecha_compra: string | null }>();
  for (const tr of Array.from(tables[4].querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => td.textContent?.trim() ?? "");
    if (cells.length < 4) continue;
    const nombre = cells[0];
    if (!nombre || CASH_NOMBRES.has(nombre) || nombre.startsWith("fin del")) continue;
    const moneda = mapMoneda(cells[2]);
    const vn = parseNum(cells[3]);
    const fc = parseFecha(cells[1]);
    const existing = posMap.get(nombre);
    if (existing) {
      existing.valor_nominal += vn;
      if (!existing.fecha_compra && fc) existing.fecha_compra = fc;
    } else {
      posMap.set(nombre, { moneda, valor_nominal: vn, fecha_compra: fc });
    }
  }

  const cupMap = new Map<string, {
    isin: string | null; cupon: number | null; frecuencia: number | null;
    proximo_vencimiento: string | null; proximo_pago_interes: string | null; interes_corrido: number;
  }>();

  for (const tr of Array.from(tables[8].querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => td.textContent?.trim() ?? "");
    if (cells.length < 6) continue;
    const nameIsin = cells[0];
    const isinMatch = nameIsin.match(/ISIN=([A-Z0-9]{12})/);
    const isin = isinMatch?.[1] ?? null;
    const nombre = nameIsin.split("ISIN=")[0].replace(/[ \s]+/g, " ").trim();
    const tasaStr = cells[5] ?? "";
    const cupon = tasaStr && !["N/A", "- - -", ""].includes(tasaStr) ? parseNum(tasaStr) : null;
    const freqStr = cells[3] ?? "";
    const frecuencia = freqStr && !["--", ""].includes(freqStr) ? parseInt(freqStr, 10) || null : null;
    cupMap.set(nombre, {
      isin, cupon, frecuencia,
      proximo_vencimiento: parseFecha(cells[2]),
      proximo_pago_interes: parseFecha(cells[4]),
      interes_corrido: parseNum(cells[6]),
    });
  }

  const bonds: ParsedBond[] = [];
  for (const [nombre, pos] of posMap.entries()) {
    const cup = cupMap.get(nombre) ?? { isin: null, cupon: null, frecuencia: null, proximo_vencimiento: null, proximo_pago_interes: null, interes_corrido: 0 };
    bonds.push({ nombre, ...pos, ...cup });
  }

  return { cuenta, bonds };
}

const FREQ_LABEL: Record<number, string> = { 1: "Anual", 2: "Semestral", 4: "Trimestral", 12: "Mensual" };

export default function HtmlImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFile(file: File) {
    setError(null); setStatus(null); setResult(null); setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer;
        const html = new TextDecoder("windows-1252").decode(buffer);
        setResult(parseHtml(html));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al procesar el archivo");
      } finally { setLoading(false); }
    };
    reader.onerror = () => { setError("No se pudo leer el archivo"); setLoading(false); };
    reader.readAsArrayBuffer(file);
  }

  async function handleConfirm() {
    if (!result) return;
    setLoading(true); setError(null);
    const { cuenta, bonds } = result;
    let updated = 0;
    const noEncontrados: string[] = [];

    for (const bond of bonds) {
      const updates: Record<string, unknown> = {
        valor_nominal: bond.valor_nominal,
        cupon: bond.cupon,
        frecuencia: bond.frecuencia,
        proximo_vencimiento: bond.proximo_vencimiento,
        proximo_pago_interes: bond.proximo_pago_interes,
        fecha_compra: bond.fecha_compra,
      };
      let query = supabase.from("bonds").update(updates).eq("estado", "activo");
      if (bond.isin) { query = query.eq("isin", bond.isin); if (cuenta) query = query.eq("cuenta", cuenta); }
      else { query = query.eq("nombre", bond.nombre); if (cuenta) query = query.eq("cuenta", cuenta); }
      const { data, error: err } = await query.select("id");
      if (err) { setError(`Error actualizando "${bond.nombre}": ${err.message}`); setLoading(false); return; }
      if (!data || data.length === 0) { noEncontrados.push(bond.nombre); } else { updated++; }
    }

    setLoading(false); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
    let msg = `${updated} activo${updated !== 1 ? "s" : ""} actualizado${updated !== 1 ? "s" : ""} correctamente.`;
    if (noEncontrados.length > 0) msg += ` No encontrados (${noEncontrados.length}): ${noEncontrados.slice(0, 3).join(", ")}${noEncontrados.length > 3 ? "…" : ""}.`;
    setStatus(msg);
    onImported?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
        >
          Importar informe BCE&M (.htm)
        </button>
        {result?.cuenta && (
          <span className="text-xs text-muted">Cuenta: <span className="text-paper font-medium">{result.cuenta}</span></span>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".htm,.html" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {loading && <p className="text-xs text-muted animate-pulse">Procesando…</p>}
      {status && <p className="text-xs text-gain">{status}</p>}
      {error && <p className="text-xs text-loss">{error}</p>}

      {result && result.bonds.length > 0 && (
        <div className="flex flex-col gap-3 mt-1">
          <p className="text-xs text-muted">
            Se detectaron <span className="text-paper font-semibold">{result.bonds.length} activos</span>. Revisá los datos antes de confirmar:
          </p>
          <div className="overflow-x-auto rounded border border-ink-border/40">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink-border text-muted bg-ink-border/10">
                  <th className="text-left px-2 py-1.5">Nombre</th>
                  <th className="text-left px-2 py-1.5">ISIN</th>
                  <th className="text-right px-2 py-1.5">V.Nominal</th>
                  <th className="text-left px-2 py-1.5">Mon.</th>
                  <th className="text-right px-2 py-1.5">Cupón %</th>
                  <th className="text-left px-2 py-1.5">Frecuencia</th>
                  <th className="text-left px-2 py-1.5">Prox.Pago</th>
                  <th className="text-left px-2 py-1.5">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {result.bonds.map((b, i) => (
                  <tr key={i} className="border-b border-ink-border/20 hover:bg-ink-border/10">
                    <td className="px-2 py-1 text-paper max-w-[180px] truncate">{b.nombre}</td>
                    <td className="px-2 py-1 text-muted font-mono text-[10px]">{b.isin ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{b.valor_nominal.toLocaleString("es-UY", { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-1 text-muted">{b.moneda}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{b.cupon != null ? `${b.cupon.toFixed(4)}%` : "—"}</td>
                    <td className="px-2 py-1 text-muted">{b.frecuencia ? (FREQ_LABEL[b.frecuencia] ?? `${b.frecuencia}x/año`) : "—"}</td>
                    <td className="px-2 py-1 text-muted">{b.proximo_pago_interes ?? "—"}</td>
                    <td className="px-2 py-1 text-muted">{b.proximo_vencimiento ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button onClick={handleConfirm} disabled={loading}
              className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-bg hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? "Actualizando…" : "Confirmar actualización"}
            </button>
            <button onClick={() => { setResult(null); if (inputRef.current) inputRef.current.value = ""; }}
              disabled={loading}
              className="rounded border border-ink-border px-4 py-2 text-sm text-muted hover:text-paper transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
                              }
