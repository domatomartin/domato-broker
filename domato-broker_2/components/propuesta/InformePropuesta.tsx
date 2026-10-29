"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Cifra, Par, Titulo } from "@/components/InformeBono";
import { CobrosCarteraChart } from "@/components/BondCharts";
import { AVISO_SIMULACION, fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import TextoIA from "@/components/TextoIA";
import { Barras } from "@/components/propuesta/ResumenCartera";
import { OBJETIVOS, RIESGOS, type MetricasCartera, type PerfilCliente } from "@/lib/propuesta";
import type { Costos } from "@/lib/costos";

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
  const hoy = new Date().toISOString().slice(0, 10);
  const ultimoVto = m.lineas.map((l) => l.item.vencimiento).filter(Boolean).sort().at(-1) ?? null;
  const validas = m.lineas.filter((l) => l.neto);
  const custodia = validas.reduce((s, l) => s + l.neto!.custodiaTotal, 0);
  const comCupones = validas.reduce((s, l) => s + l.neto!.comisionCupones, 0);

  return createPortal(
    <div id="informe-root" className="fixed inset-0 z-[100] overflow-auto bg-ink print:bg-white">
      <div className="print:hidden sticky top-0 z-10 border-b border-ink-border bg-ink-panel/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-[210mm] items-center gap-3">
          <p className="text-sm text-muted">Vista previa del informe. Revisá los datos y el análisis antes de imprimir.</p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel hover:bg-gold-bright">
              Imprimir / Guardar PDF
            </button>
            <button type="button" onClick={onClose} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Cerrar</button>
          </div>
        </div>
      </div>

      <article className="informe mx-auto my-6 max-w-[210mm] bg-white px-[14mm] py-[12mm] shadow-lg print:my-0 print:max-w-none print:p-0 print:shadow-none flex flex-col gap-6 text-paper">
        <header className="flex items-start justify-between gap-6 border-b-2 border-paper pb-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="Domato" className="h-12 w-12 rounded-lg object-cover" />
            <div className="leading-tight">
              <p className="font-display text-lg">Domato</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Gestión patrimonial</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xl leading-tight">Propuesta de cartera</p>
            <p className="text-[12px] text-muted">Fecha: {fmtFecha(hoy)}</p>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-4 text-[12px]">
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Preparado para</p><p className="font-medium">{cliente || "—"}</p></div>
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Asesor</p><p className="font-medium">{asesor || "—"}</p></div>
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Monto</p><p className="font-medium">{fmtMonto(perfil.monto, moneda)}</p></div>
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Perfil</p><p className="font-medium">{RIESGOS[perfil.riesgo]} · {OBJETIVOS[perfil.objetivo]} · hasta {perfil.plazoMaxAnios} años</p></div>
        </div>

        <section className="avoid-break">
          <Titulo n={1}>Resumen</Titulo>
          <p className="text-[13px] leading-relaxed">
            Proponemos invertir <strong>{fmtMonto(m.inversionTotal, moneda)}</strong> en <strong>{m.lineas.length} instrumentos</strong> de renta fija
            operados en la Bolsa de Valores de Montevideo, diversificados por tipo de emisor y plazo. Al precio de hoy, la cartera ofrece una
            <strong> tasa interna de retorno neta de costos del {fmtNum(m.tirNeta, 2, "%")} anual</strong>, un cobro estimado de{" "}
            {fmtMonto(m.interesAnual, moneda)} por año en cupones y un total a cobrar de <strong>{fmtMonto(m.totalACobrarNeto, moneda)}</strong>
            {ultimoVto ? ` hasta ${fmtFecha(ultimoVto)}` : ""}, si los bonos se mantienen al vencimiento.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Cifra label="TIR neta" value={fmtNum(m.tirNeta, 2, "%")} sub={`bruta ${fmtNum(m.tirBruta, 2, "%")}`} acento />
            <Cifra label="Inversión" value={fmtMonto(m.inversionTotal, moneda)} sub={`${m.lineas.length} bonos`} />
            <Cifra label="Cobro anual" value={fmtMonto(m.interesAnual, moneda)} sub="cupones estimados" />
            <Cifra label="Ganancia neta" value={fmtMonto(m.gananciaNeta, moneda)} sub={`+${fmtNum(m.gananciaNetaPct, 1, "%")} al vencimiento`} />
          </div>
        </section>

        <section className="avoid-break">
          <Titulo n={2}>Composición propuesta</Titulo>
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="border-b border-paper/60 text-muted">
                <th className="py-1 text-left font-medium">Instrumento</th>
                <th className="py-1 text-right font-medium">Peso</th>
                <th className="py-1 text-right font-medium">Monto</th>
                <th className="py-1 text-right font-medium">Precio</th>
                <th className="py-1 text-right font-medium">Cupón</th>
                <th className="py-1 text-right font-medium">Vence</th>
                <th className="py-1 text-right font-medium">TIR neta</th>
                <th className="py-1 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {m.lineas.map((l) => (
                <tr key={l.item.isin} className="border-b border-ink-border">
                  <td className="py-1 pr-2">
                    <span className="font-medium">{l.item.nombre}</span>
                    <span className="block text-[10px] text-muted">{l.item.isin} · {l.item.moneda} · {l.grupo}</span>
                  </td>
                  <td className="py-1 text-right">{fmtNum(l.item.peso, 1, "%")}</td>
                  <td className="py-1 text-right">{fmtMonto(l.montoLocal, l.item.moneda)}{l.fx !== 1 && <span className="block text-[10px] text-muted">≈ {fmtMonto(l.monto, moneda)}</span>}</td>
                  <td className="py-1 text-right">{fmtNum(l.item.precio, 2)}</td>
                  <td className="py-1 text-right">{l.item.cupon ? fmtNum(l.item.cupon, 3, "%") : "—"}</td>
                  <td className="py-1 text-right">{fmtFecha(l.item.vencimiento)}</td>
                  <td className="py-1 text-right font-semibold text-gain">{fmtNum(l.neto?.tirNeta, 2, "%")}</td>
                  <td className="py-1 text-right">{fmtNum(l.a.duration, 1)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1">Total cartera</td>
                <td className="py-1 text-right">{fmtNum(m.pesoTotal, 0, "%")}</td>
                <td className="py-1 text-right">{fmtMonto(m.lineas.reduce((s, l) => s + l.monto, 0), moneda)}</td>
                <td colSpan={3}></td>
                <td className="py-1 text-right text-gain">{fmtNum(m.tirNeta, 2, "%")}</td>
                <td className="py-1 text-right">{fmtNum(m.duration, 1)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="avoid-break">
          <Titulo n={3}>Diversificación y proyección</Titulo>
          <div className="grid grid-cols-[3fr_2fr] gap-6">
            <div>
              <p className="mb-1 text-[11px] text-muted">Cobros acumulados de la cartera frente a lo invertido (netos)</p>
              <CobrosCarteraChart flujos={m.flujos} inversion={m.inversionTotal} moneda={m.monedas.length === 1 ? m.monedas[0] : null} />
            </div>
            <div className="flex flex-col gap-4">
              <Barras titulo="Por tipo de instrumento" datos={m.porGrupo} />
              <Barras titulo="Por plazo" datos={m.porPlazo} />
              <dl>
                <Par label="Duration promedio" value={fmtNum(m.duration, 2, " años")} />
                <Par label="Plazo promedio" value={fmtNum(m.plazoPromedio, 1, " años")} />
              </dl>
            </div>
          </div>
        </section>

        {analisis.trim() && (
          <section className="avoid-break">
            <Titulo n={4}>Análisis y fundamentos</Titulo>
            <TextoIA texto={analisis} compacto />
          </section>
        )}

        <section className="avoid-break">
          <Titulo n={analisis.trim() ? 5 : 4}>Cobros estimados por año</Titulo>
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="border-b border-paper/60 text-muted">
                <th className="py-1 text-left font-medium">Año</th>
                <th className="py-1 text-right font-medium">Intereses (netos)</th>
                <th className="py-1 text-right font-medium">Capital</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {m.porAnio.map((r) => (
                <tr key={r.anio} className="border-b border-ink-border">
                  <td className="py-0.5">{r.anio}</td>
                  <td className="py-0.5 text-right">{fmtMonto(r.interes, moneda)}</td>
                  <td className="py-0.5 text-right">{r.capital ? fmtMonto(r.capital, moneda) : "—"}</td>
                  <td className="py-0.5 text-right font-medium">{fmtMonto(r.interes + r.capital, moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="avoid-break">
          <Titulo n={analisis.trim() ? 6 : 5}>Costos del corredor</Titulo>
          <dl className="grid grid-cols-2 gap-x-8">
            <div>
              <Par label={`Comisión de compra (${fmtNum(costos.comision_compra_pct, 2)}% + IVA)`} value={fmtMonto(m.costosCompra, moneda, 2)} />
              <Par label={`Custodia (${fmtNum(costos.custodia_anual_pct, 2)}% anual + IVA)`} value={fmtMonto(custodia, moneda, 2)} />
            </div>
            <div>
              <Par label="Comisión sobre cupones" value={fmtMonto(comCupones, moneda, 2)} />
              <Par label="Efecto en la TIR" value={m.tirBruta != null && m.tirNeta != null ? `−${fmtNum(m.tirBruta - m.tirNeta, 2)} puntos` : "—"} />
            </div>
          </dl>
        </section>

        <footer className="avoid-break mt-2 border-t border-ink-border pt-3 text-[9.5px] leading-relaxed text-muted">
          <p>
            <strong className="text-paper">Metodología.</strong> Precios del vector de precios BCU publicado por la Bolsa de Valores de Montevideo. TIR efectiva anual
            calculada sobre los flujos combinados de la cartera, netos de comisión de compra, custodia y comisión sobre cupones según las tarifas
            configuradas (con IVA). Supone cupón fijo, capital al vencimiento y cupones no reinvertidos; en bonos que amortizan en cuotas el resultado es aproximado.
            Los precios de ejecución pueden diferir de los aquí utilizados. El análisis fue elaborado por el asesor con apoyo de herramientas de inteligencia artificial.
          </p>
          <p className="mt-1.5"><strong className="text-paper">Aviso.</strong> {AVISO_SIMULACION} Rendimientos proyectados no garantizan resultados futuros.</p>
          <p className="mt-1.5">Domato · Gestión patrimonial</p>
        </footer>
      </article>
    </div>,
    document.body
  );
}
