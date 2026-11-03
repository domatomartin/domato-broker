"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import { fmtFecha, fmtMonto } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { cobrosDeCartera } from "@/lib/estadoCuenta";
import { descargarIcs, linkGoogle, type Reunion } from "@/lib/agenda";
import type { FichaCliente } from "@/lib/perfilInversor";

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" });

export default function AgendaPage() {
  const datos = useDatosCartera();
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [fichas, setFichas] = useState<FichaCliente[]>([]);
  const hoy = hoyIso();

  useEffect(() => {
    (async () => {
      const desde = new Date(); desde.setHours(0, 0, 0, 0);
      const [{ data: r }, { data: f }] = await Promise.all([
        supabase.from("reuniones").select("*").eq("hecha", false).gte("fecha", desde.toISOString()).order("fecha"),
        supabase.from("clientes").select("*"),
      ]);
      setReuniones((r as Reunion[]) ?? []);
      setFichas((f as FichaCliente[]) ?? []);
    })();
  }, []);

  const nombre = (id: string) => fichas.find((f) => f.id === id)?.nombre ?? "Cliente";

  // Sugerencias: a quién conviene llamar (revisión vencida, capital que vuelve, test vencido) y todavía no tiene reunión.
  const sugerencias = useMemo(() => {
    if (datos.cargando) return [];
    const conReunion = new Set(reuniones.map((r) => r.cliente_id));
    const out: { ficha?: FichaCliente; nombre: string; motivo: string; cuenta?: string }[] = [];
    const fichaDe = (c: string) => fichas.find((f) => (f.cuenta ?? "").trim() === c);
    const en45 = (() => { const d = new Date(); d.setDate(d.getDate() + 45); return d.toISOString().slice(0, 10); })();
    for (const c of datos.cuentas) {
      const f = fichaDe(c);
      if (f && conReunion.has(f.id)) continue;
      const bs = datos.bonds.filter((b) => (b.cuenta ?? "").trim() === c);
      const capital = cobrosDeCartera(bs, datos.costos, datos.instrumentos).filter((x) => x.capital > 0 && x.fecha > hoy && x.fecha <= en45);
      const prop = datos.propuestas.find((p) => (p.cuenta ?? "").trim() === c || bs.some((b) => b.propuesta_id === p.id));
      const base = prop?.revision_fecha ?? prop?.estrategia_fecha;
      const nom = f?.nombre ?? prop?.cliente ?? carteraLabel(c);
      if (capital.length) out.push({ ficha: f, nombre: nom, cuenta: c, motivo: `Le vuelve capital el ${fmtFecha(capital[0].fecha)} (${fmtMonto(capital[0].capital, capital[0].moneda)}): ver en qué reinvertir` });
      else if (base && Date.now() - Date.parse(base) > 90 * 86_400_000) out.push({ ficha: f, nombre: nom, cuenta: c, motivo: `Revisión trimestral pendiente (última ${fmtFecha(base.slice(0, 10))})` });
      else if (f?.perfil && Date.now() - Date.parse(f.perfil.fecha) > 365 * 86_400_000) out.push({ ficha: f, nombre: nom, cuenta: c, motivo: "Actualizar el test de perfil (tiene más de un año)" });
    }
    for (const f of fichas) if (!f.cuenta && !conReunion.has(f.id)) out.push({ ficha: f, nombre: f.nombre, motivo: "Prospecto: presentar una propuesta" });
    return out;
  }, [datos, fichas, reuniones, hoy]);

  async function crearFichaYAbrir(nombreCliente: string, cuenta?: string) {
    const { data } = await supabase.from("clientes").insert({ nombre: nombreCliente, cuenta: cuenta ?? null }).select("id").single();
    if (data) window.location.href = `/clientes/${(data as { id: string }).id}`;
  }

  const porDia = new Map<string, Reunion[]>();
  for (const r of reuniones) { const k = r.fecha.slice(0, 10); porDia.set(k, [...(porDia.get(k) ?? []), r]); }

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-paper">Agenda</h1>
        <p className="text-sm text-muted mt-1">Tus próximas reuniones con clientes y a quién conviene llamar. Las reuniones se agendan desde la ficha de cada cliente.</p>
      </div>

      <Panel title={`Próximas reuniones (${reuniones.length})`}>
        {!reuniones.length ? <p className="text-sm text-muted">No hay reuniones agendadas.</p> : (
          <div className="flex flex-col gap-4">
            {[...porDia.entries()].map(([k, rs]) => (
              <div key={k}>
                <p className="mb-1 text-xs font-semibold capitalize text-paper">{dia(rs[0].fecha)}</p>
                <ul className="flex flex-col gap-1.5">
                  {rs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2 text-sm">
                      <span>
                        <b className="text-paper">{new Date(r.fecha).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}</b>
                        {" · "}<Link href={`/clientes/${r.cliente_id}`} className="text-paper underline">{nombre(r.cliente_id)}</Link>
                        <span className="text-muted"> · {r.motivo}{r.lugar ? ` · ${r.lugar}` : ""}</span>
                      </span>
                      <span className="flex gap-2 text-xs">
                        <a href={linkGoogle(r, nombre(r.cliente_id))} target="_blank" rel="noreferrer" className="underline text-muted">Google Calendar</a>
                        <button type="button" onClick={() => descargarIcs(r, nombre(r.cliente_id))} className="underline text-muted">.ics</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="A quién conviene llamar">
        {!sugerencias.length ? <p className="text-sm text-muted">Nadie pendiente: todos los clientes tienen reunión o están al día.</p> : (
          <ul className="flex flex-col gap-1.5">
            {sugerencias.map((s, k) => (
              <li key={k} className={clsx("flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2 text-sm")}>
                <span><b className="text-paper">{s.nombre}</b><span className="block text-xs text-muted">{s.motivo}</span></span>
                {s.ficha
                  ? <Link href={`/clientes/${s.ficha.id}`} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper">Agendar reunión</Link>
                  : <button type="button" onClick={() => crearFichaYAbrir(s.nombre, s.cuenta)} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper">Crear ficha y agendar</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-[11px] text-muted">El día de cada reunión, a las 9, te llega un recordatorio al celular.</p>
    </div>
  );
}
