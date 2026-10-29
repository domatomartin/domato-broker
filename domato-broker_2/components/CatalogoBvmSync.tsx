"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { InstrumentoBvm } from "@/lib/bvm";

const PARALELO = 3;

export default function CatalogoBvmSync({ onSynced }: { onSynced?: () => void }) {
  const [total, setTotal] = useState<number | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; de: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function contar() {
    const { count } = await supabase.from("instrumentos").select("isin", { count: "exact", head: true });
    setTotal(count ?? 0);
    const { data } = await supabase
      .from("instrumentos")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    setUltima(data?.[0]?.updated_at ?? null);
  }

  useEffect(() => { contar(); }, []);

  async function sincronizar() {
    setError(null);
    setMsg(null);
    const { especies } = (await fetch("/api/catalogo").then((r) => r.json())) as { especies: string[] };
    // "todos" trae el vector completo: suma los ISIN que no figuran en ninguna especie.
    const cola = ["todos", ...especies];
    const porIsin = new Map<string, InstrumentoBvm>();
    const fallidas: string[] = [];
    let hechas = 0;
    const total = cola.length;
    setProgreso({ hechas, de: total });

    const worker = async () => {
      while (cola.length) {
        const especie = cola.shift()!;
        try {
          const r = await fetch(`/api/catalogo?especie=${encodeURIComponent(especie)}`);
          const j = (await r.json()) as { instrumentos?: InstrumentoBvm[]; error?: string };
          if (!r.ok || !j.instrumentos) throw new Error(j.error ?? `HTTP ${r.status}`);
          for (const ins of j.instrumentos) {
            // Un ISIN puede aparecer en una especie genérica y en otra específica
            // ("Notas del Tesoro" y "Notas del Tesoro UI"): nos quedamos con la específica.
            const previo = porIsin.get(ins.isin);
            if (!previo || (ins.especie?.length ?? 0) > (previo.especie?.length ?? 0)) porIsin.set(ins.isin, ins);
          }
        } catch {
          fallidas.push(especie);
        }
        hechas++;
        setProgreso({ hechas, de: total });
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, worker));

    const filas = [...porIsin.values()].map((i) => ({ ...i, updated_at: new Date().toISOString() }));
    for (let i = 0; i < filas.length; i += 200) {
      const { error: err } = await supabase.from("instrumentos").upsert(filas.slice(i, i + 200), { onConflict: "isin" });
      if (err) { setError(`Error guardando el catálogo: ${err.message}`); setProgreso(null); return; }
    }

    setProgreso(null);
    setMsg(
      `${filas.length} instrumentos actualizados.` +
        (fallidas.length ? ` No respondieron (${fallidas.length}): ${fallidas.join(", ")}. Probá de nuevo más tarde.` : "")
    );
    await contar();
    onSynced?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <span>
        Catálogo BVM:{" "}
        <span className="text-paper font-medium">{total ?? "…"} instrumentos</span>
        {ultima && ` · actualizado ${new Date(ultima).toLocaleDateString("es-UY")}`}
      </span>
      <button
        type="button"
        onClick={sincronizar}
        disabled={!!progreso}
        className="rounded border border-ink-border px-3 py-1 text-paper hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
      >
        {progreso ? `Descargando ${progreso.hechas}/${progreso.de} especies…` : "↻ Actualizar catálogo"}
      </button>
      {progreso && <span>La BVM tarda; puede llevar varios minutos.</span>}
      {msg && <span className="text-gain">{msg}</span>}
      {error && <span className="text-loss">{error}</span>}
    </div>
  );
}
