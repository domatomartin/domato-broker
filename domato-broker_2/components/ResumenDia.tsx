"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { fmtFecha, fmtMonto } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { cobrosDeCartera } from "@/lib/estadoCuenta";
import { describir, type Seguido } from "@/lib/seguimiento";
import type { FichaCliente } from "@/lib/perfilInversor";

type Item = { texto: string; sub?: string; href: string; tono?: "alerta" | "bueno" };
type Novedad = { id: string; fecha: string; tipo: string; texto: string; url: string | null };

const sumarDias = (iso: string, d: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

/** Lo importante del día en un solo lugar: cobros, señales, seguimiento, vencimientos, novedades y revisiones. */
export default function ResumenDia() {
  const datos = useDatosCartera();
  const [seguidos, setSeguidos] = useState<(Seguido & { nombre?: string })[]>([]);
  const [fichas, setFichas] = useState<FichaCliente[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [reuniones, setReuniones] = useState<{ fecha: string; motivo: string; cliente_id: string }[]>([]);
  const hoy = hoyIso();

  useEffect(() => {
    (async () => {
      const ini = new Date(); ini.setHours(0, 0, 0, 0);
      const fin = new Date(ini.getTime() + 2 * 86_400_000);
      const [{ data: s }, { data: f }, { data: n }, { data: r }] = await Promise.all([
        supabase.from("seguimiento").select("*").eq("disparada", true),
        supabase.from("clientes").select("*"),
        supabase.from("novedades").select("*").gte("fecha", sumarDias(hoyIso(), -7)).order("fecha", { ascending: false }).limit(8),
        supabase.from("reuniones").select("fecha, motivo, cliente_id").eq("hecha", false).gte("fecha", ini.toISOString()).lt("fecha", fin.toISOString()).order("fecha"),
      ]);
      setReuniones((r as { fecha: string; motivo: string; cliente_id: string }[]) ?? []);
      const segs = (s as Seguido[]) ?? [];
      if (segs.length) {
        const { data: ins } = await supabase.from("instrumentos").select("isin, nombre").in("isin", segs.map((x) => x.isin));
        const nom = new Map(((ins as { isin: string; nombre: string }[]) ?? []).map((i) => [i.isin, i.nombre]));
        setSeguidos(segs.map((x) => ({ ...x, nombre: nom.get(x.isin) })));
      }
      setFichas((f as FichaCliente[]) ?? []);
      setNovedades((n as Novedad[]) ?? []);
    })();
  }, []);

  const bloques = useMemo(() => {
    if (datos.cargando) return null;
    const cuentaDe = (id: string) => datos.bonds.find((b) => b.id === id)?.cuenta ?? "";
    const cobros = cobrosDeCartera(datos.bonds, datos.costos, datos.instrumentos);
    const maniana = sumarDias(hoy, 1);
    const cobrosCerca: Item[] = cobros.filter((c) => c.fecha === hoy || c.fecha === maniana).map((c) => ({
      texto: `${c.fecha === hoy ? "Hoy" : "Mañana"} · ${carteraLabel(cuentaDe(c.bondId))}`,
      sub: `${c.nombre} · ${fmtMonto(c.total, c.moneda)}${c.capital ? " (incluye capital)" : ""}`,
      href: "/cobros", tono: "bueno",
    }));
    const vencimientos: Item[] = cobros.filter((c) => c.capital > 0 && c.fecha > maniana && c.fecha <= sumarDias(hoy, 30)).map((c) => ({
      texto: `${fmtFecha(c.fecha)} · ${carteraLabel(cuentaDe(c.bondId))}`,
      sub: `Vuelve capital: ${c.nombre} · ${fmtMonto(c.capital, c.moneda)}`,
      href: "/clientes",
    }));
    const senales: Item[] = datos.propuestas.flatMap((p) => (p.senales_estado?.evaluadas ?? []).filter((s) => s.activa).map((s) => ({
      texto: `${p.cliente || carteraLabel(p.cuenta ?? "")}: ${s.descripcion}`,
      sub: `Hoy ${s.valor} → ${s.accion}`,
      href: `/propuestas/${p.id}`, tono: "alerta" as const,
    })));
    const seg: Item[] = seguidos.map((s) => ({
      texto: s.nombre ?? s.isin,
      sub: `${describir(s)} · hoy ${s.valor != null ? Number(s.valor).toFixed(2) : "—"}${s.tipo === "tir" ? "%" : ""}`,
      href: "/seguimiento", tono: "bueno",
    }));
    const revisiones: Item[] = [];
    for (const p of datos.propuestas) {
      const base = p.revision_fecha ?? p.estrategia_fecha;
      if (base && sumarDias(base.slice(0, 10), 91) <= hoy) revisiones.push({ texto: `${p.cliente || carteraLabel(p.cuenta ?? "")}: revisar la estrategia`, sub: `Última revisión ${fmtFecha(base.slice(0, 10))}`, href: `/propuestas/${p.id}` });
    }
    for (const f of fichas) {
      if (!f.perfil) revisiones.push({ texto: `${f.nombre}: falta el test de perfil`, href: `/clientes/${f.id}` });
      else if (Date.now() - Date.parse(f.perfil.fecha) > 365 * 86_400_000) revisiones.push({ texto: `${f.nombre}: test de perfil vencido`, sub: `Hecho el ${fmtFecha(f.perfil.fecha)}`, href: `/clientes/${f.id}` });
    }
    const reus: Item[] = reuniones.map((r) => {
      const d = new Date(r.fecha);
      const esHoy = d.toDateString() === new Date().toDateString();
      return { texto: `${esHoy ? "Hoy" : "Mañana"} ${d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })} · ${fichas.find((f) => f.id === r.cliente_id)?.nombre ?? "cliente"}`, sub: r.motivo, href: `/clientes/${r.cliente_id}` };
    });
    const nov: Item[] = novedades.map((n) => ({ texto: n.texto, sub: `${fmtFecha(n.fecha)} · ${n.tipo}`, href: n.url ?? "/opciones" }));
    return [
      { titulo: "Reuniones de hoy y mañana", vacio: "Sin reuniones agendadas.", items: reus },
      { titulo: "Cobros de hoy y mañana", vacio: "Sin cobros hoy ni mañana.", items: cobrosCerca },
      { titulo: "Señales activas", vacio: "Ninguna señal activa en las estrategias.", items: senales },
      { titulo: "Tu lista de seguimiento", vacio: "Ningún título cruzó su nivel.", items: seg },
      { titulo: "Vencimientos en 30 días", vacio: "No vuelve capital en los próximos 30 días.", items: vencimientos },
      { titulo: "Para hacer con clientes", vacio: "Todo al día.", items: revisiones },
      { titulo: "Novedades de la semana", vacio: "Sin títulos nuevos ni comunicados de la BVM.", items: nov },
    ];
  }, [datos, seguidos, fichas, novedades, reuniones, hoy]);

  if (!bloques) return <div className="h-32 animate-pulse rounded-2xl bg-ink-panel" />;
  const pendientes = bloques.reduce((s, b) => s + b.items.length, 0);

  return (
    <section className="rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Resumen del día</p>
        <p className="text-xs text-muted">{pendientes ? `${pendientes} cosa${pendientes === 1 ? "" : "s"} para mirar` : "Nada urgente hoy"}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {bloques.filter((b) => b.items.length).map((b) => (
          <div key={b.titulo} className={clsx("rounded-xl px-3 py-2.5", b.items.length ? "bg-ink" : "bg-ink/50")}>
            <p className="mb-1 flex items-center justify-between text-xs font-semibold text-paper">
              {b.titulo}
              {b.items.length > 0 && <span className="rounded-full bg-gold px-1.5 text-[10px] text-white">{b.items.length}</span>}
            </p>
            {b.items.length ? (
              <ul className="flex flex-col gap-1">
                {b.items.slice(0, 4).map((it, k) => (
                  <li key={k}>
                    <Link href={it.href} className="block rounded-md px-1 py-0.5 hover:bg-ink-panel">
                      <span className={clsx("block text-xs leading-snug", it.tono === "alerta" ? "text-loss" : it.tono === "bueno" ? "text-gain" : "text-paper")}>{it.texto}</span>
                      {it.sub && <span className="block text-[11px] leading-snug text-muted">{it.sub}</span>}
                    </Link>
                  </li>
                ))}
                {b.items.length > 4 && <li className="px-1 text-[11px] text-muted">y {b.items.length - 4} más</li>}
              </ul>
            ) : <p className="text-[11px] text-muted">{b.vacio}</p>}
          </div>
        ))}
      </div>
      {bloques.some((b) => !b.items.length) && (
        <p className="mt-2 text-[11px] text-muted">
          Sin novedades en: {bloques.filter((b) => !b.items.length).map((b) => b.titulo.toLowerCase()).join(" · ")}.
        </p>
      )}
    </section>
  );
}
