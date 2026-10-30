"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import BondAnalysis, { AVISO_SIMULACION, fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import CatalogoBvmSync from "@/components/CatalogoBvmSync";
import InformeBono from "@/components/InformeBono";
import CostosEditor from "@/components/CostosEditor";
import { useCostos } from "@/lib/useCostos";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, type Costos } from "@/lib/costos";
import { analizarBono, escalar, nominalParaMonto, type AnalisisBono } from "@/lib/bondMath";
import { efectivo, grupoDe, GRUPOS, type Grupo, type Instrumento } from "@/lib/bvm";

const MONEDAS = ["USD", "UI", "UYU", "UP", "EUR", "BRL", "COP", "UR"];
const MAX_COMPARAR = 4;

type Fila = { i: Instrumento; a: AnalisisBono; grupo: Grupo; frecuenciaSupuesta: boolean };
type Orden = "tir" | "currentYield" | "vencimiento" | "duration" | "precio" | "nombre";

// Color por tipo de instrumento (borde, punto y etiqueta).
const COLOR_GRUPO: Record<Grupo, { punto: string; etiqueta: string; borde: string }> = {
  "Uruguay soberano": { punto: "bg-[#2563EB]", etiqueta: "bg-[#2563EB]/10 text-[#1D4ED8]", borde: "border-l-[#2563EB]" },
  Corporativos: { punto: "bg-[#7C3AED]", etiqueta: "bg-[#7C3AED]/10 text-[#6D28D9]", borde: "border-l-[#7C3AED]" },
  Fideicomisos: { punto: "bg-[#0D9488]", etiqueta: "bg-[#0D9488]/10 text-[#0F766E]", borde: "border-l-[#0D9488]" },
  Exterior: { punto: "bg-[#D97706]", etiqueta: "bg-[#D97706]/10 text-[#B45309]", borde: "border-l-[#D97706]" },
  Acciones: { punto: "bg-[#DB2777]", etiqueta: "bg-[#DB2777]/10 text-[#BE185D]", borde: "border-l-[#DB2777]" },
  Otros: { punto: "bg-[#94A3B8]", etiqueta: "bg-[#94A3B8]/15 text-[#475569]", borde: "border-l-[#94A3B8]" },
};
const COLOR_MONEDA: Record<string, string> = {
  USD: "bg-[#1FAE6D]/15 text-[#15803D]",
  UI: "bg-[#4F46E5]/10 text-[#4338CA]",
  UYU: "bg-[#0EA5E9]/15 text-[#0369A1]",
  UP: "bg-[#9333EA]/10 text-[#7E22CE]",
};

const PLAZOS = [
  { id: "1", label: "Hasta 1 año", min: 0, max: 1 },
  { id: "3", label: "1 a 3 años", min: 1, max: 3 },
  { id: "7", label: "3 a 7 años", min: 3, max: 7 },
  { id: "15", label: "7 a 15 años", min: 7, max: 15 },
  { id: "+", label: "Más de 15", min: 15, max: Infinity },
] as const;

const ORDENES: { id: string; label: string; campo: Orden; desc: boolean }[] = [
  { id: "tir", label: "Mayor TIR", campo: "tir", desc: true },
  { id: "vto", label: "Vencimiento más cercano", campo: "vencimiento", desc: false },
  { id: "vto-l", label: "Vencimiento más lejano", campo: "vencimiento", desc: true },
  { id: "cy", label: "Mayor rendimiento corriente", campo: "currentYield", desc: true },
  { id: "dur", label: "Menor riesgo de tasa (duration)", campo: "duration", desc: false },
  { id: "precio", label: "Menor precio", campo: "precio", desc: false },
  { id: "nombre", label: "Nombre A-Z", campo: "nombre", desc: false },
];

const POR_PAGINA = 30;

function aniosHasta(f: Fila): number | null {
  const v = efectivo(f.i).vencimiento;
  if (!v) return null;
  return (new Date(v + "T00:00:00").getTime() - Date.now()) / (365.25 * 86_400_000);
}

function colorTir(tir: number | null) {
  if (tir == null) return "text-muted";
  if (tir >= 7) return "text-[#15803D]";
  if (tir >= 4) return "text-gain";
  if (tir >= 0) return "text-paper";
  return "text-loss";
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
        active ? "bg-gold text-white shadow-sm" : "bg-ink-panel border border-ink-border text-muted hover:text-paper"
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
  const [irpf, setIrpf] = useState(i.irpf_manual != null ? String(i.irpf_manual) : "");
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    const { error } = await supabase
      .from("instrumentos")
      .update({
        cupon_manual: cupon.trim() === "" ? null : Number(cupon.replace(",", ".")),
        vencimiento_manual: vto || null,
        frecuencia: Number(frec),
        irpf_manual: irpf.trim() === "" ? null : Number(irpf.replace(",", ".")),
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
      <label className="flex flex-col text-[10px] text-muted">IRPF propio %
        <input className={clsx(input, "w-20")} value={irpf} onChange={(ev) => setIrpf(ev.target.value)} placeholder="según tipo" />
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
  const [soloConTir, setSoloConTir] = useState(true);
  const [plazos, setPlazos] = useState<string[]>([]);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [herramientas, setHerramientas] = useState(false);
  const [orden, setOrden] = useState<{ campo: Orden; desc: boolean }>({ campo: "tir", desc: true });
  const [comparar, setComparar] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [monto, setMonto] = useState("10000");
  const [informe, setInforme] = useState(false);
  const { costos, guardar: guardarCostos } = useCostos();

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
      .filter((f) => {
        if (!plazos.length) return true;
        const n = aniosHasta(f);
        return n != null && PLAZOS.some((p) => plazos.includes(p.id) && n >= p.min && n < p.max);
      })
      .sort((x, y) => {
        const a = valor(x), b = valor(y);
        if (a == null && b == null) return 0;
        if (a == null) return 1; // sin dato siempre al final
        if (b == null) return -1;
        const c = typeof a === "string" ? a.localeCompare(String(b), "es") : (a as number) - (b as number);
        return orden.desc ? -c : c;
      });
  }, [filas, q, monedas, grupos, soloConTir, plazos, orden]);

  useEffect(() => { setLimite(POR_PAGINA); }, [q, monedas, grupos, soloConTir, plazos, orden]);
  const filtrosActivos = monedas.length + grupos.length + plazos.length + (soloConTir ? 0 : 1);
  const ordenActual = ORDENES.find((o) => o.campo === orden.campo && o.desc === orden.desc)?.id ?? "tir";
  function limpiarFiltros() { setMonedas([]); setGrupos([]); setPlazos([]); setSoloConTir(true); setQ(""); }

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
          <h1 className="font-display text-2xl sm:text-3xl text-paper">Opciones de inversión</h1>
          <p className="text-sm text-muted mt-1">
            {instrumentos.length} instrumentos de la BVM · {conTir} con TIR calculada
            {instrumentos[0]?.fecha_precio && ` · precios del ${fmtFecha(instrumentos[0].fecha_precio)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHerramientas((v) => !v)}
          className="sm:hidden rounded-full border border-ink-border bg-ink-panel px-3 py-1.5 text-xs text-muted"
        >
          {herramientas ? "Ocultar costos y catálogo" : "⚙ Costos, IRPF y catálogo"}
        </button>
        <div className={clsx("flex-wrap items-center gap-3", herramientas ? "flex" : "hidden sm:flex")}>
          <CostosEditor costos={costos} onGuardar={guardarCostos} />
          <CatalogoBvmSync onSynced={cargar} />
        </div>
      </div>

      {seleccionadas.length > 0 && (
        <div id="comparacion" className="scroll-mt-4" />
      )}
      {seleccionadas.length > 0 && (
        <Panel
          title={`Comparación (${seleccionadas.length})`}
          action={
            <div className="flex items-center gap-3 print:hidden">
              <button type="button" onClick={() => setInforme(true)} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-ink-panel hover:bg-gold-bright">
                Generar informe
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
          {monedasMezcladas && (
            <p className="rounded bg-warn/10 px-3 py-2 text-xs text-warn">
              Estás comparando monedas distintas ({[...new Set(seleccionadas.map((f) => f.i.moneda))].join(", ")}): las tasas no se comparan directo.
              Una TIR en pesos tiene que compensar la devaluación frente al dólar, y una en UI o UP es real (sin inflación).
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
                  valorNominal={f.a.completo ? nominalNetoParaMonto(f.a, montoNum, costos) : undefined}
                  costos={costos}
                  irpfPct={irpfDe(costos, f.i)}
                />
              );
            })()
          ) : (
            <TablaComparacion filas={seleccionadas} monto={montoNum} costos={costos} />
          )}
        </Panel>
      )}

      {informe && seleccionadas.length > 0 && (
        <InformeBono bonos={seleccionadas.map((f) => ({ i: f.i, a: f.a }))} monto={montoNum} costos={costos} onClose={() => setInforme(false)} />
      )}

      <section className="flex flex-col gap-3">
        {/* Barra de búsqueda + orden + filtros (fija arriba en el celular) */}
        <div className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-ink/95 backdrop-blur px-4 sm:px-0 py-2 flex flex-col gap-2 print:hidden">
          <div className="flex gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar bono, ISIN o código…"
              className="min-w-0 flex-1 rounded-xl border border-ink-border bg-ink-panel px-3.5 py-2.5 text-sm text-paper shadow-sm focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
            <button
              type="button"
              onClick={() => setFiltrosAbiertos((v) => !v)}
              className={clsx(
                "relative shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium shadow-sm",
                filtrosAbiertos ? "bg-gold text-white" : "bg-ink-panel border border-ink-border text-paper"
              )}
            >
              Filtros
              {filtrosActivos > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-semibold text-white">
                  {filtrosActivos}
                </span>
              )}
            </button>
          </div>

          {/* Tipo: siempre visible, deslizable en el celular */}
          <div className="-mx-4 sm:mx-0 flex gap-1.5 overflow-x-auto px-4 sm:px-0 pb-0.5 sm:flex-wrap [scrollbar-width:none]">
            <Chip active={!grupos.length} onClick={() => setGrupos([])}>Todos</Chip>
            {GRUPOS.map((g) => {
              const n = filas.filter((f) => f.grupo === g && (!soloConTir || f.a.tir != null)).length;
              if (!n) return null;
              return (
                <Chip key={g} active={grupos.includes(g)} onClick={() => setGrupos((x) => toggle(x, g))}>
                  <span className={clsx("h-2 w-2 rounded-full", COLOR_GRUPO[g].punto)} />
                  {g} <span className="opacity-60">{n}</span>
                </Chip>
              );
            })}
          </div>

          {filtrosAbiertos && (
            <div className="rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-lg flex flex-col gap-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Ordenar por</p>
                <select
                  value={ordenActual}
                  onChange={(e) => { const o = ORDENES.find((x) => x.id === e.target.value)!; setOrden({ campo: o.campo, desc: o.desc }); }}
                  className="w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper"
                >
                  {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Moneda</p>
                <div className="flex flex-wrap gap-1.5">
                  {MONEDAS.filter((m) => filas.some((f) => f.i.moneda === m)).map((m) => (
                    <Chip key={m} active={monedas.includes(m)} onClick={() => setMonedas((x) => toggle(x, m))}>{m}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Plazo al vencimiento</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLAZOS.map((p) => (
                    <Chip key={p.id} active={plazos.includes(p.id)} onClick={() => setPlazos((x) => toggle(x, p.id))}>{p.label}</Chip>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-paper">
                <span>
                  Solo con datos completos
                  <span className="block text-[11px] text-muted">Oculta los que no tienen tasa o vencimiento (no se puede calcular la TIR).</span>
                </span>
                <input type="checkbox" checked={soloConTir} onChange={() => setSoloConTir((v) => !v)} className="h-5 w-5 accent-[#171A21]" />
              </label>
              <div className="flex justify-between">
                <button type="button" onClick={limpiarFiltros} className="text-sm text-muted underline">Limpiar todo</button>
                <button type="button" onClick={() => setFiltrosAbiertos(false)} className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white">
                  Ver {visibles.length} resultados
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted print:hidden">
          <span>{visibles.length} resultados · {ORDENES.find((o) => o.id === ordenActual)?.label}</span>
          {filtrosActivos > 0 && <button type="button" onClick={limpiarFiltros} className="underline">Limpiar filtros</button>}
        </div>

        {cargando ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : !visibles.length ? (
          <div className="rounded-2xl border border-dashed border-ink-border bg-ink-panel p-8 text-center text-sm text-muted">
            No hay instrumentos con esos filtros.
            <button type="button" onClick={limpiarFiltros} className="mt-2 block w-full text-paper underline">Limpiar filtros</button>
          </div>
        ) : (
          <>
            {/* Celular y tablet: tarjetas */}
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {visibles.slice(0, limite).map((f) => {
                const marcado = comparar.includes(f.i.isin);
                return (
                  <TarjetaBono
                    key={f.i.isin}
                    f={f}
                    marcado={marcado}
                    deshabilitado={!marcado && comparar.length >= MAX_COMPARAR}
                    onToggle={() => setComparar((x) => toggle(x, f.i.isin))}
                    editando={editando === f.i.isin}
                    onEditar={() => setEditando(editando === f.i.isin ? null : f.i.isin)}
                    onGuardado={() => { setEditando(null); cargar(); }}
                  />
                );
              })}
            </div>

            {/* Escritorio: tabla */}
            <div className="hidden lg:block rounded-2xl border border-ink-border bg-ink-panel shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="text-muted bg-ink/60 border-b border-ink-border">
                  <tr>
                    <th className="px-3 py-2.5 w-6"></th>
                    <Th campo="nombre">Instrumento</Th>
                    <th className="px-2 py-2.5 text-left font-medium">Moneda</th>
                    <Th campo="precio" right>Precio</Th>
                    <th className="px-2 py-2.5 text-right font-medium">Cupón</th>
                    <Th campo="vencimiento">Vence</Th>
                    <Th campo="tir" right>TIR</Th>
                    <Th campo="currentYield" right>Rend. corr.</Th>
                    <Th campo="duration" right>Duration</Th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.slice(0, limite).map((f) => {
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
            </div>

            {visibles.length > limite && (
              <button
                type="button"
                onClick={() => setLimite((n) => n + POR_PAGINA)}
                className="mx-auto rounded-full border border-ink-border bg-ink-panel px-5 py-2 text-sm text-paper shadow-sm"
              >
                Ver más ({visibles.length - limite} restantes)
              </button>
            )}
            <p className="text-[11px] text-muted print:hidden">
              Marcá hasta {MAX_COMPARAR} para comparar. Si a un bono le falta la tasa o el vencimiento (la BVM no siempre los publica), tocá “Completar” y cargalo una vez.
            </p>
          </>
        )}
      </section>

      {/* Barra flotante para ir a la comparación (celular) */}
      {seleccionadas.length > 0 && (
        <button
          type="button"
          onClick={() => document.getElementById("comparacion")?.scrollIntoView({ behavior: "smooth" })}
          className="lg:hidden fixed bottom-20 left-4 z-40 rounded-full bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white shadow-lg print:hidden"
        >
          Comparar {seleccionadas.length} ↑
        </button>
      )}
    </div>
  );
}

function BadgeMoneda({ m }: { m: string }) {
  return (
    <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", COLOR_MONEDA[m] ?? "bg-ink text-muted")}>{m}</span>
  );
}

function TarjetaBono({
  f, marcado, deshabilitado, onToggle, editando, onEditar, onGuardado,
}: {
  f: Fila;
  marcado: boolean;
  deshabilitado: boolean;
  onToggle: () => void;
  editando: boolean;
  onEditar: () => void;
  onGuardado: () => void;
}) {
  const e = efectivo(f.i);
  const c = COLOR_GRUPO[f.grupo];
  const plazo = aniosHasta(f);
  const manual = f.i.cupon_manual != null || f.i.vencimiento_manual != null || f.i.frecuencia != null;
  const accion = e.letra ? (f.a.completo ? null : "Completar") : f.a.completo ? (manual ? "Editar" : "Ajustar") : "Completar";
  return (
    <div
      className={clsx(
        "rounded-2xl border border-l-4 bg-ink-panel shadow-sm transition-shadow",
        c.borde,
        marcado ? "border-y-[#2563EB]/40 border-r-[#2563EB]/40 ring-2 ring-[#2563EB]/20" : "border-y-ink-border border-r-ink-border"
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <BadgeMoneda m={f.i.moneda} />
            <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-medium", c.etiqueta)}>{f.grupo}</span>
            {e.letra && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] text-muted">Letra</span>}
          </div>
          <p className="text-sm font-semibold leading-snug text-paper line-clamp-2">{f.i.nombre}</p>
          <p className="mt-0.5 text-[10px] text-muted truncate">{f.i.isin}{f.i.codigo && ` · ${f.i.codigo}`}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={clsx("font-mono text-xl font-bold leading-none", colorTir(f.a.tir))}>{fmtNum(f.a.tir, 2, "%")}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">TIR anual</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-ink-border px-4 py-3 text-center">
        <Dato label="Precio" valor={fmtNum(e.precio, 2)} />
        <Dato label="Cupón" valor={e.letra ? "—" : fmtNum(e.cupon, 2, "%")} />
        <Dato label="Vence" valor={e.vencimiento ? e.vencimiento.slice(0, 4) : "—"} sub={plazo != null && plazo > 0 ? `${plazo < 1 ? Math.round(plazo * 12) + " m" : plazo.toFixed(1) + " a"}` : undefined} />
        <Dato label="Duration" valor={fmtNum(f.a.duration, 1)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink-border px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={deshabilitado}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
            marcado ? "bg-[#2563EB] text-white" : "border border-ink-border text-paper"
          )}
        >
          {marcado ? "✓ En comparación" : "+ Comparar"}
        </button>
        {accion && (
          <button type="button" onClick={onEditar} className={clsx("text-xs underline", accion === "Completar" ? "text-warn" : "text-muted")}>
            {accion}
          </button>
        )}
      </div>
      {editando && <div className="border-t border-ink-border"><EditorDatos i={f.i} onSaved={onGuardado} onCancel={onEditar} /></div>}
    </div>
  );
}

function Dato({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-medium text-paper truncate">{valor}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
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
          <p className="flex items-center gap-1.5 text-[10px] text-muted truncate">
            <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", COLOR_GRUPO[f.grupo].punto)} />
            {f.i.isin}{f.i.codigo && ` · ${f.i.codigo}`} · {f.grupo}
          </p>
        </td>
        <td className="px-2 py-1.5"><BadgeMoneda m={f.i.moneda} /></td>
        <td className="px-2 py-1.5 text-right font-mono" title={e.letra ? `Letra a descuento: el vector publica tasa ${fmtNum(e.tasaVector, 2, "%")}` : undefined}>{fmtNum(e.precio, 2)}</td>
        <td className="px-2 py-1.5 text-right font-mono">{e.letra ? "Letra" : fmtNum(e.cupon, 3, "%")}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(e.vencimiento)}</td>
        <td className={clsx("px-2 py-1.5 text-right font-mono font-semibold", colorTir(f.a.tir))}>{fmtNum(f.a.tir, 2, "%")}</td>
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

function TablaComparacion({ filas, monto, costos }: { filas: Fila[]; monto: number; costos: Costos }) {
  const [detalle, setDetalle] = useState<string | null>(null);
  const datos = filas.map((f) => {
    const e = efectivo(f.i);
    const vn = f.a.completo ? nominalNetoParaMonto(f.a, monto, costos) : 0;
    const m = f.a.completo ? escalar(f.a, vn) : null;
    const n = f.a.completo ? aplicarCostos(f.a, vn, costos, irpfDe(costos, f.i)) : null;
    return { f, e, m, n, vn };
  });
  // Solo tiene sentido marcar "el mejor" si todos están en la misma moneda.
  const mismaMoneda = new Set(filas.map((f) => f.i.moneda)).size === 1;
  const mejorTir = Math.max(...datos.map((d) => d.n?.tirNeta ?? -Infinity));
  const mejorGanancia = Math.max(...datos.map((d) => d.n?.gananciaNeta ?? -Infinity));

  type Fila_ = { label: string; valor: (d: (typeof datos)[number]) => string; destacar?: (d: (typeof datos)[number]) => boolean };
  const secciones: { titulo: string; filas: Fila_[] }[] = [
    {
      titulo: "Rendimiento",
      filas: [
        { label: "TIR neta (costos e IRPF)", valor: (d) => fmtNum(d.n?.tirNeta, 2, "%"), destacar: (d) => d.n?.tirNeta === mejorTir },
        { label: "IRPF sobre intereses", valor: (d) => (d.n ? (d.n.irpfPct > 0 ? `${fmtNum(d.n.irpfPct, 0)}%` : "Exonerado") : "—") },
        { label: "TIR bruta", valor: (d) => fmtNum(d.f.a.tir, 2, "%") },
        { label: "Rendimiento corriente", valor: (d) => (d.e.letra ? "—" : fmtNum(d.f.a.currentYield, 2, "%")) },
        { label: "Cupón anual", valor: (d) => (d.e.letra ? "Letra (sin cupón)" : fmtNum(d.e.cupon, 3, "%")) },
      ],
    },
    {
      titulo: `Si invertís ${fmtNum(monto, 0)}`,
      filas: [
        { label: "Interés por año", valor: (d) => (d.m ? fmtMonto(d.m.interesAnual, d.f.i.moneda) : "—") },
        { label: "Intereses futuros", valor: (d) => (d.m ? fmtMonto(d.m.totalIntereses, d.f.i.moneda) : "—") },
        { label: "Costos del corredor", valor: (d) => (d.n ? fmtMonto(d.n.costosTotales, d.f.i.moneda) : "—") },
        { label: "IRPF retenido", valor: (d) => (d.n ? fmtMonto(d.n.irpfTotal, d.f.i.moneda) : "—") },
        { label: "Total a cobrar (neto)", valor: (d) => (d.n ? fmtMonto(d.n.totalACobrarNeto, d.f.i.moneda) : "—") },
        {
          label: "Ganancia neta",
          valor: (d) => (d.n ? `${fmtMonto(d.n.gananciaNeta, d.f.i.moneda)} (+${fmtNum(d.n.gananciaNetaPct, 1, "%")})` : "—"),
          destacar: (d) => d.n?.gananciaNeta === mejorGanancia,
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
                        fila.destacar?.(d) && mismaMoneda ? "font-semibold text-gain" : "text-paper"
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
            valorNominal={abierta.f.a.completo ? abierta.vn : undefined}
            costos={costos}
            irpfPct={irpfDe(costos, abierta.f.i)}
            mostrarAviso={false}
          />
        </div>
      )}

      <p className="text-[10px] text-muted">{AVISO_SIMULACION}</p>
    </div>
  );
}
