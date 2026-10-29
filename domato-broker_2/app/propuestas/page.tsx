"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import CostosEditor from "@/components/CostosEditor";
import { useCostos } from "@/lib/useCostos";
import { ESTADOS, PERFIL_DEFECTO, type Propuesta } from "@/lib/propuesta";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";

const TONO: Record<string, string> = {
  borrador: "bg-ink text-muted",
  presentada: "bg-warn/10 text-warn",
  ejecutada: "bg-gain/10 text-gain",
  descartada: "bg-ink text-muted line-through",
};

export default function PropuestasPage() {
  const router = useRouter();
  const [lista, setLista] = useState<Propuesta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { costos, guardar } = useCostos();

  useEffect(() => {
    supabase
      .from("propuestas")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setLista((data as Propuesta[]) ?? []);
        setCargando(false);
      });
  }, []);

  async function nueva() {
    const { data, error } = await supabase
      .from("propuestas")
      .insert({ cliente: "", perfil: PERFIL_DEFECTO, items: [], estado: "borrador" })
      .select("id")
      .single();
    if (error) { setError(error.message); return; }
    router.push(`/propuestas/${data.id}`);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-paper">Propuestas</h1>
          <p className="text-sm text-muted mt-1">Armá carteras para clientes con ayuda de la IA, presentalas y seguí cómo rinden después de comprar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CostosEditor costos={costos} onGuardar={guardar} />
          <button type="button" onClick={nueva} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel hover:bg-gold-bright">
            + Nueva propuesta
          </button>
        </div>
      </div>

      {error && <p className="rounded bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}

      <Panel title="Todas las propuestas">
        {cargando ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : !lista.length ? (
          <p className="text-sm text-muted">Todavía no hay propuestas. Creá la primera con “Nueva propuesta”.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted border-b border-ink-border">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Cliente</th>
                  <th className="px-2 py-2 text-left font-medium">Estado</th>
                  <th className="px-2 py-2 text-right font-medium">Monto</th>
                  <th className="px-2 py-2 text-right font-medium">Bonos</th>
                  <th className="px-2 py-2 text-right font-medium">TIR neta propuesta</th>
                  <th className="px-2 py-2 text-left font-medium">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-ink-border/60 hover:bg-ink/60">
                    <td className="px-2 py-2">
                      <Link href={`/propuestas/${p.id}`} className="font-medium text-paper hover:underline">{p.cliente || "Sin nombre"}</Link>
                      {p.cuenta && <span className="block text-[11px] text-muted">Cartera: {p.cuenta}</span>}
                    </td>
                    <td className="px-2 py-2"><span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", TONO[p.estado])}>{ESTADOS[p.estado]}</span></td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtMonto(p.perfil?.monto ?? 0, p.perfil?.moneda ?? "USD")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.items?.length ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gain">{fmtNum(p.metricas?.tirNeta, 2, "%")}</td>
                    <td className="px-2 py-2 text-muted">{fmtFecha(p.updated_at?.slice(0, 10) ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
