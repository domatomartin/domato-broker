"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { fmtFecha, fmtNum, fmtMonto } from "@/components/BondAnalysis";
import { analizarBono, sensibilidad, type AnalisisBono } from "@/lib/bondMath";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, type Costos } from "@/lib/costos";
import { efectivo, grupoDe, type Instrumento } from "@/lib/bvm";

type Punto = { fecha: string; precio: number };
const PERIODOS = [
  { id: "3m", label: "3M", meses: 3 },
  { id: "6m", label: "6M", meses: 6 },
  { id: "1a", label: "1A", meses: 12 },
  { id: "3a", label: "3A", meses: 36 },
  { id: "5a", label: "5A", meses: 60 },
] as const;

const LINEA = "#2563EB";

function restarMeses(iso: string, meses: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

/** Estadísticas del período: variación, extremos, volatilidad y cuántos días cambió el precio (proxy de liquidez). */
function estadisticas(p: Punto[]) {
  if (p.length < 2) return null;
  const primero = p[0], ultimo = p[p.length - 1];
  let max = p[0], min = p[0], cambios = 0;
  const rets: number[] = [];
  for (let i = 1; i < p.length; i++) {
    if (p[i].precio > max.precio) max = p[i];
    if (p[i].precio < min.precio) min = p[i];
    if (Math.abs(p[i].precio - p[i - 1].precio) > 1e-9) cambios++;
    rets.push(Math.log(p[i].precio / p[i - 1].precio));
  }
  const media = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varianza = rets.reduce((s, r) => s + (r - media) ** 2, 0) / Math.max(1, rets.length - 1);
  return {
    variacion: (ultimo.precio / primero.precio - 1) * 100,
    max, min,
    volatilidad: Math.sqrt(varianza) * Math.sqrt(252) * 100,
    pctDiasConCambio: (cambios / (p.length - 1)) * 100,
    desde: primero.fecha,
  };
}

function Grafico({ puntos }: { puntos: Punto[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, PL = 44, PR = 12, PT = 12, PB = 26;
  if (puntos.length < 2) return <p className="py-10 text-center text-sm text-muted">Sin suficientes precios en el período.</p>;

  const t0 = Date.parse(puntos[0].fecha), t1 = Date.parse(puntos[puntos.length - 1].fecha);
  let lo = Math.min(...puntos.map((p) => p.precio)), hi = Math.max(...puntos.map((p) => p.precio));
  const pad = Math.max((hi - lo) * 0.12, hi * 0.005, 0.1);
  lo -= pad; hi += pad;
  const x = (f: string) => PL + ((Date.parse(f) - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(p.fecha).toFixed(1)},${y(p.precio).toFixed(1)}`).join("");
  const area = `${linea}L${x(puntos[puntos.length - 1].fecha).toFixed(1)},${H - PB}L${PL},${H - PB}Z`;
  const ticksY = Array.from({ length: 4 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const nX = 5;
  const ticksX = Array.from({ length: nX }, (_, k) => puntos[Math.round((k * (puntos.length - 1)) / (nX - 1))].fecha);
  const par = lo < 100 && hi > 100;

  function mover(ev: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((ev.clientX - r.left) / r.width) * W;
    const t = t0 + ((px - PL) / (W - PL - PR)) * (t1 - t0);
    let best = 0, dist = Infinity;
    for (let i = 0; i < puntos.length; i++) {
      const d = Math.abs(Date.parse(puntos[i].fecha) - t);
      if (d < dist) { dist = d; best = i; }
    }
    setHover(best);
  }
  const h = hover != null ? puntos[hover] : null;
  const varH = h ? (h.precio / puntos[0].precio - 1) * 100 : 0;

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHover(null)} role="img" aria-label="Histórico de precios">
        <defs>
          <linearGradient id="relleno-precio" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={LINEA} stopOpacity="0.16" />
            <stop offset="100%" stopColor={LINEA} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#E5E7EB" strokeWidth="1" />
            <text x={PL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6E7684">{fmtNum(v, hi - lo < 4 ? 2 : 1)}</text>
          </g>
        ))}
        {par && (
          <g>
            <line x1={PL} x2={W - PR} y1={y(100)} y2={y(100)} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth="1" />
            <text x={W - PR} y={y(100) - 4} textAnchor="end" fontSize="10" fill="#6E7684">par (100)</text>
          </g>
        )}
        {ticksX.map((f, k) => (
          <text key={f + k} x={x(f)} y={H - 8} textAnchor={k === 0 ? "start" : k === nX - 1 ? "end" : "middle"} fontSize="10" fill="#6E7684">
            {fmtFecha(f).slice(3)}
          </text>
        ))}
        <path d={area} fill="url(#relleno-precio)" />
        <path d={linea} fill="none" stroke={LINEA} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={x(h.fecha)} x2={x(h.fecha)} y1={PT} y2={H - PB} stroke="#171A21" strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={x(h.fecha)} cy={y(h.precio)} r="4.5" fill={LINEA} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-ink-border bg-ink-panel px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${Math.min(78, Math.max(2, (x(h.fecha) / W) * 100 - 10))}%` }}
        >
          <p className="text-muted">{fmtFecha(h.fecha)}</p>
          <p className="font-semibold tabular-nums text-paper">{fmtNum(h.precio, 2)}</p>
          <p className={clsx("tabular-nums", varH >= 0 ? "text-gain" : "text-loss")}>{varH >= 0 ? "+" : ""}{fmtNum(varH, 2, "%")} en el período</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "gain" | "loss" }) {
  return (
    <div className="rounded-xl bg-ink px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("mt-0.5 text-lg font-semibold tabular-nums leading-tight", tono === "gain" ? "text-gain" : tono === "loss" ? "text-loss" : "text-paper")}>{valor}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function Fila({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted">{label}{hint && <span className="block text-[10px] opacity-80">{hint}</span>}</span>
      <span className="text-right text-sm font-medium tabular-nums text-paper">{valor}</span>
    </div>
  );
}

function Seccion({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-2xl border border-ink-border bg-ink-panel p-4", className)}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{titulo}</p>
      {children}
    </section>
  );
}

export default function DetalleInstrumento({ i, costos, onClose }: { i: Instrumento; costos: Costos; onClose: () => void }) {
  const [datos, setDatos] = useState<{ puntos: Punto[]; fuente?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("1a");
  const [tirObjetivo, setTirObjetivo] = useState("");

  useEffect(() => {
    let vivo = true;
    setDatos(null); setError(null);
    fetch(`/api/historico?isin=${encodeURIComponent(i.isin)}&anios=5`)
      .then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j.error) setError(j.error); else setDatos(j); })
      .catch(() => vivo && setError("No se pudo consultar el histórico"));
    return () => { vivo = false; };
  }, [i.isin]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);

  const e = efectivo(i);
  const grupo = grupoDe(i);
  const a: AnalisisBono = useMemo(
    () => analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i]
  );
  const irpf = irpfDe(costos, i);
  const neto = a.completo ? aplicarCostos(a, nominalNetoParaMonto(a, 10000, costos), costos, irpf) : null;
  const sens = a.completo && !e.variable ? sensibilidad(a, [-200, -100, -50, 50, 100, 200]) : [];

  const todos = datos?.puntos ?? [];
  const meses = PERIODOS.find((p) => p.id === periodo)!.meses;
  const visibles = useMemo(() => {
    if (!todos.length) return [];
    const desde = restarMeses(todos[todos.length - 1].fecha, meses);
    return todos.filter((p) => p.fecha >= desde);
  }, [todos, meses]);
  const st = estadisticas(visibles);
  const precioHoy = e.variable ? e.precioMercado : e.letra ? e.precio : i.precio;

  // Precio al que rendiría la TIR objetivo (usa la sensibilidad: mismo flujo, otra tasa).
  const objetivo = Number(tirObjetivo.replace(",", "."));
  const precioObjetivo =
    a.completo && a.tir != null && !e.variable && tirObjetivo.trim() !== "" && isFinite(objetivo)
      ? sensibilidad(a, [Math.round((objetivo - a.tir) * 100)])[0]?.precioLimpio ?? null
      : null;

  const real = ["UI", "UP", "UR"].includes(i.moneda);
  const pocoMovimiento = st != null && st.pctDiasConCambio < 15;

  return (
    <div className="fixed inset-0 z-[95] flex items-stretch justify-center bg-black/40 sm:items-start sm:p-6" onClick={onClose}>
      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden bg-ink shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-label={`Detalle de ${i.nombre}`}
      >
        {/* Encabezado */}
        <div className="flex items-start gap-3 border-b border-ink-border bg-ink-panel px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
              <span className="rounded-md bg-ink px-1.5 py-0.5 text-paper">{i.moneda}</span>
              <span className="rounded-md bg-ink px-1.5 py-0.5 text-muted">{grupo}</span>
              {e.variable && <span className="rounded-md bg-[#DB2777]/10 px-1.5 py-0.5 text-[#BE185D]">Renta variable · rendimiento estimado</span>}
              {e.letra && <span className="rounded-md bg-ink px-1.5 py-0.5 text-muted">Letra a descuento</span>}
              {!!e.amortizaciones?.length && <span className="rounded-md bg-[#0D9488]/10 px-1.5 py-0.5 text-[#0F766E]">Amortiza en cuotas</span>}
            </div>
            <h2 className="text-base font-semibold leading-snug text-paper sm:text-lg">{i.nombre}</h2>
            <p className="text-[11px] text-muted">{i.isin}{i.codigo ? ` · ${i.codigo}` : ""}{i.especie ? ` · ${i.especie}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-ink-border px-3 py-1 text-sm text-muted hover:text-paper" aria-label="Cerrar">✕</button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {/* KPIs principales */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Precio hoy" valor={fmtNum(precioHoy, 2)} sub={i.fecha_precio ? `vector ${fmtFecha(i.fecha_precio)}` : undefined} />
            <Kpi
              label={e.variable ? "Rendimiento estimado" : real ? `TIR real (${i.moneda})` : "TIR bruta"}
              valor={fmtNum(a.tir, 2, "%")}
              sub={neto ? `neta de costos${irpf ? " e IRPF" : ""}: ${fmtNum(neto.tirNeta, 2, "%")}` : undefined}
              tono="gain"
            />
            <Kpi
              label={`Variación ${PERIODOS.find((p) => p.id === periodo)!.label}`}
              valor={st ? `${st.variacion >= 0 ? "+" : ""}${fmtNum(st.variacion, 2, "%")}` : "—"}
              sub={st ? `desde ${fmtFecha(st.desde)}` : undefined}
              tono={st ? (st.variacion >= 0 ? "gain" : "loss") : undefined}
            />
            <Kpi label="Volatilidad anual" valor={st ? fmtNum(st.volatilidad, 1, "%") : "—"} sub="del precio en el período" />
          </div>

          {e.variable && precioHoy != null && precioHoy > 100 && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
              El rendimiento estimado ({fmtNum(e.cupon, 1, "%")}) es para quien invirtió a la par (100). Hoy el vector lo valúa en {fmtNum(precioHoy, 2)}: comprando a ese precio el rendimiento esperado es menor.
            </p>
          )}

          {/* Gráfico */}
          <Seccion titulo="Histórico de precios (vector BCU)">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {PERIODOS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodo(p.id)}
                    className={clsx("rounded-full px-2.5 py-1 text-xs font-medium", periodo === p.id ? "bg-gold text-white" : "border border-ink-border text-muted hover:text-paper")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {st && (
                <p className="text-[11px] text-muted">
                  Máx {fmtNum(st.max.precio, 2)} ({fmtFecha(st.max.fecha)}) · Mín {fmtNum(st.min.precio, 2)} ({fmtFecha(st.min.fecha)})
                </p>
              )}
            </div>
            {error ? (
              <p className="py-10 text-center text-sm text-loss">{error}</p>
            ) : !datos ? (
              <div className="h-[200px] animate-pulse rounded-xl bg-ink" />
            ) : (
              <Grafico puntos={visibles} />
            )}
            {pocoMovimiento && (
              <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">
                Poca liquidez: {st!.pctDiasConCambio < 1 ? "el precio casi no cambió en el período" : `el precio cambió solo en el ${fmtNum(st!.pctDiasConCambio, 0)}% de los días`}. El vector repite el último precio cuando no hay operaciones, así que el valor de mercado real puede ser distinto.
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted">
              Precio limpio cada 100 de valor nominal{e.amortizaciones?.length ? " residual" : ""}, según el vector de precios del BCU publicado por la BVM.
              {datos?.fuente && <> <a href={datos.fuente} target="_blank" rel="noreferrer" className="underline">Ver en la BVM</a>.</>}
            </p>
          </Seccion>

          <div className="grid gap-4 md:grid-cols-2">
            <Seccion titulo="Características">
              <Fila label={e.variable ? "Rendimiento estimado anual" : "Cupón anual"} valor={e.letra ? "Sin cupón" : fmtNum(e.cupon, 3, "%")} hint={e.escalonado?.length ? "tasa vigente (escalonada)" : undefined} />
              <Fila label="Pagos por año" valor={e.letra ? "—" : String(e.frecuencia)} hint={e.frecuenciaSupuesta ? "supuesta (sin dato)" : undefined} />
              <Fila label="Vencimiento" valor={fmtFecha(e.vencimiento)} hint={a.aniosAlVencimiento != null ? `${fmtNum(a.aniosAlVencimiento, 1)} años` : undefined} />
              <Fila label="Próximo pago" valor={fmtFecha(a.proximoCupon)} />
              <Fila label="IRPF" valor={irpf ? `${fmtNum(irpf, 0)}%` : "Exonerado"} />
              {e.amortizaciones?.length ? <Fila label="Amortización" valor={`${e.amortizaciones.length} cuotas`} /> : null}
            </Seccion>

            <Seccion titulo="Valuación al precio de hoy">
              {a.completo ? (
                <>
                  <Fila label="TIR efectiva anual" valor={fmtNum(a.tir, 2, "%")} hint={e.variable ? "estimación sobre precio 100" : `nominal ${fmtNum(a.tirNominal, 2, "%")}`} />
                  {!e.variable && <Fila label="Rendimiento corriente" valor={fmtNum(a.currentYield, 2, "%")} hint="cupón / precio" />}
                  {!e.variable && <Fila label="Cupón corrido" valor={fmtNum(a.interesCorrido, 3)} hint={`precio sucio ${fmtNum(a.precioSucio, 2)}`} />}
                  <Fila label="Duration modificada" valor={fmtNum(a.durationModificada, 2)} hint="% que cae el precio si la tasa sube 1 punto" />
                  {!e.variable && <Fila label="Convexidad" valor={fmtNum(a.convexidad, 1)} />}
                  <Fila label="Cobrás por cada 100" valor={fmtNum(a.totalACobrar, 2)} hint={`${fmtNum(a.totalIntereses, 2)} de intereses hasta el vencimiento`} />
                </>
              ) : (
                <p className="text-xs text-muted">Faltan datos para valuar: {a.faltan.join(", ")}. Completalos con “Completar” en la lista.</p>
              )}
            </Seccion>
          </div>

          {sens.length > 0 && (
            <Seccion titulo="¿Qué pasa con el precio si cambian las tasas?">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {sens.map((s) => (
                  <div key={s.deltaPb} className="rounded-lg bg-ink px-2 py-2 text-center">
                    <p className="text-[10px] text-muted">{s.deltaPb > 0 ? "+" : ""}{s.deltaPb / 100} pts · TIR {fmtNum(s.tir, 2, "%")}</p>
                    <p className="text-sm font-semibold tabular-nums text-paper">{fmtNum(s.precioLimpio, 2)}</p>
                    <p className={clsx("text-[10px] tabular-nums", s.variacionPct >= 0 ? "text-gain" : "text-loss")}>{s.variacionPct >= 0 ? "+" : ""}{fmtNum(s.variacionPct, 1, "%")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <label className="flex items-center gap-2">
                  ¿A qué precio rinde
                  <input value={tirObjetivo} onChange={(ev) => setTirObjetivo(ev.target.value)} inputMode="decimal" placeholder={a.tir != null ? fmtNum(a.tir + 0.5, 2) : "6"} className="w-20 rounded border border-ink-border bg-ink px-2 py-1 text-sm text-paper" />
                  % ?
                </label>
                {precioObjetivo != null && (
                  <span className="text-paper">
                    Precio limpio <strong className="tabular-nums">{fmtNum(precioObjetivo, 2)}</strong>
                    {precioHoy ? ` (${precioObjetivo >= precioHoy ? "+" : ""}${fmtNum((precioObjetivo / precioHoy - 1) * 100, 2, "%")} vs. hoy)` : ""}
                  </span>
                )}
              </div>
            </Seccion>
          )}

          {a.completo && a.flujos.length > 0 && (
            <Seccion titulo={e.variable ? "Distribuciones simuladas (cada 100 invertidos)" : "Próximos pagos (cada 100 nominales)"}>
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted">
                  <tr className="border-b border-ink-border">
                    <th className="py-1 text-left font-medium">Fecha</th>
                    <th className="py-1 text-right font-medium">Interés</th>
                    <th className="py-1 text-right font-medium">Capital</th>
                    <th className="py-1 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {a.flujos.slice(0, 8).map((f) => (
                    <tr key={f.fecha} className="border-b border-ink-border/50">
                      <td className="py-1">{fmtFecha(f.fecha)}</td>
                      <td className="py-1 text-right">{fmtNum(f.interes, 3)}</td>
                      <td className="py-1 text-right">{f.amortizacion ? fmtNum(f.amortizacion, 2) : "—"}</td>
                      <td className="py-1 text-right font-medium text-paper">{fmtNum(f.total, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.variable && (
                <p className="mb-1 text-[10px] text-muted">
                  Simulación: reparte el rendimiento estimado cada período y devuelve lo invertido al final. En la realidad las distribuciones varían con la producción e incluyen devolución de capital a lo largo de la vida del fideicomiso.
                </p>
              )}
              {a.flujos.length > 8 && <p className="mt-1 text-[10px] text-muted">y {a.flujos.length - 8} pagos más hasta {fmtFecha(e.vencimiento)}.</p>}
              {neto && (
                <p className="mt-2 text-[11px] text-muted">
                  Con {fmtMonto(10000, i.moneda)} invertidos hoy (incluye comisión de compra) cobrarías en total {fmtMonto(neto.totalACobrarNeto, i.moneda)} netos de costos{irpf ? " e IRPF" : ""}.
                </p>
              )}
            </Seccion>
          )}

          {i.notas && (
            <Seccion titulo="Datos para valuar">
              <p className="whitespace-pre-line text-xs leading-relaxed text-paper">{i.notas}</p>
            </Seccion>
          )}

          <p className="text-[10px] text-muted">
            Simulación orientativa con precios del vector BCU y los datos cargados del título. No constituye asesoramiento ni oferta de inversión.
          </p>
        </div>
      </div>
    </div>
  );
}
