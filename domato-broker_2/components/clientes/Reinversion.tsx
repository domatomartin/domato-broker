"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { analizarBono, hoyIso, type AnalisisBono } from "@/lib/bondMath";
import { efectivo, grupoDe, type Grupo, type Instrumento } from "@/lib/bvm";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, type Costos } from "@/lib/costos";
import { aUSD, type TasasFx } from "@/lib/fx";
import { cobrosDeCartera } from "@/lib/estadoCuenta";
import type { FilaCliente } from "@/components/clientes/Comparador";

type Candidato = { i: Instrumento; a: AnalisisBono; grupo: Grupo; tirNeta: number };
type Opcion = { titulo: string; nota: string; c: Candidato };

// Tres opciones con distinto riesgo para que el asesor elija con el cliente.
const CANASTAS: { titulo: string; nota: string; grupos: Grupo[] }[] = [
  { titulo: "Más seguro", nota: "deuda del Estado uruguayo", grupos: ["Uruguay soberano"] },
  { titulo: "Más renta local", nota: "obligaciones y fideicomisos uruguayos", grupos: ["Corporativos", "Fideicomisos"] },
  { titulo: "Diversificar afuera", nota: "emisores del exterior", grupos: ["Exterior"] },
];

export default function Reinversion({
  filas, instrumentos, tasas, costos, onDetalle,
}: {
  filas: FilaCliente[];
  instrumentos: Map<string, Instrumento>;
  tasas: TasasFx | null;
  costos: Costos;
  onDetalle?: (i: Instrumento) => void;
}) {
  const [catalogo, setCatalogo] = useState<Instrumento[] | null>(null);
  useEffect(() => {
    supabase.from("instrumentos").select("*").then(({ data }) => setCatalogo(((data as Instrumento[]) ?? []).filter((i) => !i.oculto)));
  }, []);

  const [meses, setMeses] = useState(12);
  const hoy = hoyIso();
  const enUnAnio = (() => { const d = new Date(); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10); })();

  // Capital que vuelve en los próximos 12 meses, por cliente y moneda.
  const eventos = useMemo(() => filas.map((f) => {
    const cobros = cobrosDeCartera(f.bonds, costos, instrumentos).filter((x) => x.capital > 0 && x.fecha > hoy && x.fecha <= enUnAnio);
    const porMoneda = new Map<string, { capital: number; primera: string; titulos: Set<string> }>();
    for (const x of cobros) {
      const g = porMoneda.get(x.moneda) ?? { capital: 0, primera: x.fecha, titulos: new Set<string>() };
      g.capital += x.capital; g.titulos.add(x.nombre); if (x.fecha < g.primera) g.primera = x.fecha;
      porMoneda.set(x.moneda, g);
    }
    // Duration de referencia: la ponderada de la cartera (para proponer plazos parecidos).
    let sD = 0, w = 0;
    for (const p of f.pos) {
      const ins = p.bond.isin ? instrumentos.get(p.bond.isin) : undefined;
      if (!ins) continue;
      const e = efectivo(ins);
      const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: p.bond.precio_actual || e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
      if (a.duration != null) { sD += a.duration * p.valorHoy * p.fxHoy; w += p.valorHoy * p.fxHoy; }
    }
    return { f, porMoneda: [...porMoneda.entries()].map(([moneda, g]) => ({ moneda, ...g, titulos: [...g.titulos] })), durRef: w ? sD / w : null };
  }).filter((x) => x.porMoneda.length), [filas, costos, instrumentos, hoy, enUnAnio]);

  const candidatos = useMemo(() => {
    if (!catalogo) return new Map<string, Candidato[]>();
    const m = new Map<string, Candidato[]>();
    for (const i of catalogo) {
      const e = efectivo(i);
      if (e.variable || e.letra) continue;
      const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
      if (!a.completo || a.tir == null || a.aniosAlVencimiento == null || a.aniosAlVencimiento < 1) continue;
      const neto = aplicarCostos(a, nominalNetoParaMonto(a, 10000, costos), costos, irpfDe(costos, i));
      if (neto?.tirNeta == null || neto.tirNeta > 25) continue;
      const lista = m.get(i.moneda) ?? [];
      lista.push({ i, a, grupo: grupoDe(i), tirNeta: neto.tirNeta });
      m.set(i.moneda, lista);
    }
    return m;
  }, [catalogo, costos]);

  function opciones(moneda: string, durRef: number | null, riesgo: string | null | undefined, yaTiene: Set<string>): Opcion[] {
    const lista = (candidatos.get(moneda) ?? []).filter((c) => !yaTiene.has(c.i.isin));
    const maxDur = durRef != null ? Math.max(3, durRef * 1.6) : 12;
    return CANASTAS
      .filter((k) => !(riesgo === "conservador" && k.grupos.includes("Exterior")))
      .map((k) => {
        const c = lista
          .filter((x) => k.grupos.includes(x.grupo) && (x.a.duration ?? 99) <= maxDur)
          // Exterior: se descartan los de rendimiento anormalmente alto (riesgo de default, p. ej. Argentina) salvo perfil agresivo.
          .filter((x) => riesgo === "agresivo" || x.grupo !== "Exterior" || x.tirNeta < 9)
          .sort((a, b) => b.tirNeta - a.tirNeta)[0];
        return c ? { titulo: k.titulo, nota: k.nota, c } : null;
      })
      .filter((x): x is Opcion => !!x);
  }

  const selector = (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      Horizonte
      {[12, 24, 36].map((m) => (
        <button key={m} type="button" onClick={() => setMeses(m)} className={clsx("rounded-full px-2.5 py-0.5 font-medium", meses === m ? "bg-gold text-white" : "border border-ink-border")}>{m} meses</button>
      ))}
    </div>
  );

  if (!eventos.length) return (
    <div className="flex flex-col gap-2">
      {selector}
      <p className="text-xs text-muted">Ningún cliente cobra capital (vencimientos o amortizaciones) en los próximos {meses} meses.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {selector}
      {eventos.map(({ f, porMoneda, durRef }) => {
        const yaTiene = new Set(f.bonds.map((b) => b.isin).filter((x): x is string => !!x));
        return (
          <div key={f.c} className="rounded-2xl border border-ink-border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-paper">{f.nombre}{f.riesgo && <span className="ml-2 text-xs font-normal capitalize text-muted">perfil {f.riesgo}</span>}</p>
              {durRef != null && <p className="text-[11px] text-muted">duration actual de la cartera {fmtNum(durRef, 1)} años</p>}
            </div>
            {porMoneda.map((g) => {
              const ops = opciones(g.moneda, durRef, f.riesgo, yaTiene);
              return (
                <div key={g.moneda} className="mb-3 last:mb-0">
                  <p className="text-sm text-paper">
                    Vuelven <strong className="tabular-nums">{fmtMonto(g.capital, g.moneda)}</strong>
                    {tasas && g.moneda !== "USD" && <span className="text-muted"> (≈ {fmtMonto(aUSD(g.capital, g.moneda, tasas), "USD")})</span>}
                    <span className="text-muted"> desde el {fmtFecha(g.primera)} · {g.titulos.slice(0, 3).join(", ")}{g.titulos.length > 3 ? "…" : ""}</span>
                  </p>
                  {!catalogo ? (
                    <p className="mt-1 text-xs text-muted">Buscando opciones…</p>
                  ) : ops.length ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {ops.map((o) => (
                        <button key={o.titulo} type="button" onClick={() => onDetalle?.(o.c.i)} className={clsx("rounded-xl border border-ink-border bg-ink px-3 py-2 text-left hover:border-paper/30")}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{o.titulo} · {o.nota}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs font-medium text-paper">{o.c.i.nombre}</p>
                          <p className="mt-1 text-[11px] tabular-nums text-muted">
                            TIR neta <span className="font-semibold text-gain">{fmtNum(o.c.tirNeta, 2, "%")}</span> · dur {fmtNum(o.c.a.duration, 1)} · vence {efectivo(o.c.i).vencimiento?.slice(0, 4)}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No hay títulos en {g.moneda} con datos completos para sugerir.</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="text-[10px] text-muted">
        Sugerencias automáticas en la misma moneda, con plazo parecido al de la cartera y sin repetir títulos que el cliente ya tiene. TIR neta de costos e IRPF a precios de hoy.
        En el exterior se descartan rendimientos anormalmente altos (riesgo de default) salvo perfil agresivo, y para perfil conservador no se sugiere exterior. Es un punto de partida para conversar con el cliente, no una recomendación.
      </p>
    </div>
  );
}
