"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { descargarIcs, fmtFechaHora, linkGoogle, type Reunion } from "@/lib/agenda";

/** Reuniones de un cliente: agendar, marcar como hecha (con nota) y pasar al calendario. */
export default function Reuniones({ clienteId, cliente, onNota }: { clienteId: string; cliente: string; onNota?: (texto: string) => void }) {
  const [lista, setLista] = useState<Reunion[]>([]);
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; })();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [fecha, setFecha] = useState(local(manana));
  const [motivo, setMotivo] = useState("Revisión de la cartera");
  const [lugar, setLugar] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function cargar() {
    const { data } = await supabase.from("reuniones").select("*").eq("cliente_id", clienteId).order("fecha", { ascending: false });
    setLista((data as Reunion[]) ?? []);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clienteId]);

  async function agendar() {
    setErr(null);
    const { error } = await supabase.from("reuniones").insert({ cliente_id: clienteId, fecha: new Date(fecha).toISOString(), motivo: motivo.trim() || "Reunión", lugar: lugar.trim() || null, duracion_min: 60 });
    if (error) setErr(error.message); else cargar();
  }
  async function marcarHecha(r: Reunion) {
    await supabase.from("reuniones").update({ hecha: true }).eq("id", r.id);
    onNota?.(`Reunión del ${new Date(r.fecha).toLocaleDateString("es-UY")} (${r.motivo}): `);
    cargar();
  }
  async function borrar(id: string) {
    await supabase.from("reuniones").delete().eq("id", id);
    cargar();
  }

  const ahora = Date.now();
  const proximas = lista.filter((r) => !r.hecha && Date.parse(r.fecha) >= ahora - 3_600_000).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = lista.filter((r) => r.hecha || Date.parse(r.fecha) < ahora - 3_600_000).slice(0, 5);
  const input = "rounded border border-ink-border bg-ink px-2 py-1.5 text-sm text-paper";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Fecha y hora<input type="datetime-local" className={`block ${input}`} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="min-w-0 flex-1 text-xs text-muted">Motivo<input className={`block w-full ${input}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
        <label className="text-xs text-muted">Lugar<input className={`block w-36 ${input}`} value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="oficina, Zoom…" /></label>
        <button type="button" onClick={agendar} className="rounded bg-gold px-3 py-2 text-xs font-medium text-white">Agendar</button>
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}
      {proximas.length ? (
        <ul className="flex flex-col gap-1.5">
          {proximas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2 text-sm">
              <span><b className="capitalize text-paper">{fmtFechaHora(r.fecha)}</b> <span className="text-muted">· {r.motivo}{r.lugar ? ` · ${r.lugar}` : ""}</span></span>
              <span className="flex flex-wrap gap-2 text-xs">
                <a href={linkGoogle(r, cliente)} target="_blank" rel="noreferrer" className="underline text-muted">Google Calendar</a>
                <button type="button" onClick={() => descargarIcs(r, cliente)} className="underline text-muted">iPhone / Outlook (.ics)</button>
                <button type="button" onClick={() => marcarHecha(r)} className="underline text-gain">Hecha</button>
                <button type="button" onClick={() => borrar(r.id)} className="underline text-loss">Cancelar</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted">No hay reuniones agendadas.</p>}
      {pasadas.length > 0 && (
        <p className="text-[11px] text-muted">Anteriores: {pasadas.map((r) => <span key={r.id} className={clsx("mr-2", r.hecha && "line-through")}>{new Date(r.fecha).toLocaleDateString("es-UY")} {r.motivo}</span>)}</p>
      )}
      <p className="text-[10px] text-muted">El día de la reunión, a las 9, te llega un recordatorio al celular. Al marcarla como hecha se abre una nota para registrar qué se habló.</p>
    </div>
  );
}
