"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Panel } from "@/components/Card";
import { fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { analizarBono } from "@/lib/bondMath";
import { efectivo } from "@/lib/bvm";
import { irpfDe } from "@/lib/costos";
import { carteraLabel } from "@/lib/carteras";
import { aUSD } from "@/lib/fx";
import { useDatosCartera } from "@/lib/useDatosCartera";
import { posiciones } from "@/lib/estadoCuenta";

type Linea = {
  id: string;
  nombre: string;
  moneda: string;
  grupo: string;
  vn: number;
  precio: number;
  corrido: number;        // cada 100
  tirHoy: number | null;  // lo que rinde de acá al vencimiento si lo conserva
  invertido: number;      // costo de compra (en moneda del bono)
  cobrado: number;
  comisionPct: number;    // con IVA
  irpfPct: number;
};

function calcular(l: Linea, pct: number) {
  const vn = (l.vn * pct) / 100;
  const limpio = (vn * l.precio) / 100;
  const corrido = (vn * l.corrido) / 100;
  const bruto = limpio + corrido;
  const comision = (bruto * l.comisionPct) / 100;
  const irpf = (corrido * l.irpfPct) / 100;
  const neto = bruto - comision - irpf;
  const resultado = neto + (l.cobrado * pct) / 100 - (l.invertido * pct) / 100;
  return { vn, limpio, corrido, bruto, comision, irpf, neto, resultado };
}

function Contenido() {
  const params = useSearchParams();
  const datos = useDatosCartera();
  const [cuenta, setCuenta] = useState(params.get("cuenta") ?? "");
  const [pcts, setPcts] = useState<Record<string, number>>({});
  const [objetivo, setObjetivo] = useState("");
  const cuentaSel = cuenta || datos.cuentas[0] || "";

  const lineas: Linea[] = useMemo(() => {
    const bonds = datos.bonds.filter((b) => (b.cuenta ?? "").trim() === cuentaSel);
    const pos = posiciones(bonds, datos.costos, datos.instrumentos, datos.tasas, datos.fxPorPropuesta);
    const comisionPct = datos.costos.comision_venta_pct * (1 + datos.costos.iva_pct / 100);
    return pos.map((p) => {
      const ins = p.bond.isin ? datos.instrumentos.get(p.bond.isin) : undefined;
      const precio = p.bond.precio_actual || ins?.precio || p.bond.precio_compra;
      let corrido = 0, tirHoy: number | null = null;
      if (ins) {
        const e = efectivo(ins);
        const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.variable ? 100 : precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
        if (!e.variable) corrido = a.interesCorrido;
        tirHoy = a.tir;
      }
      return {
        id: p.bond.id, nombre: p.bond.nombre, moneda: p.bond.moneda, grupo: p.grupo, vn: p.vn, precio, corrido, tirHoy,
        invertido: p.invertido, cobrado: p.cobrado, comisionPct,
        irpfPct: irpfDe(datos.costos, { isin: p.bond.isin ?? "", especie: ins?.especie ?? null, irpf_manual: ins?.irpf_manual ?? null }),
      };
    });
  }, [datos, cuentaSel]);

  // Orden sugerido para vender: primero lo que menos rinde de acá en adelante.
  const orden = useMemo(() => [...lineas].sort((a, b) => (a.tirHoy ?? 99) - (b.tirHoy ?? 99)), [lineas]);
  const usd = (v: number, m: string) => (datos.tasas ? aUSD(v, m, datos.tasas) : v);

  function sugerir() {
    let falta = Number(objetivo.replace(/\./g, "").replace(",", "."));
    if (!(falta > 0)) return;
    const nuevo: Record<string, number> = {};
    for (const l of orden) {
      if (falta <= 0) break;
      const total = usd(calcular(l, 100).neto, l.moneda);
      if (total <= 0) continue;
      const pct = Math.min(100, Math.ceil((falta / total) * 100));
      nuevo[l.id] = pct;
      falta -= usd(calcular(l, pct).neto, l.moneda);
    }
    setPcts(nuevo);
  }

  const elegidas = lineas.filter((l) => (pcts[l.id] ?? 0) > 0).map((l) => ({ l, r: calcular(l, pcts[l.id]) }));
  const monedas = [...new Set(elegidas.map((x) => x.l.moneda))];
  const totales = monedas.map((m) => {
    const xs = elegidas.filter((x) => x.l.moneda === m);
    const sum = (k: keyof ReturnType<typeof calcular>) => xs.reduce((s, x) => s + x.r[k], 0);
    return { m, bruto: sum("bruto"), comision: sum("comision"), irpf: sum("irpf"), neto: sum("neto"), resultado: sum("resultado") };
  });
  const netoUSD = totales.reduce((s, t) => s + usd(t.neto, t.m), 0);
  const resultadoUSD = totales.reduce((s, t) => s + usd(t.resultado, t.m), 0);

  if (datos.cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-paper">Simular una venta</h1>
          <p className="text-sm text-muted mt-1">Cuánta plata recibe el cliente si vende hoy, ya descontada la comisión del corredor y el IRPF del cupón corrido.</p>
        </div>
        <select value={cuentaSel} onChange={(e) => { setCuenta(e.target.value); setPcts({}); }} className="rounded border border-ink-border bg-ink-panel px-3 py-2 text-sm text-paper">
          {datos.cuentas.map((c) => <option key={c} value={c}>{carteraLabel(c)}</option>)}
        </select>
      </div>

      <Panel title="¿Cuánto necesita?">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">Monto a juntar (USD eq.)
            <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} inputMode="decimal" placeholder="ej. 20000" className="block w-40 rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper" />
          </label>
          <button type="button" onClick={sugerir} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white">Sugerir qué vender</button>
          {elegidas.length > 0 && <button type="button" onClick={() => setPcts({})} className="text-sm text-muted underline">Limpiar</button>}
        </div>
        <p className="text-[11px] text-muted">Sugiere vender primero lo que menos rinde de acá al vencimiento, para que la cartera que queda siga rindiendo lo más posible.</p>
      </Panel>

      <Panel title="Títulos de la cartera">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted">
              <tr className="border-b border-ink-border">
                <th className="px-2 py-2 text-left font-medium">Título</th>
                <th className="px-2 py-2 text-right font-medium">Precio</th>
                <th className="px-2 py-2 text-right font-medium">TIR si lo conserva</th>
                <th className="px-2 py-2 text-right font-medium">Valor neto (100%)</th>
                <th className="px-2 py-2 text-right font-medium">Resultado si vende</th>
                <th className="px-2 py-2 text-center font-medium">% a vender</th>
              </tr>
            </thead>
            <tbody>
              {orden.map((l, k) => {
                const total = calcular(l, 100);
                const pct = pcts[l.id] ?? 0;
                return (
                  <tr key={l.id} className={clsx("border-b border-ink-border/50", pct > 0 && "bg-gold/5")}>
                    <td className="px-2 py-2">
                      <p className="text-paper">{l.nombre}</p>
                      <p className="text-[11px] text-muted">{l.moneda} · {l.grupo} · {fmtNum(l.vn, 0)} nominales{k === 0 ? " · conviene vender primero" : ""}</p>
                    </td>
                    <td className="px-2 py-2 text-right">{fmtNum(l.precio, 2)}<span className="block text-[10px] text-muted">+ corrido {fmtNum(l.corrido, 3)}</span></td>
                    <td className="px-2 py-2 text-right">{fmtNum(l.tirHoy, 2, "%")}</td>
                    <td className="px-2 py-2 text-right">{fmtMonto(total.neto, l.moneda)}</td>
                    <td className={clsx("px-2 py-2 text-right", total.resultado >= 0 ? "text-gain" : "text-loss")}>{total.resultado >= 0 ? "+" : ""}{fmtMonto(total.resultado, l.moneda)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPcts({ ...pcts, [l.id]: Number(e.target.value) })} className="w-24 accent-[#171A21]" aria-label={`Porcentaje a vender de ${l.nombre}`} />
                        <span className="w-10 text-right text-xs">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {elegidas.length > 0 && (
        <Panel title="Resultado de la venta">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gain/10 px-4 py-3"><p className="text-xs text-muted">Recibe (USD eq.)</p><p className="text-2xl font-semibold text-gain">{fmtMonto(netoUSD, "USD")}</p></div>
            <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">Resultado de lo vendido</p><p className={clsx("text-2xl font-semibold", resultadoUSD >= 0 ? "text-gain" : "text-loss")}>{resultadoUSD >= 0 ? "+" : ""}{fmtMonto(resultadoUSD, "USD")}</p><p className="text-[10px] text-muted">neto + cupones cobrados − lo invertido</p></div>
            <div className="rounded-xl bg-ink px-4 py-3"><p className="text-xs text-muted">Títulos que vende</p><p className="text-2xl font-semibold text-paper">{elegidas.length}</p></div>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted">
              <tr className="border-b border-ink-border">
                <th className="px-2 py-2 text-left font-medium">Moneda</th>
                <th className="px-2 py-2 text-right font-medium">Precio + corrido</th>
                <th className="px-2 py-2 text-right font-medium">Comisión</th>
                <th className="px-2 py-2 text-right font-medium">IRPF</th>
                <th className="px-2 py-2 text-right font-medium">Neto a cobrar</th>
              </tr>
            </thead>
            <tbody>
              {totales.map((t) => (
                <tr key={t.m} className="border-b border-ink-border/50">
                  <td className="px-2 py-2">{t.m}</td>
                  <td className="px-2 py-2 text-right">{fmtMonto(t.bruto, t.m, 2)}</td>
                  <td className="px-2 py-2 text-right text-loss">−{fmtMonto(t.comision, t.m, 2)}</td>
                  <td className="px-2 py-2 text-right text-loss">{t.irpf ? `−${fmtMonto(t.irpf, t.m, 2)}` : "—"}</td>
                  <td className="px-2 py-2 text-right font-semibold">{fmtMonto(t.neto, t.m, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted">
            Precio del vector BCU: la venta real se hace al precio que pague el mercado ese día, que puede ser menor si el título tiene poca liquidez.
            Comisión de venta {fmtNum(datos.costos.comision_venta_pct, 2)}% + IVA; IRPF sólo sobre el cupón corrido según el tipo de título.
            No incluye un posible impuesto sobre la ganancia de capital: consultalo con el contador si vende con ganancia.
          </p>
        </Panel>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">Cargando…</div>}><Contenido /></Suspense>;
}
