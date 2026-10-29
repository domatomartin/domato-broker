"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import BondAnalysis, { AVISO_SIMULACION, fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import CatalogoBvmSync from "@/components/CatalogoBvmSync";
import { analizarBono, escalar, nominalParaMonto, type AnalisisBono } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";

type Grupo = "Uruguay soberano" | "Corporativos" | "Fideicomisos" | "Acciones" | "Exterior" | "Otros";

function grupoDe(i: Instrumento): Grupo {
  const e = i.especie ?? "";
  if (/Acciones/.test(e)) return "Acciones";
  if (/Obligaciones/.test(e)) return "Corporativos";
  if (/Fideicomiso|Fid\. Fin|Certificados/.test(e)) return "Fideicomisos";
  if (/Global Uruguay|Notas del|Bonos del Tesoro|Regulaci|Letra de Tesor|Previsional/.test(e)) return "Uruguay soberano";
  if (/Extranjeros|Soberanos|Org\. Intern|Global en EU|Canasta/.test(e)) return "Exterior";
  if (i.isin.startsWith("UY")) {
    if (i.isin.startsWith("UYFF")) return "Fideicomisos";
    if (i.isin.startsWith("UYON")) return "Corporativos";
    return "Otros";
  }
  return "Exterior";
}

const GRUPOS: Grupo[] = ["Uruguay soberano", "Corporativos", "Fideicomisos", "Exterior", "Acciones", "Otros"];
const MONEDAS = ["USD", "UI", "UYU", "UP", "EUR", "BRL", "COP", "UR"];
const MAX_COMPARAR = 4;

type Fila = { i: Instrumento; a: AnalisisBono; grupo: Grupo; frecuenciaSupuesta: boolean };
type Orden = "tir" | "currentYield" | "vencimiento" | "duration" | "precio" | "nombre";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
        active ? "bg-gold text-ink" : "border border-ink-border text-muted hover:text-paper"
      )}
    >
      {children}
    </button>
  );
}

function EditorDatos({ i, onSaved, onCancel }: { i: Instrumento; onSaved: () => void; onCancel: () => void }) {
  const e = efectivo(i);
  const [cupon, setCupon] = useState(e.cupon != null ? String(e.cupon) : "");
  const [vto, setVto] = useState(e.vencimiento ?? "");
  const [frec, setFrec] = useState(String(i.frecuencia ?? 2));
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    const { error } = await supabase
      .from("instrumentos")
      .update({
        cupon_manual: cupon.trim() === "" ? null : Number(cupon.replace(",", ".")),
        vencimiento_manual: vto || null,
        frecuencia: Number(frec),
      })
      .eq("isin", i.isin);
    if (error) setErr(error.message);
    else onSaved();
  }

  const input = "rounded border border-ink-border bg-ink px-2 py-1 text-xs text-paper";
  return (
    <div className="flex flex-wrap items-end gap-2 bg-ink/60 px-3 py-2">
      <label className="flex flex-col text-[10px] text-muted">Cupón anual %
        <input className={clsx(input, "w-24")} value={cupon} onChange={(ev) => setCupon(ev.target.value)} placeholder={i.cupon != null ? String(i.cupon) : "ej 5.75"} />
      </label>
      <label className="flex flex-col text-[10px] text-muted">Vencimiento
        <input type="date" className={input} value={vto} onChange={(ev) => setVto(ev.target.value)} />
      </label>
      <label className="flex flex-col text-[10px] text-muted">Frecuencia
        <select className={input} value={frec} onChange={(ev) => setFrec(ev.target.value)}>
          <option value="2">Semestral</option>
          <option value="1">Anual</option>
          <option value="4">Trimestral</option>
          <option value="12">Mensual</option>
        </select>
      </label>
      <button type="button" onClick={guardar} className="rounded bg-gold px-3 py-1 text-xs font-medium text-ink-panel">Guardar</button>
      <button type="button" onClick={onCancel} className="text-xs text-muted underline">Cancelar</button>
      {err && <span className="text-xs text-loss">{err}</span>}
      <span className="w-full text-[10px] text-muted">Queda guardado para todo el catálogo; la actualización desde la BVM no lo pisa.</span>
    </div>
  );
}

export default function OpcionesPage() {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [monedas, setMonedas] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [soloConTir, setSoloConTir] = useState(false);
  const [orden, setOrden] = useState<{ campo: Orden; desc: boolean }>({ campo: "tir", desc: true });
  const [comparar, setComparar] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [monto, setMonto] = useState("10000");

  async function cargar() {
    const { data } = await supabase.from("instrumentos").select("*");
    setInstrumentos((data as Instrumento[]) ?? []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  const filas: Fila[] = useMemo(
    () =>
      instrumentos.map((i) => {
        const e = efectivo(i);
        return {
          i,
          a: analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio }),
          grupo: grupoDe(i),
          frecuenciaSupuesta: e.frecuenciaSupuesta,
        };
      }),
    [instrumentos]
  );

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    const valor = (f: Fila): number | string | null => {
      switch (orden.campo) {
        case "tir": return f.a.tir;
        case "currentYield": return f.a.currentYield;
        case "duration": return f.a.duration;
        case "precio": return efectivo(f.i).precio;
        case "vencimiento": return efectivo(f.i).vencimiento;
        case "nombre": return f.i.nombre;
      }
    };
    return filas
      .filter((f) => !t || [f.i.nombre, f.i.isin, f.i.codigo, f.i.especie].some((x) => x?.toLowerCase().includes(t)))
      .filter((f) => !monedas.length || monedas.includes(f.i.moneda))
      .filter((f) => !grupos.length || grupos.includes(f.grupo))
      .filter((f) => !soloConTir || f.a.tir != null)
      .sort((x, y) => {
        const a = valor(x), b = valor(y);
        if (a == null && b == null) return 0;
        if (a == null) return 1; // sin dato siempre al final
        if (b == null) return -1;
        const c = typeof a === "string" ? a.localeCompare(String(b), "es") : (a as number) - (b as number);
        return orden.desc ? -c : c;
      });
  }, [filas, q, monedas, grupos, soloConTir, orden]);

  const seleccionadas = comparar.map((isin) => filas.find((f) => f.i.isin === isin)).filter((f): f is Fila => !!f);
  const monedasMezcladas = new Set(seleccionadas.map((f) => f.i.moneda)).size > 1;
  const conTir = filas.filter((f) => f.a.tir != null).length;
  const montoNum = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;

  function toggle<T>(lista: T[], v: T): T[] {
    return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
  }
  function ordenarPor(campo: Orden) {
    setOrden((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: campo !== "nombre" && campo !== "vencimiento" }));
  }
  const Th = ({ campo, children, right }: { campo: Orden; children: React.ReactNode; right?: boolean }) => (
    <th className={clsx("px-2 py-2 font-medium whitespace-nowrap", right ? "text-right" : "text-left")}>
      <button type="button" onClick={() => ordenarPor(campo)} className={clsx("hover:text-paper", orden.campo === campo && "text-paper")}>
        {children}{orden.campo === campo ? (orden.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl text-paper">Opciones de inversión</h1>
          <p className="text-sm text-muted mt-1">
            {instrumentos.length} instrumentos de la BVM · {conTir} con TIR calculada
            {instrumentos[0]?.fecha_precio && ` · precios del ${fmtFecha(instrumentos[0].fecha_precio)}`}
          </p>
        </div>
        <CatalogoBvmSync onSynced={cargar} />
      </div>

      {seleccionadas.length > 0 && (
        <Panel
          title={`Comparación (${seleccionadas.length})`}
          action={
            <div className="flex items-center gap-3 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded border border-ink-border px-3 py-1 text-xs text-paper hover:border-gold">
                Imprimir / PDF
              </button>
              <button type="button" onClick={() => setComparar([])} className="text-xs text-muted underline">Limpiar</button>
            </div>
          }
        >
          <label className="flex items-center gap-2 text-xs text-muted print:hidden">
            Monto a invertir en cada opción (en su moneda)
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              className="w-32 rounded border border-ink-border bg-ink px-2 py-1 text-sm text-paper"
            />
          </label>
          <p className="hidden print:block text-xs text-muted">Simulación con un monto de {fmtNum(montoNum, 0)} en la moneda de cada instrumento. Fecha: {fmtFecha(new Date().toISOString().slice(0, 10))}.</p>
          {monedasMezcladas && (
            <p className="rounded bg-warn/10 px-3 py-2 text-xs text-warn">
              Estás comparando monedas distintas: una TIR en UI o UP es real (sin inflación) y no se compara directo con una en USD o pesos.
            </p>
          )}

          {seleccionadas.length === 1 ? (
            (() => {
              const f = seleccionadas[0];
              const e = efectivo(f.i);
              return (
                <BondAnalysis
                  titulo={f.i.nombre}
                  subtitulo={`${f.i.isin} · ${f.i.moneda}${f.i.especie ? ` · ${f.i.especie}` : ""}`}
                  datos={{ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio }}
                  analisis={f.a}
                  moneda={f.i.moneda}
                  valorNominal={f.a.completo ? nominalParaMonto(f.a, montoNum) : undefined}
                />
              );
            })()
          ) : (
            <TablaComparacion filas={seleccionadas} monto={montoNum} />
          )}
        </Panel>
      )}

      <Panel title="Catálogo">
        <div className="flex flex-col gap-3 print:hidden">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, ISIN o código…"
            className="w-full sm:max-w-md rounded border border-ink-border bg-ink px-3 py-1.5 text-sm text-paper"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted mr-1">Tipo</span>
            {GRUPOS.map((g) => (
              <Chip key={g} active={grupos.includes(g)} onClick={() => setGrupos((x) => toggle(x, g))}>
                {g} <span className="opacity-60">{filas.filter((f) => f.grupo === g).length}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted mr-1">Moneda</span>
            {MONEDAS.filter((m) => filas.some((f) => f.i.moneda === m)).map((m) => (
              <Chip key={m} active={monedas.includes(m)} onClick={() => setMonedas((x) => toggle(x, m))}>{m}</Chip>
            ))}
            <span className="mx-2 h-4 w-px bg-ink-border" />
            <Chip active={soloConTir} onClick={() => setSoloConTir((v) => !v)}>Solo con TIR</Chip>
          </div>
          <p className="text-[11px] text-muted">
            Marcá hasta {MAX_COMPARAR} para comparar. Si a un bono le falta la tasa o el vencimiento (la BVM no siempre los publica), tocá “Completar” y cargalo una vez.
          </p>
        </div>

        {cargando ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead className="text-muted border-b border-ink-border">
                <tr>
                  <th className="px-2 py-2 w-6"></th>
                  <Th campo="nombre">Instrumento</Th>
                  <th className="px-2 py-2 text-left font-medium">Mon.</th>
                  <Th campo="precio" right>Precio</Th>
                  <th className="px-2 py-2 text-right font-medium">Cupón</th>
                  <Th campo="vencimiento">Vence</Th>
                  <Th campo="tir" right>TIR</Th>
                  <Th campo="currentYield" right>Rend. corr.</Th>
                  <Th campo="duration" right>Duration</Th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const e = efectivo(f.i);
                  const marcado = comparar.includes(f.i.isin);
                  return (
                    <FilaTabla
                      key={f.i.isin}
                      f={f}
                      e={e}
                      marcado={marcado}
                      deshabilitado={!marcado && comparar.length >= MAX_COMPARAR}
                      onToggle={() => setComparar((x) => toggle(x, f.i.isin))}
                      editando={editando === f.i.isin}
                      onEditar={() => setEditando(editando === f.i.isin ? null : f.i.isin)}
                      onGuardado={() => { setEditando(null); cargar(); }}
                    />
                  );
                })}
              </tbody>
            </table>
            {!visibles.length && <p className="px-2 py-4 text-sm text-muted">No hay instrumentos con esos filtros.</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}

function FilaTabla({
  f, e, marcado, deshabilitado, onToggle, editando, onEditar, onGuardado,
}: {
  f: Fila;
  e: ReturnType<typeof efectivo>;
  marcado: boolean;
  deshabilitado: boolean;
  onToggle: () => void;
  editando: boolean;
  onEditar: () => void;
  onGuardado: () => void;
}) {
  const manual = f.i.cupon_manual != null || f.i.vencimiento_manual != null || f.i.frecuencia != null;
  return (
    <>
      <tr className={clsx("border-b border-ink-border/50 hover:bg-ink/60", marcado && "bg-gold/5")}>
        <td className="px-2 py-1.5">
          <input type="checkbox" checked={marcado} disabled={deshabilitado} onChange={onToggle} aria-label={`Comparar ${f.i.nombre}`} />
        </td>
        <td className="px-2 py-1.5 max-w-[260px]">
          <p className="text-paper truncate" title={f.i.nombre}>{f.i.nombre}</p>
          <p className="text-[10px] text-muted truncate">{f.i.isin}{f.i.codigo && ` · ${f.i.codigo}`} · {f.grupo}</p>
        </td>
        <td className="px-2 py-1.5 text-muted">{f.i.moneda}</td>
        <td className="px-2 py-1.5 text-right font-mono" title={e.letra ? `Letra a descuento: el vector publica tasa ${fmtNum(e.tasaVector, 2, "%")}` : undefined}>{fmtNum(e.precio, 2)}</td>
        <td className="px-2 py-1.5 text-right font-mono">{e.letra ? "Letra" : fmtNum(e.cupon, 3, "%")}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(e.vencimiento)}</td>
        <td className="px-2 py-1.5 text-right font-mono font-semibold text-gain">{fmtNum(f.a.tir, 2, "%")}</td>
        <td className="px-2 py-1.5 text-right font-mono">{e.letra ? "—" : fmtNum(f.a.currentYield, 2, "%")}</td>
        <td className="px-2 py-1.5 text-right font-mono">{fmtNum(f.a.duration, 2)}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          <button type="button" onClick={onEditar} className="text-[11px] text-muted underline hover:text-paper">
            {e.letra ? (f.a.completo ? "" : "Completar") : f.a.completo ? (manual ? "Editar" : "Ajustar") : "Completar"}
          </button>
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={10}>
            <EditorDatos i={f.i} onSaved={onGuardado} onCancel={onEditar} />
          </td>
        </tr>
      )}
    </>
  );
}

function TablaComparacion({ filas, monto }: { filas: Fila[]; monto: number }) {
  const [detalle, setDetalle] = useState<string | null>(null);
  const datos = filas.map((f) => {
    const e = efectivo(f.i);
    const m = f.a.completo ? escalar(f.a, nominalParaMonto(f.a, monto)) : null;
    return { f, e, m };
  });
  const mejorTir = Math.max(...datos.map((d) => d.f.a.tir ?? -Infinity));
  const mejorGanancia = Math.max(...datos.map((d) => d.m?.ganancia ?? -Infinity));

  type Fila_ = { label: string; valor: (d: (typeof datos)[number]) => string; destacar?: (d: (typeof datos)[number]) => boolean };
  const secciones: { titulo: string; filas: Fila_[] }[] = [
    {
      titulo: "Rendimiento",
      filas: [
        { label: "TIR al día", valor: (d) => fmtNum(d.f.a.tir, 2, "%"), destacar: (d) => d.f.a.tir === mejorTir },
        { label: "Rendimiento corriente", valor: (d) => (d.e.letra ? "—" : fmtNum(d.f.a.currentYield, 2, "%")) },
        { label: "Cupón anual", valor: (d) => (d.e.letra ? "Letra (sin cupón)" : fmtNum(d.e.cupon, 3, "%")) },
      ],
    },
    {
      titulo: `Si invertís ${fmtNum(monto, 0)}`,
      filas: [
        { label: "Interés por año", valor: (d) => (d.m ? fmtMonto(d.m.interesAnual, d.f.i.moneda) : "—") },
        { label: "Intereses futuros", valor: (d) => (d.m ? fmtMonto(d.m.totalIntereses, d.f.i.moneda) : "—") },
        { label: "Total a cobrar", valor: (d) => (d.m ? fmtMonto(d.m.totalACobrar, d.f.i.moneda) : "—") },
        {
          label: "Ganancia al vencimiento",
          valor: (d) => (d.m ? `${fmtMonto(d.m.ganancia, d.f.i.moneda)} (+${fmtNum(d.f.a.gananciaAlVencimiento, 1, "%")})` : "—"),
          destacar: (d) => d.m?.ganancia === mejorGanancia,
        },
      ],
    },
    {
      titulo: "Plazo y riesgo",
      filas: [
        { label: "Vencimiento", valor: (d) => fmtFecha(d.e.vencimiento) },
        { label: "Plazo", valor: (d) => fmtNum(d.f.a.aniosAlVencimiento, 1, " años") },
        { label: "Duration", valor: (d) => fmtNum(d.f.a.duration, 2, " años") },
        { label: "Si la tasa sube 1 punto", valor: (d) => (d.f.a.durationModificada != null ? `−${fmtNum(d.f.a.durationModificada, 1, "%")}` : "—") },
      ],
    },
    {
      titulo: "Precio",
      filas: [
        { label: "Precio limpio", valor: (d) => fmtNum(d.e.precio, 2) },
        { label: "Próximo cupón", valor: (d) => fmtFecha(d.f.a.proximoCupon) },
      ],
    },
  ];

  const abierta = datos.find((d) => d.f.i.isin === detalle);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr>
              <th className="w-44"></th>
              {datos.map(({ f }) => (
                <th key={f.i.isin} className="px-3 pb-3 text-left align-bottom min-w-[170px]">
                  <span className="block text-sm font-semibold text-paper leading-snug">{f.i.nombre}</span>
                  <span className="block text-[11px] font-normal text-muted">{f.i.moneda} · {f.i.isin}</span>
                </th>
              ))}
            </tr>
          </thead>
          {secciones.map((sec) => (
            <tbody key={sec.titulo}>
              <tr>
                <td colSpan={datos.length + 1} className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{sec.titulo}</td>
              </tr>
              {sec.filas.map((fila) => (
                <tr key={fila.label} className="border-t border-ink-border/60">
                  <td className="py-1.5 pr-3 text-xs text-muted">{fila.label}</td>
                  {datos.map((d) => (
                    <td
                      key={d.f.i.isin}
                      className={clsx(
                        "px-3 py-1.5 whitespace-nowrap",
                        fila.destacar?.(d) && datos.length > 1 ? "font-semibold text-gain" : "text-paper"
                      )}
                    >
                      {fila.valor(d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tbody className="print:hidden">
            <tr>
              <td></td>
              {datos.map(({ f }) => (
                <td key={f.i.isin} className="px-3 pt-3">
                  <button type="button" onClick={() => setDetalle(detalle === f.i.isin ? null : f.i.isin)} className="text-[11px] text-muted underline hover:text-paper">
                    {detalle === f.i.isin ? "Cerrar ficha" : "Ver ficha completa"}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {abierta && (
        <div className="rounded-xl border border-ink-border p-4 print:hidden">
          <BondAnalysis
            titulo={abierta.f.i.nombre}
            subtitulo={`${abierta.f.i.isin} · ${abierta.f.i.moneda}`}
            datos={{ cupon: abierta.e.cupon, frecuencia: abierta.e.frecuencia, vencimiento: abierta.e.vencimiento, precio: abierta.e.precio }}
            analisis={abierta.f.a}
            moneda={abierta.f.i.moneda}
            valorNominal={abierta.f.a.completo ? nominalParaMonto(abierta.f.a, monto) : undefined}
            mostrarAviso={false}
          />
        </div>
      )}

      <p className="text-[10px] text-muted">{AVISO_SIMULACION}</p>
    </div>
  );
}
