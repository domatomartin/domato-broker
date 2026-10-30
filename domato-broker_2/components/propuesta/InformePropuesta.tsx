"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { MarcoImpresion, Titulo } from "@/components/InformeBono";
import { CobrosCarteraChart } from "@/components/BondCharts";
import { hoyIso } from "@/lib/bondMath";
import { AVISO_SIMULACION, fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import TextoIA from "@/components/TextoIA";
import { OBJETIVOS, RIESGOS, type MetricasCartera, type PerfilCliente } from "@/lib/propuesta";
import type { Costos } from "@/lib/costos";

// Paleta del informe: sobria, con un acento por tipo de instrumento.
const COLOR_GRUPO: Record<string, string> = {
  "Uruguay soberano": "#2563EB",
  Corporativos: "#7C3AED",
  Fideicomisos: "#0D9488",
  Exterior: "#D97706",
  Acciones: "#DB2777",
  Otros: "#94A3B8",
};
const SERIE = ["#1E3A5F", "#2563EB", "#60A5FA", "#0D9488", "#D97706", "#94A3B8"];
const VERDE = "#15803D";

/** Corrige erratas frecuentes en los nombres que publica la BVM. */
const limpiarNombre = (s: string) => s.replace(/\bGobal\b/g, "Global").replace(/\s+/g, " ").trim();

export default function InformePropuesta({
  cliente,
  asesor,
  perfil,
  metricas: m,
  analisis,
  costos,
  onClose,
}: {
  cliente: string;
  asesor: string;
  perfil: PerfilCliente;
  metricas: MetricasCartera;
  analisis: string;
  costos: Costos;
  onClose: () => void;
}) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    document.body.classList.add("informe-abierto");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("informe-abierto");
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  if (!montado) return null;

  const moneda = perfil.moneda === "UYU" && m.monedas.length === 1 ? m.monedas[0] : perfil.moneda;
  const hoy = hoyIso();
  const ref = `P-${hoy.replace(/-/g, "")}`;
  const ultimoVto = m.lineas.map((l) => l.item.vencimiento).filter(Boolean).sort().at(-1) ?? null;
  const validas = m.lineas.filter((l) => l.neto);
  const custodia = validas.reduce((s, l) => s + l.neto!.custodiaTotal, 0);
  const comCupones = validas.reduce((s, l) => s + l.neto!.comisionCupones, 0);
  const totalCostos = m.costosCompra + custodia + comCupones + m.irpfTotal;
  const conAnalisis = analisis.trim().length > 0;
  let n = 0;
  const sec = () => ++n;

  return createPortal(
    <div id="informe-root" className="fixed inset-0 z-[100] overflow-auto bg-ink print:bg-white">
      <div className="print:hidden sticky top-0 z-10 border-b border-ink-border bg-ink-panel/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Vista previa. Revisá los datos y el análisis antes de imprimir.</p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-bright">
              Imprimir / Guardar PDF
            </button>
            <button type="button" onClick={onClose} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Cerrar</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <article className="informe mx-auto my-6 w-[210mm] bg-white px-[16mm] py-[14mm] shadow-lg print:my-0 print:w-auto print:p-0 print:shadow-none text-paper">
          <MarcoImpresion
            pie={
              <>
                <span>Domato · Gestión patrimonial · Propuesta {ref}{cliente ? ` · ${cliente}` : ""}</span>
                <span>Documento confidencial · {fmtFecha(hoy)}</span>
              </>
            }
          >
            <div className="flex flex-col gap-7 text-[11.5px] leading-relaxed">
              {/* ─── Encabezado ─── */}
              <header className="flex items-end justify-between gap-6 border-b-[3px] border-[#1E3A5F] pb-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.jpg" alt="Domato" className="h-14 w-14 rounded-lg object-cover" />
                  <div className="leading-tight">
                    <p className="font-display text-xl">Domato</p>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted">Gestión patrimonial</p>
                  </div>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#2563EB]">Propuesta de inversión</p>
                  <p className="font-display text-[22px]">Cartera de renta fija</p>
                  <p className="mt-0.5 text-[10px] text-muted">Ref. {ref} · {fmtFecha(hoy)}</p>
                </div>
              </header>

              {/* ─── Datos del cliente ─── */}
              <section className="grid grid-cols-3 gap-x-6 gap-y-3 rounded-lg bg-[#F5F7FA] px-5 py-4">
                <Campo label="Preparado para" valor={cliente || "—"} />
                <Campo label="Asesor" valor={asesor || "—"} />
                <Campo label="Monto a invertir" valor={fmtMonto(perfil.monto, moneda)} />
                <Campo label="Perfil de riesgo" valor={RIESGOS[perfil.riesgo]} />
                <Campo label="Objetivo" valor={OBJETIVOS[perfil.objetivo]} />
                <Campo label="Horizonte máximo" valor={`${perfil.plazoMaxAnios} años`} />
              </section>

              {/* ─── Resumen ejecutivo ─── */}
              <section className="avoid-break">
                <Titulo n={sec()}>Resumen ejecutivo</Titulo>
                <p className="text-[12px] leading-[1.65] text-[#2B3240]">
                  Proponemos invertir <strong>{fmtMonto(m.inversionTotal, moneda)}</strong> en <strong>{m.lineas.length} instrumentos</strong> de
                  renta fija operados en la Bolsa de Valores de Montevideo. A precios de hoy, la cartera ofrece una{" "}
                  <strong>rentabilidad neta de costos e impuestos del {fmtNum(m.tirNeta, 2, "%")} anual</strong>, cobros por cupones de
                  aproximadamente <strong>{fmtMonto(m.interesAnual, moneda)} al año</strong> y un total a cobrar de{" "}
                  <strong>{fmtMonto(m.totalACobrarNeto, moneda)}</strong>
                  {ultimoVto ? ` hasta ${fmtFecha(ultimoVto)}` : ""}, manteniendo los bonos hasta su vencimiento.
                </p>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <Kpi label="Rentabilidad neta (TIR)" valor={fmtNum(m.tirNeta, 2, "%")} sub={`Bruta ${fmtNum(m.tirBruta, 2, "%")}`} acento />
                  <Kpi label="Inversión" valor={fmtMonto(m.inversionTotal, moneda)} sub={`${m.lineas.length} instrumentos`} />
                  <Kpi label="Cobro anual estimado" valor={fmtMonto(m.interesAnual, moneda)} sub="Cupones" />
                  <Kpi label="Ganancia neta" valor={fmtMonto(m.gananciaNeta, moneda)} sub={`+${fmtNum(m.gananciaNetaPct, 1, "%")} al vencimiento`} />
                </div>
              </section>

              {/* ─── Composición ─── */}
              <section>
                <Titulo n={sec()}>Composición propuesta</Titulo>
                <table className="w-full table-fixed text-[10.5px] tabular-nums">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[6%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#1E3A5F] text-[9px] uppercase tracking-[0.06em] text-white">
                      <th className="px-2 py-1.5 text-left font-semibold">Instrumento</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Peso</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Monto</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Precio</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Cupón</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Vence</th>
                      <th className="px-2 py-1.5 text-right font-semibold">TIR neta</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Dur.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.lineas.map((l, idx) => (
                      <tr key={l.item.isin} className={clsx("border-b border-[#E7E9EE]", idx % 2 === 1 && "bg-[#FAFBFC]")}>
                        <td className="px-2 py-2">
                          <p className="font-semibold leading-snug">{limpiarNombre(l.item.nombre)}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted">
                            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR_GRUPO[l.grupo] ?? "#94A3B8" }} />
                            {l.grupo} · {l.item.isin}
                          </p>
                        </td>
                        <td className="px-2 py-2">
                          <p className="font-medium">{fmtNum(l.item.peso, 1, "%")}</p>
                          <div className="mt-1 h-1 w-full rounded-full bg-[#E7E9EE]">
                            <div className="h-1 rounded-full bg-[#2563EB]" style={{ width: `${Math.min(100, l.item.peso)}%` }} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {fmtMonto(l.montoLocal, l.item.moneda)}
                          {l.fx !== 1 && <span className="block text-[9px] text-muted">≈ {fmtMonto(l.monto, moneda)}</span>}
                        </td>
                        <td className="px-2 py-2 text-right">{fmtNum(l.item.precio, 2)}</td>
                        <td className="px-2 py-2 text-right">{l.item.cupon ? fmtNum(l.item.cupon, 2, "%") : "—"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{fmtFecha(l.item.vencimiento)}</td>
                        <td className="px-2 py-2 text-right font-semibold" style={{ color: VERDE }}>{fmtNum(l.neto?.tirNeta, 2, "%")}</td>
                        <td className="px-2 py-2 text-right">{fmtNum(l.a.duration, 1)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#1E3A5F] font-semibold">
                      <td className="px-2 py-2">Total cartera</td>
                      <td className="px-2 py-2">{fmtNum(m.pesoTotal, 0, "%")}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{fmtMonto(m.lineas.reduce((s, l) => s + l.monto, 0), moneda)}</td>
                      <td colSpan={3}></td>
                      <td className="px-2 py-2 text-right" style={{ color: VERDE }}>{fmtNum(m.tirNeta, 2, "%")}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(m.duration, 1)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1.5 text-[9px] text-muted">Precio cada 100 de valor nominal. Duration en años. TIR neta de comisiones, custodia e IRPF.</p>
              </section>

              {/* ─── Diversificación ─── */}
              <section className="avoid-break">
                <Titulo n={sec()}>Diversificación</Titulo>
                <div className="grid grid-cols-3 gap-5">
                  <Distribucion titulo="Por tipo de instrumento" datos={m.porGrupo} colorDe={(c, i) => COLOR_GRUPO[c] ?? SERIE[i % SERIE.length]} />
                  <Distribucion titulo="Por plazo al vencimiento" datos={m.porPlazo} colorDe={(_, i) => SERIE[i % SERIE.length]} />
                  <div className="flex flex-col gap-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Riesgo de tasa y plazo</p>
                    <Linea label="Duration promedio" valor={fmtNum(m.duration, 2, " años")} />
                    <Linea label="Plazo promedio" valor={fmtNum(m.plazoPromedio, 1, " años")} />
                    <Linea label="Último vencimiento" valor={fmtFecha(ultimoVto)} />
                    <Linea label="Moneda" valor={m.monedas.join(" · ") || moneda} />
                  </div>
                </div>
              </section>

              {/* ─── Proyección de cobros ─── */}
              <section className="avoid-break">
                <Titulo n={sec()}>Proyección de cobros</Titulo>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-[#2B3240]">Cobros por año (netos)</p>
                    <BarrasAnuales datos={m.porAnio} />
                    <div className="mt-1 flex gap-4 text-[9px] text-muted">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#2563EB]" /> Intereses</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#1E3A5F]" /> Capital</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-[#2B3240]">Cobros acumulados frente a lo invertido</p>
                    <CobrosCarteraChart flujos={m.flujos} inversion={m.inversionTotal} moneda={m.monedas.length === 1 ? m.monedas[0] : null} />
                  </div>
                </div>
                <table className="mt-4 w-full text-[10px] tabular-nums">
                  <thead>
                    <tr className="border-b border-[#1E3A5F] text-[9px] uppercase tracking-[0.06em] text-muted">
                      <th className="py-1 text-left font-semibold">Año</th>
                      <th className="py-1 text-right font-semibold">Intereses netos</th>
                      <th className="py-1 text-right font-semibold">Capital</th>
                      <th className="py-1 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.porAnio.map((r) => (
                      <tr key={r.anio} className="border-b border-[#EEF0F3]">
                        <td className="py-[3px]">{r.anio}</td>
                        <td className="py-[3px] text-right">{fmtMonto(r.interes, moneda)}</td>
                        <td className="py-[3px] text-right">{r.capital ? fmtMonto(r.capital, moneda) : "—"}</td>
                        <td className="py-[3px] text-right font-semibold">{fmtMonto(r.interes + r.capital, moneda)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right">{fmtMonto(m.porAnio.reduce((s, r) => s + r.interes, 0), moneda)}</td>
                      <td className="py-1 text-right">{fmtMonto(m.porAnio.reduce((s, r) => s + r.capital, 0), moneda)}</td>
                      <td className="py-1 text-right">{fmtMonto(m.porAnio.reduce((s, r) => s + r.interes + r.capital, 0), moneda)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* ─── Análisis ─── */}
              {conAnalisis && (
                <section>
                  <Titulo n={sec()}>Análisis y fundamentos</Titulo>
                  <div className="text-[#2B3240]">
                    <TextoIA texto={analisis} compacto />
                  </div>
                </section>
              )}

              {/* ─── Costos ─── */}
              <section className="avoid-break">
                <Titulo n={sec()}>Costos e impuestos</Titulo>
                <table className="w-full text-[10.5px] tabular-nums">
                  <tbody>
                    <FilaCosto label={`Comisión de compra (${fmtNum(costos.comision_compra_pct, 2)}% + IVA)`} valor={fmtMonto(m.costosCompra, moneda, 2)} />
                    <FilaCosto label={`Custodia (${fmtNum(costos.custodia_anual_pct, 2)}% anual + IVA, hasta el vencimiento)`} valor={fmtMonto(custodia, moneda, 2)} />
                    <FilaCosto label="Comisión sobre cobro de cupones" valor={fmtMonto(comCupones, moneda, 2)} />
                    <FilaCosto label="IRPF retenido sobre intereses" valor={m.irpfTotal > 0 ? fmtMonto(m.irpfTotal, moneda, 2) : "Exonerado (deuda pública uruguaya)"} />
                    <tr className="border-t-2 border-[#1E3A5F] font-semibold">
                      <td className="py-1.5">Total de costos e impuestos</td>
                      <td className="py-1.5 text-right">{fmtMonto(totalCostos, moneda, 2)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-muted">Efecto en la rentabilidad anual</td>
                      <td className="py-1 text-right font-medium">
                        {m.tirBruta != null && m.tirNeta != null ? `−${fmtNum(m.tirBruta - m.tirNeta, 2)} puntos (de ${fmtNum(m.tirBruta, 2, "%")} a ${fmtNum(m.tirNeta, 2, "%")})` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* ─── Firma ─── */}
              <section className="avoid-break mt-4 grid grid-cols-2 gap-10">
                <div>
                  <div className="mt-8 border-t border-paper pt-1.5">
                    <p className="font-semibold">{asesor || "Asesor"}</p>
                    <p className="text-[10px] text-muted">Asesor de inversiones · Domato Gestión Patrimonial</p>
                  </div>
                </div>
                <div>
                  <div className="mt-8 border-t border-paper pt-1.5">
                    <p className="font-semibold">{cliente || "Cliente"}</p>
                    <p className="text-[10px] text-muted">Conformidad del cliente</p>
                  </div>
                </div>
              </section>

              {/* ─── Notas ─── */}
              <footer className="avoid-break rounded-lg bg-[#F5F7FA] px-4 py-3 text-[8.5px] leading-relaxed text-muted">
                <p>
                  <strong className="text-paper">Metodología.</strong> Precios del vector BCU publicado por la Bolsa de Valores de Montevideo al{" "}
                  {fmtFecha(hoy)}. TIR efectiva anual calculada sobre los flujos combinados de la cartera, netos de comisión de compra, custodia y
                  comisión sobre cupones según las tarifas vigentes (con IVA) y del IRPF retenido sobre cada pago de intereses. Supone cupón fijo,
                  capital al vencimiento y cupones no reinvertidos; en bonos que amortizan en cuotas el resultado es aproximado. Los precios de
                  ejecución pueden diferir de los utilizados.
                </p>
                <p className="mt-1.5">
                  <strong className="text-paper">Aviso.</strong> {AVISO_SIMULACION} Rendimientos proyectados no garantizan resultados futuros.
                  El análisis fue elaborado por el asesor con apoyo de herramientas de inteligencia artificial.
                </p>
              </footer>
            </div>
          </MarcoImpresion>
        </article>
      </div>
    </div>,
    document.body
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold text-paper">{valor}</p>
    </div>
  );
}

function Kpi({ label, valor, sub, acento }: { label: string; valor: string; sub?: string; acento?: boolean }) {
  return (
    <div className={clsx("kpi rounded-lg border px-3.5 py-3", acento ? "border-[#1E3A5F] bg-[#1E3A5F] text-white" : "border-[#E7E9EE] bg-white")}>
      <p className={clsx("text-[8.5px] font-semibold uppercase tracking-[0.1em]", acento ? "text-white/70" : "text-muted")}>{label}</p>
      <p className="mt-1 text-[19px] font-semibold leading-tight tabular-nums">{valor}</p>
      {sub && <p className={clsx("mt-0.5 text-[9px]", acento ? "text-white/70" : "text-muted")}>{sub}</p>}
    </div>
  );
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#EEF0F3] pb-1 text-[10.5px]">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-right">{valor}</span>
    </div>
  );
}

function FilaCosto({ label, valor }: { label: string; valor: string }) {
  return (
    <tr className="border-b border-[#EEF0F3]">
      <td className="py-1.5 text-[#2B3240]">{label}</td>
      <td className="py-1.5 text-right font-medium">{valor}</td>
    </tr>
  );
}

/** Lista con barra por ítem: más legible que una barra apilada cuando hay varias categorías. */
function Distribucion({
  titulo, datos, colorDe,
}: { titulo: string; datos: { clave: string; pct: number }[]; colorDe: (clave: string, i: number) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{titulo}</p>
      {datos.map((d, i) => (
        <div key={d.clave}>
          <div className="flex justify-between text-[10.5px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colorDe(d.clave, i) }} />
              {d.clave}
            </span>
            <span className="font-semibold tabular-nums">{fmtNum(d.pct, 0, "%")}</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-[#EEF0F3]">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, d.pct)}%`, background: colorDe(d.clave, i) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barras apiladas de intereses y capital por año (SVG, se imprime nítido). */
function BarrasAnuales({ datos }: { datos: { anio: string | number; interes: number; capital: number }[] }) {
  if (!datos.length) return null;
  const W = 320, H = 150, pad = { l: 34, r: 4, t: 8, b: 18 };
  const max = Math.max(...datos.map((d) => d.interes + d.capital), 1);
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  const ancho = (W - pad.l - pad.r) / datos.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / tope);
  const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const ticks = [0, tope / 2, tope];
  const cadaN = Math.ceil(datos.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cobros por año">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#EEF0F3" strokeWidth={0.8} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize={7.5} fill="#6E7684">{k(t)}</text>
        </g>
      ))}
      {datos.map((d, i) => {
        const x = pad.l + i * ancho + ancho * 0.18;
        const w = ancho * 0.64;
        return (
          <g key={d.anio}>
            <rect x={x} y={y(d.interes)} width={w} height={y(0) - y(d.interes)} fill="#2563EB" rx={1} />
            {d.capital > 0 && <rect x={x} y={y(d.interes + d.capital)} width={w} height={y(d.interes) - y(d.interes + d.capital)} fill="#1E3A5F" rx={1} />}
            {i % cadaN === 0 && (
              <text x={x + w / 2} y={H - 5} textAnchor="middle" fontSize={7.5} fill="#6E7684">{d.anio}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
