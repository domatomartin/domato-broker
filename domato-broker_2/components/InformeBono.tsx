"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { escalar, nominalParaMonto, type AnalisisBono } from "@/lib/bondMath";
import { efectivo, type Instrumento } from "@/lib/bvm";
import { AVISO_SIMULACION, fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { CobrosChart, SensibilidadChart } from "@/components/BondCharts";

export type BonoInforme = { i: Instrumento; a: AnalisisBono };

const FRECUENCIA: Record<number, string> = { 1: "Anual", 2: "Semestral", 4: "Trimestral", 12: "Mensual" };

function leer(clave: string) {
  try { return localStorage.getItem(clave) ?? ""; } catch { return ""; }
}
function guardar(clave: string, v: string) {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
}

function Titulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-paper border-b border-paper/80 pb-1 mb-3">
      <span className="text-muted">{String(n).padStart(2, "0")}</span>
      {children}
    </h3>
  );
}

function Par({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-ink-border text-[12px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-paper font-medium tabular-nums text-right">{value}</dd>
    </div>
  );
}

function Cifra({ label, value, sub, acento }: { label: string; value: string; sub?: string; acento?: boolean }) {
  return (
    <div className={clsx("rounded-lg px-3 py-2.5 border", acento ? "border-gain/40 bg-gain/10" : "border-ink-border bg-ink")}>
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={clsx("text-xl font-semibold tabular-nums leading-tight", acento ? "text-gain" : "text-paper")}>{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function SeccionBono({ b, monto, n0 }: { b: BonoInforme; monto: number; n0: number }) {
  const { i, a } = b;
  const e = efectivo(i);
  const vn = a.completo ? nominalParaMonto(a, monto) : 0;
  const m = a.completo ? escalar(a, vn) : null;
  const k = vn / 100;
  const real = ["UI", "UP", "UR"].includes(i.moneda);

  if (!a.completo || !m) {
    return (
      <section className="avoid-break">
        <Titulo n={n0}>{i.nombre}</Titulo>
        <p className="text-[12px] text-muted">Faltan datos para simular este instrumento: {a.faltan.join(", ")}.</p>
      </section>
    );
  }

  const cupon = a.flujos[0].interes * k;
  return (
    <>
      <section className="avoid-break">
        <Titulo n={n0}>Resumen</Titulo>
        <p className="text-[13px] leading-relaxed text-paper">
          Con una inversión de <strong>{fmtMonto(m.inversion, i.moneda)}</strong> en <strong>{i.nombre}</strong> al precio de{" "}
          {fmtNum(e.precio, 2)}, se adquieren {fmtNum(vn, 0)} de valor nominal.
          {e.letra
            ? ` Es una letra a descuento: no paga cupones y devuelve ${fmtMonto(vn, i.moneda)} el ${fmtFecha(e.vencimiento)}.`
            : ` Se cobrarían ${a.flujos.length} cupones ${FRECUENCIA[a.frecuencia]?.toLowerCase() ?? ""}es de ${fmtMonto(cupon, i.moneda, 2)} y el capital de ${fmtMonto(vn, i.moneda)} el ${fmtFecha(e.vencimiento)}.`}{" "}
          El total a cobrar sería <strong>{fmtMonto(m.totalACobrar, i.moneda)}</strong>, con una tasa interna de retorno del{" "}
          <strong>{fmtNum(a.tir, 2, "%")} anual</strong>{real ? ` real en ${i.moneda}` : ""} si se mantiene hasta el vencimiento.
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Cifra label={real ? `TIR real (${i.moneda})` : "TIR anual"} value={fmtNum(a.tir, 2, "%")} sub={`nominal ${fmtNum(a.tirNominal, 2, "%")}`} acento />
          <Cifra label="Inversión" value={fmtMonto(m.inversion, i.moneda)} sub={`VN ${fmtNum(vn, 0)}`} />
          <Cifra label="Total a cobrar" value={fmtMonto(m.totalACobrar, i.moneda)} sub={`intereses ${fmtMonto(m.totalIntereses, i.moneda)}`} />
          <Cifra label="Ganancia" value={fmtMonto(m.ganancia, i.moneda)} sub={`+${fmtNum(a.gananciaAlVencimiento, 1, "%")} sin reinvertir`} />
        </div>
      </section>

      <section className="avoid-break">
        <Titulo n={n0 + 1}>Ficha técnica</Titulo>
        <dl className="grid grid-cols-2 gap-x-8">
          <div>
            <Par label="Instrumento" value={i.nombre} />
            <Par label="ISIN" value={i.isin} />
            {i.codigo && <Par label="Código BVM" value={i.codigo} />}
            <Par label="Tipo" value={i.especie ?? "—"} />
            <Par label="Moneda" value={i.moneda} />
            <Par label="Cupón anual" value={e.letra ? "Sin cupón (a descuento)" : fmtNum(e.cupon, 3, "%")} />
            <Par label="Frecuencia de pago" value={e.letra ? "Al vencimiento" : FRECUENCIA[a.frecuencia] ?? `${a.frecuencia} por año`} />
            <Par label="Vencimiento" value={`${fmtFecha(e.vencimiento)} (${fmtNum(a.aniosAlVencimiento, 1)} años)`} />
          </div>
          <div>
            <Par label="Precio limpio" value={`${fmtNum(e.precio, 2)}${i.fecha_precio ? ` al ${fmtFecha(i.fecha_precio)}` : ""}`} />
            <Par label="Interés corrido" value={fmtNum(a.interesCorrido, 4)} />
            <Par label="Precio sucio" value={fmtNum(a.precioSucio, 4)} />
            <Par label="Rendimiento corriente" value={e.letra ? "—" : fmtNum(a.currentYield, 2, "%")} />
            <Par label="Duration (Macaulay)" value={fmtNum(a.duration, 2, " años")} />
            <Par label="Duration modificada" value={fmtNum(a.durationModificada, 2)} />
            <Par label="Convexidad" value={fmtNum(a.convexidad, 1)} />
            <Par label="Próximo pago" value={fmtFecha(a.proximoCupon)} />
          </div>
        </dl>
      </section>

      <section className="avoid-break">
        <Titulo n={n0 + 2}>Proyección</Titulo>
        <div className="grid grid-cols-[3fr_2fr] gap-6">
          <div>
            <p className="text-[11px] text-muted mb-1">Cobros acumulados frente a lo invertido ({i.moneda})</p>
            <CobrosChart a={a} k={k} moneda={i.moneda} />
          </div>
          <div>
            <p className="text-[11px] text-muted mb-2">Valor de la inversión si la tasa de mercado cambia hoy</p>
            <SensibilidadChart a={a} k={k} moneda={i.moneda} />
            <p className="mt-2 text-[10px] text-muted">Solo importa si se vende antes del vencimiento.</p>
          </div>
        </div>
      </section>

      <section className="break-before">
        <Titulo n={n0 + 3}>Calendario de pagos{" — "}<span className="normal-case tracking-normal font-normal text-muted">{i.nombre}</span></Titulo>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-muted border-b border-paper/60">
              <th className="text-left py-1 font-medium">#</th>
              <th className="text-left py-1 font-medium">Fecha</th>
              <th className="text-right py-1 font-medium">Interés</th>
              <th className="text-right py-1 font-medium">Capital</th>
              <th className="text-right py-1 font-medium">Total</th>
              <th className="text-right py-1 font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {m.flujos.reduce<{ filas: JSX.Element[]; acc: number }>(
              (r, f, idx) => {
                r.acc += f.total;
                r.filas.push(
                  <tr key={f.fecha} className="border-b border-ink-border avoid-break">
                    <td className="py-0.5 text-muted">{idx + 1}</td>
                    <td className="py-0.5">{fmtFecha(f.fecha)}</td>
                    <td className="py-0.5 text-right">{fmtMonto(f.interes, i.moneda, 2)}</td>
                    <td className="py-0.5 text-right">{f.amortizacion ? fmtMonto(f.amortizacion, i.moneda, 2) : "—"}</td>
                    <td className="py-0.5 text-right font-medium">{fmtMonto(f.total, i.moneda, 2)}</td>
                    <td className="py-0.5 text-right text-muted">{fmtMonto(r.acc, i.moneda, 0)}</td>
                  </tr>
                );
                return r;
              },
              { filas: [], acc: 0 }
            ).filas}
            <tr className="font-semibold">
              <td colSpan={2} className="py-1">Total</td>
              <td className="py-1 text-right">{fmtMonto(m.totalIntereses, i.moneda, 2)}</td>
              <td className="py-1 text-right">{fmtMonto(vn, i.moneda, 2)}</td>
              <td className="py-1 text-right">{fmtMonto(m.totalACobrar, i.moneda, 2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}

export default function InformeBono({ bonos, monto, onClose }: { bonos: BonoInforme[]; monto: number; onClose: () => void }) {
  const [montado, setMontado] = useState(false);
  const [cliente, setCliente] = useState("");
  const [asesor, setAsesor] = useState("");
  const [notas, setNotas] = useState("");
  const [montoTxt, setMontoTxt] = useState(String(monto));

  useEffect(() => {
    setMontado(true);
    setAsesor(leer("informe.asesor"));
    document.body.classList.add("informe-abierto");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("informe-abierto");
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  if (!montado) return null;

  const montoNum = Number(montoTxt.replace(/\./g, "").replace(",", ".")) || 0;
  const hoy = new Date().toISOString().slice(0, 10);
  const fechaPrecios = bonos.map((b) => b.i.fecha_precio).filter(Boolean).sort().at(-1) ?? null;
  const varios = bonos.length > 1;
  const mismaMoneda = new Set(bonos.map((b) => b.i.moneda)).size === 1;
  const titulo = varios ? "Comparación de alternativas de inversión" : "Propuesta de inversión";

  const input = "rounded border border-ink-border bg-white px-2 py-1 text-sm text-paper";

  return createPortal(
    <div id="informe-root" className="fixed inset-0 z-[100] overflow-auto bg-ink print:bg-white">
      {/* Barra de herramientas (no se imprime) */}
      <div className="print:hidden sticky top-0 z-10 border-b border-ink-border bg-ink-panel/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px] text-muted">Preparado para
            <input className={clsx(input, "w-48")} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
          </label>
          <label className="flex flex-col text-[11px] text-muted">Asesor
            <input className={clsx(input, "w-44")} value={asesor} onChange={(e) => { setAsesor(e.target.value); guardar("informe.asesor", e.target.value); }} placeholder="Tu nombre" />
          </label>
          <label className="flex flex-col text-[11px] text-muted">Monto
            <input className={clsx(input, "w-28")} value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} inputMode="decimal" />
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel hover:bg-gold-bright">
              Imprimir / Guardar PDF
            </button>
            <button type="button" onClick={onClose} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Cerrar</button>
          </div>
          <label className="flex w-full flex-col text-[11px] text-muted">Comentarios del asesor (opcional, se imprimen en el informe)
            <textarea className={clsx(input, "min-h-[56px]")} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: alternativa conservadora en dólares para el horizonte de 10 años del cliente." />
          </label>
        </div>
      </div>

      {/* Documento */}
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
            <p className="font-display text-xl leading-tight">{titulo}</p>
            <p className="text-[12px] text-muted">Fecha: {fmtFecha(hoy)}</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-4 text-[12px]">
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Preparado para</p><p className="font-medium">{cliente || "—"}</p></div>
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Asesor</p><p className="font-medium">{asesor || "—"}</p></div>
          <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted">Monto analizado</p><p className="font-medium">{fmtNum(montoNum, 0)} {varios && !mismaMoneda ? "(en la moneda de cada opción)" : bonos[0]?.i.moneda}</p></div>
        </div>

        {varios && (
          <section className="avoid-break">
            <Titulo n={1}>Comparación</Titulo>
            {!mismaMoneda && (
              <p className="mb-2 text-[11px] text-warn">Las alternativas están en monedas distintas, por lo que sus tasas no son directamente comparables.</p>
            )}
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="border-b border-paper/60 text-muted">
                  <th className="py-1 text-left font-medium"></th>
                  {bonos.map((b) => <th key={b.i.isin} className="py-1 px-2 text-left font-semibold text-paper">{b.i.nombre}<span className="block font-normal text-muted">{b.i.moneda}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {([
                  ["TIR anual", (b: BonoInforme) => fmtNum(b.a.tir, 2, "%")],
                  ["Cupón", (b: BonoInforme) => (efectivo(b.i).letra ? "Letra" : fmtNum(efectivo(b.i).cupon, 3, "%"))],
                  ["Vencimiento", (b: BonoInforme) => fmtFecha(efectivo(b.i).vencimiento)],
                  ["Duration", (b: BonoInforme) => fmtNum(b.a.duration, 2, " años")],
                  ["Precio", (b: BonoInforme) => fmtNum(efectivo(b.i).precio, 2)],
                  ["Interés por año", (b: BonoInforme) => (b.a.completo ? fmtMonto(escalar(b.a, nominalParaMonto(b.a, montoNum)).interesAnual, b.i.moneda) : "—")],
                  ["Total a cobrar", (b: BonoInforme) => (b.a.completo ? fmtMonto(escalar(b.a, nominalParaMonto(b.a, montoNum)).totalACobrar, b.i.moneda) : "—")],
                  ["Ganancia", (b: BonoInforme) => (b.a.completo ? `${fmtMonto(escalar(b.a, nominalParaMonto(b.a, montoNum)).ganancia, b.i.moneda)} (+${fmtNum(b.a.gananciaAlVencimiento, 1, "%")})` : "—")],
                ] as [string, (b: BonoInforme) => string][]).map(([l, fn]) => (
                  <tr key={l} className="border-b border-ink-border">
                    <td className="py-1 text-muted">{l}</td>
                    {bonos.map((b) => <td key={b.i.isin} className="py-1 px-2">{fn(b)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {bonos.map((b, idx) => (
          <div key={b.i.isin} className={clsx("flex flex-col gap-6", idx > 0 && "break-before")}>
            {varios && <p className="font-display text-base border-l-4 border-gain pl-2">{b.i.nombre}</p>}
            <SeccionBono b={b} monto={montoNum} n0={varios ? 2 : 1} />
          </div>
        ))}

        {notas.trim() && (
          <section className="avoid-break">
            <Titulo n={varios ? 6 : 5}>Comentarios del asesor</Titulo>
            <p className="whitespace-pre-line text-[12px] leading-relaxed">{notas}</p>
          </section>
        )}

        <footer className="avoid-break mt-2 border-t border-ink-border pt-3 text-[9.5px] leading-relaxed text-muted">
          <p>
            <strong className="text-paper">Metodología y fuentes.</strong> Precios del vector de precios BCU publicado por la Bolsa de Valores de Montevideo
            {fechaPrecios ? ` al ${fmtFecha(fechaPrecios)}` : ""}. TIR efectiva anual calculada sobre precio sucio, con cupón fijo y capital al vencimiento;
            en instrumentos que amortizan en cuotas el resultado es aproximado. Los importes no incluyen comisiones ni impuestos y suponen que los cupones no se reinvierten.
          </p>
          <p className="mt-1.5">
            <strong className="text-paper">Aviso.</strong> {AVISO_SIMULACION} Rendimientos pasados o proyectados no garantizan resultados futuros. Las tasas en UI o UP son reales y no incluyen inflación.
          </p>
          <p className="mt-1.5">Domato · Gestión patrimonial</p>
        </footer>
      </article>
    </div>,
    document.body
  );
}
