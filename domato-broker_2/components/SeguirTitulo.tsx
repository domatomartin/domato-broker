"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { describir, type Seguido } from "@/lib/seguimiento";

/** Agregar o quitar un título de la lista de seguimiento, con su condición de aviso. */
export default function SeguirTitulo({ isin, tirHoy, precioHoy, variable }: { isin: string; tirHoy: number | null; precioHoy: number | null; variable: boolean }) {
  const [actual, setActual] = useState<Seguido | null | undefined>(undefined);
  const [tipo, setTipo] = useState<"tir" | "precio">(variable || tirHoy == null ? "precio" : "tir");
  const [condicion, setCondicion] = useState<">" | "<">(variable || tirHoy == null ? "<" : ">");
  const [umbral, setUmbral] = useState("");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("seguimiento").select("*").eq("isin", isin).maybeSingle().then(({ data }) => {
      const s = data as Seguido | null;
      setActual(s);
      if (s) { setTipo(s.tipo); setCondicion(s.condicion); setUmbral(String(s.umbral)); setNota(s.nota ?? ""); }
      else {
        const base = tipo === "tir" ? tirHoy : precioHoy;
        if (base != null) setUmbral(tipo === "tir" ? (base + 0.5).toFixed(2) : (base * 0.97).toFixed(2));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isin]);

  async function guardar() {
    const u = Number(umbral.replace(",", "."));
    if (!isFinite(u)) { setMsg("Poné un número"); return; }
    const fila = { isin, tipo, condicion, umbral: u, nota: nota.trim() || null, disparada: false };
    const { error } = await supabase.from("seguimiento").upsert(fila, { onConflict: "isin" });
    if (error) { setMsg(error.message); return; }
    setActual({ ...fila, ultima_revision: null, valor: null } as Seguido);
    setMsg("Guardado: te avisamos cuando se cumpla.");
  }
  async function quitar() {
    await supabase.from("seguimiento").delete().eq("isin", isin);
    setActual(null); setMsg("Quitado de la lista.");
  }

  if (actual === undefined) return null;
  const input = "rounded border border-ink-border bg-ink px-2 py-1 text-sm text-paper";
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      {actual && <p className="text-sm text-paper">⭐ En tu lista: avisar si {describir(actual)}{actual.disparada ? " · ya se cumple" : ""}</p>}
      <div className="flex flex-wrap items-center gap-2">
        Avisarme si
        <select className={input} value={tipo} onChange={(e) => setTipo(e.target.value as "tir" | "precio")}>
          {!variable && tirHoy != null && <option value="tir">la TIR</option>}
          <option value="precio">el precio</option>
        </select>
        <select className={input} value={condicion} onChange={(e) => setCondicion(e.target.value as ">" | "<")}>
          <option value=">">sube de</option>
          <option value="<">baja de</option>
        </select>
        <input className={`${input} w-20`} value={umbral} onChange={(e) => setUmbral(e.target.value)} inputMode="decimal" />
        {tipo === "tir" ? "%" : ""}
        <input className={`${input} min-w-0 flex-1`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (ej.: para Benja si sube)" />
        <button type="button" onClick={guardar} className="rounded bg-gold px-3 py-1.5 font-medium text-white">{actual ? "Actualizar" : "⭐ Seguir"}</button>
        {actual && <button type="button" onClick={quitar} className="underline">Quitar</button>}
      </div>
      <p>Hoy: {tipo === "tir" ? (tirHoy != null ? `TIR ${tirHoy.toFixed(2)}%` : "—") : (precioHoy != null ? `precio ${precioHoy.toFixed(2)}` : "—")}. Se revisa todos los días a las 9 y te llega un aviso al celular cuando cruza el nivel.</p>
      {msg && <p className="text-paper">{msg}</p>}
    </div>
  );
}
