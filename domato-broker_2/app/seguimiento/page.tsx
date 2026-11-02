"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import { fmtFecha, fmtNum } from "@/components/BondAnalysis";
import DetalleInstrumento from "@/components/DetalleInstrumento";
import { useCostos } from "@/lib/useCostos";
import type { Instrumento } from "@/lib/bvm";
import { cumple, describir, valorActual, type Seguido } from "@/lib/seguimiento";

export default function SeguimientoPage() {
  const { costos } = useCostos();
  const [filas, setFilas] = useState<{ s: Seguido; i: Instrumento | undefined }[] | null>(null);
  const [detalle, setDetalle] = useState<Instrumento | null>(null);

  async function cargar() {
    const { data } = await supabase.from("seguimiento").select("*").order("creado", { ascending: false });
    const segs = (data as Seguido[]) ?? [];
    const { data: ins } = segs.length ? await supabase.from("instrumentos").select("*").in("isin", segs.map((x) => x.isin)) : { data: [] };
    const mapa = new Map(((ins as Instrumento[]) ?? []).map((i) => [i.isin, i]));
    setFilas(segs.map((s) => ({ s, i: mapa.get(s.isin) })));
  }
  useEffect(() => { cargar(); }, []);

  async function quitar(isin: string) {
    await supabase.from("seguimiento").delete().eq("isin", isin);
    cargar();
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-paper">Lista de seguimiento</h1>
        <p className="text-sm text-muted mt-1">Títulos que estás mirando, con el nivel de TIR o precio en el que querés que te avise. Se agregan desde la ventana de detalle de cada título (“Seguir este título”).</p>
      </div>
      <Panel title={filas ? `${filas.length} título${filas.length === 1 ? "" : "s"}` : "Cargando…"}>
        {!filas ? null : !filas.length ? (
          <p className="text-sm text-muted">Todavía no seguís ningún título. Abrí uno en <Link href="/opciones" className="underline">Opciones de inversión</Link> y tocá “⭐ Seguir”.</p>
        ) : (
          <div className="flex flex-col divide-y divide-ink-border/60">
            {filas.map(({ s, i }) => {
              const v = i ? valorActual(i, s.tipo) : null;
              const ok = cumple(s, v);
              const distancia = v != null ? v - s.umbral : null;
              return (
                <div key={s.isin} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => i && setDetalle(i)} className="text-left text-sm font-medium text-paper hover:underline">{i?.nombre ?? s.isin}</button>
                    <p className="text-[11px] text-muted">{s.isin}{i ? ` · ${i.moneda}` : ""} · avisar si {describir(s)}{s.nota ? ` · ${s.nota}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-paper">{s.tipo === "tir" ? fmtNum(v, 2, "%") : fmtNum(v, 2)}</p>
                      <p className="text-[10px] text-muted">{distancia != null ? `${distancia >= 0 ? "+" : ""}${fmtNum(distancia, 2)}${s.tipo === "tir" ? " pts" : ""} del nivel` : "sin dato"}</p>
                    </div>
                    <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", ok ? "bg-gain/15 text-gain" : "bg-ink text-muted")}>{ok ? "✓ Se cumple" : "Esperando"}</span>
                    <button type="button" onClick={() => quitar(s.isin)} className="text-xs text-muted underline">Quitar</button>
                  </div>
                  {s.ultima_revision && <p className="w-full text-[10px] text-muted">Última revisión automática {fmtFecha(s.ultima_revision.slice(0, 10))}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      {detalle && <DetalleInstrumento i={detalle} costos={costos} onClose={() => { setDetalle(null); cargar(); }} />}
    </div>
  );
}
