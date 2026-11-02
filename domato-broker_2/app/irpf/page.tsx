"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel } from "@/components/Card";
import { Titulo } from "@/components/InformeBono";
import DocumentoA4, { CampoDoc, EncabezadoDoc, KpiDoc } from "@/components/DocumentoA4";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { aUSD } from "@/lib/fx";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { cobrosDeCartera, type Cobro } from "@/lib/estadoCuenta";

type FilaTitulo = { nombre: string; isin: string | null; moneda: string; grupo: string; tasa: number; bruto: number; irpf: number; neto: number; cobros: number };

function Contenido() {
  const params = useSearchParams();
  const datos = useDatosCartera();
  const hoy = hoyIso();
  const anioActual = Number(hoy.slice(0, 4));
  const [cuenta, setCuenta] = useState<string>(params.get("cuenta") ?? "");
  const [anio, setAnio] = useState(anioActual);
  const [abierto, setAbierto] = useState(false);

  const cuentaSel = cuenta || datos.cuentas[0] || "";
  const bonds = useMemo(() => datos.bonds.filter((b) => (b.cuenta ?? "").trim() === cuentaSel), [datos.bonds, cuentaSel]);
  const cobros: Cobro[] = useMemo(
    () => cobrosDeCartera(bonds, datos.costos, datos.instrumentos).filter((c) => c.fecha.startsWith(String(anio)) && c.fecha <= hoy && c.interesBruto > 0),
    [bonds, datos, anio, hoy]
  );
  const filas: FilaTitulo[] = useMemo(() => {
    const m = new Map<string, FilaTitulo>();
    for (const c of cobros) {
      const k = c.bondId;
      const f = m.get(k) ?? { nombre: c.nombre, isin: c.isin, moneda: c.moneda, grupo: c.grupo, tasa: c.irpfPct, bruto: 0, irpf: 0, neto: 0, cobros: 0 };
      f.bruto += c.interesBruto; f.irpf += c.irpf; f.neto += c.interesBruto - c.irpf; f.cobros += 1;
      m.set(k, f);
    }
    return [...m.values()].sort((a, b) => a.moneda.localeCompare(b.moneda) || a.nombre.localeCompare(b.nombre));
  }, [cobros]);
  const monedas = [...new Set(filas.map((f) => f.moneda))];
  const porMoneda = monedas.map((m) => {
    const fs = filas.filter((f) => f.moneda === m);
    return { m, bruto: fs.reduce((s, f) => s + f.bruto, 0), irpf: fs.reduce((s, f) => s + f.irpf, 0), neto: fs.reduce((s, f) => s + f.neto, 0) };
  });
  const usd = (v: number, m: string) => (datos.tasas ? aUSD(v, m, datos.tasas) : v);
  const brutoUSD = porMoneda.reduce((s, x) => s + usd(x.bruto, x.m), 0);
  const irpfUSD = porMoneda.reduce((s, x) => s + usd(x.irpf, x.m), 0);
  const prop = datos.propuestas.find((p) => (p.cuenta ?? "").trim() === cuentaSel);
  const cliente = prop?.cliente || carteraLabel(cuentaSel);
  const parcial = anio === anioActual;

  if (datos.cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  const tabla = (doc: boolean) => (
    <table className={doc ? "w-full text-[10px] tabular-nums" : "w-full text-xs tabular-nums"}>
      <thead>
        <tr className={doc ? "bg-[#1E3A5F] text-[8.5px] uppercase tracking-[0.05em] text-white" : "border-b border-ink-border text-muted"}>
          <th className="px-2 py-1.5 text-left font-semibold">Título</th>
          <th className="px-2 py-1.5 text-center font-semibold">Cobros</th>
          <th className="px-2 py-1.5 text-right font-semibold">Intereses</th>
          <th className="px-2 py-1.5 text-center font-semibold">Tasa IRPF</th>
          <th className="px-2 py-1.5 text-right font-semibold">IRPF retenido</th>
          <th className="px-2 py-1.5 text-right font-semibold">Neto de IRPF</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={(f.isin ?? f.nombre) + f.moneda} className="border-b border-[#EEF0F3]">
            <td className="px-2 py-1.5">
              <p className="font-medium">{f.nombre}</p>
              <p className="text-[9px] text-muted">{f.isin} · {f.grupo} · {f.moneda}</p>
            </td>
            <td className="px-2 py-1.5 text-center">{f.cobros}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtMonto(f.bruto, f.moneda, 2)}</td>
            <td className="px-2 py-1.5 text-center">{f.tasa ? `${fmtNum(f.tasa, 0)}%` : "Exonerado"}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{f.irpf ? fmtMonto(f.irpf, f.moneda, 2) : "—"}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">{fmtMonto(f.neto, f.moneda, 2)}</td>
          </tr>
        ))}
        {porMoneda.map((x) => (
          <tr key={x.m} className="border-t-2 border-[#1E3A5F]/40 font-semibold">
            <td className="px-2 py-1.5">Total en {x.m}</td><td />
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtMonto(x.bruto, x.m, 2)}</td><td />
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtMonto(x.irpf, x.m, 2)}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtMonto(x.neto, x.m, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-paper">Constancia de IRPF</h1>
          <p className="text-sm text-muted mt-1">Intereses cobrados y retenciones de IRPF del año, por título, para la declaración del cliente.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={cuentaSel} onChange={(e) => setCuenta(e.target.value)} className="rounded border border-ink-border bg-ink-panel px-3 py-2 text-sm text-paper">
            {datos.cuentas.map((c) => <option key={c} value={c}>{carteraLabel(c)}</option>)}
          </select>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="rounded border border-ink-border bg-ink-panel px-3 py-2 text-sm text-paper">
            {[anioActual, anioActual - 1, anioActual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" onClick={() => setAbierto(true)} disabled={!filas.length} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Ver constancia</button>
        </div>
      </div>

      <Panel title={`${cliente} · ${anio}${parcial ? " (hasta hoy)" : ""}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">Intereses cobrados (USD eq.)</p><p className="text-xl font-semibold tabular-nums">{fmtMonto(brutoUSD, "USD")}</p></div>
          <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">IRPF retenido (USD eq.)</p><p className="text-xl font-semibold tabular-nums">{fmtMonto(irpfUSD, "USD")}</p></div>
          <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">Títulos con intereses</p><p className="text-xl font-semibold tabular-nums">{filas.length}</p></div>
        </div>
        {filas.length ? <div className="overflow-x-auto">{tabla(false)}</div> : <p className="text-sm text-muted">No hubo cobros de intereses en {anio} para esta cartera.</p>}
      </Panel>

      {abierto && (
        <DocumentoA4
          onClose={() => setAbierto(false)}
          pie={<><span>Domato · Gestión patrimonial · Constancia IRPF {anio} · {cliente}</span><span>Emitido {fmtFecha(hoy)}</span></>}
        >
          <EncabezadoDoc eyebrow="Constancia de retenciones" titulo={`IRPF ${anio}`} sub={parcial ? `Período 01/01/${anio} al ${fmtFecha(hoy)}` : `Período 01/01/${anio} al 31/12/${anio}`} />
          <section className="grid grid-cols-3 gap-x-6 gap-y-3 rounded-lg bg-[#F5F7FA] px-5 py-4">
            <CampoDoc label="Titular" valor={cliente} />
            <CampoDoc label="Cartera" valor={carteraLabel(cuentaSel)} />
            <CampoDoc label="Agente de retención" valor="BCE&M (corredor)" />
          </section>
          <section className="avoid-break">
            <Titulo n={1}>Resumen</Titulo>
            <div className="grid grid-cols-3 gap-3">
              <KpiDoc label="Intereses cobrados" valor={fmtMonto(brutoUSD, "USD")} sub="equivalente en dólares" acento />
              <KpiDoc label="IRPF retenido" valor={fmtMonto(irpfUSD, "USD")} sub="equivalente en dólares" />
              <KpiDoc label="Neto de IRPF" valor={fmtMonto(brutoUSD - irpfUSD, "USD")} />
            </div>
          </section>
          <section>
            <Titulo n={2}>Detalle por título</Titulo>
            {tabla(true)}
          </section>
          <footer className="avoid-break rounded-lg bg-[#F5F7FA] px-4 py-3 text-[8.5px] leading-relaxed text-muted">
            <p>
              <strong className="text-paper">Criterio.</strong> IRPF categoría capital (rendimientos de capital mobiliario) retenido sobre cada pago de intereses:
              deuda pública uruguaya exonerada (Título 7, art. 27, lit. A); obligaciones y fideicomisos locales con cotización bursátil y plazo mayor a 3 años 7%;
              intereses de fuente extranjera 12%. Se aplica la tasa propia del título cuando fue cargada.
              Importes en la moneda de cada título; para la declaración, los intereses en moneda extranjera o UI se convierten a pesos al tipo de cambio de cada fecha de cobro.
            </p>
            <p className="mt-1.5">
              <strong className="text-paper">Aviso.</strong> Documento informativo elaborado a partir del calendario de pagos de cada título y las tasas configuradas.
              No sustituye el certificado de retenciones que emite el agente de retención ni el asesoramiento de un contador.
            </p>
          </footer>
        </DocumentoA4>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">Cargando…</div>}><Contenido /></Suspense>;
}
