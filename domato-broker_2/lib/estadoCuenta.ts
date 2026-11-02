// Estado de cuenta, calendario de cobros y constancia de IRPF de una cartera.
// Todo se calcula desde los bonos registrados (precio y fecha de compra) con los costos del corredor.

import { analizarBono, hoyIso } from "@/lib/bondMath";
import { aplicarCostos, irpfDe, type Costos } from "@/lib/costos";
import { grupoDe, type Grupo, type Instrumento } from "@/lib/bvm";
import { aUSD, type TasasFx } from "@/lib/fx";
import type { Bond } from "@/lib/types";

export type BondConPropuesta = Bond & { propuesta_id?: string | null };

/** Un cobro (cupón y/o capital) de un bono, ya neto de comisión sobre cupones e IRPF. */
export type Cobro = {
  fecha: string;
  bondId: string;
  nombre: string;
  isin: string | null;
  moneda: string;
  grupo: Grupo;
  interesBruto: number;
  comision: number;
  irpf: number;
  irpfPct: number;
  custodia: number;       // custodia del período (el corredor la debita de la cuenta)
  interesNeto: number;    // interés − comisión − IRPF
  capital: number;
  total: number; // interés neto − custodia + capital
};

export type Posicion = {
  bond: BondConPropuesta;
  grupo: Grupo;
  vn: number;
  invertido: number;      // con comisión de compra, en moneda del bono
  valorHoy: number;       // precio sucio actual × VN
  interesCorrido: number;
  cobrado: number;        // cobros netos desde la compra hasta la fecha de corte
  resultado: number;      // valorHoy + cobrado − invertido
  tirCompra: number | null;
  fxCompra: number;       // valor de 1 unidad en USD al comprar
  fxHoy: number;          // valor de 1 unidad en USD hoy
};

const mesDe = (iso: string) => iso.slice(0, 7);

function datosBono(b: Bond) {
  return { cupon: b.cupon, frecuencia: b.frecuencia ?? 2, vencimiento: b.proximo_vencimiento };
}

/** Todos los cobros de un bono desde su compra hasta el vencimiento. */
export function cobrosDeBono(b: BondConPropuesta, costos: Costos, ins?: Instrumento | null): Cobro[] {
  const fechaCompra = (b.fecha_compra ?? b.created_at ?? hoyIso()).slice(0, 10);
  const a = analizarBono({ ...datosBono(b), precio: b.precio_compra || 100 }, fechaCompra);
  if (!a.completo) return [];
  const vn = b.valor_nominal * (b.cantidad || 1);
  const irpfPct = irpfDe(costos, { isin: b.isin ?? "", especie: ins?.especie ?? null, irpf_manual: ins?.irpf_manual ?? null });
  const neto = aplicarCostos(a, vn, costos, irpfPct);
  if (!neto) return [];
  const grupo = grupoDe({ isin: b.isin ?? "", especie: ins?.especie ?? null } as Instrumento);
  return neto.flujosNetos.map((f) => {
    const comision = f.interes * (costos.comision_cupon_pct / 100) * (1 + costos.iva_pct / 100);
    const custodia = Math.max(0, f.costos - comision);
    const interesNeto = f.interes - comision - f.irpf;
    return {
      fecha: f.fecha, bondId: b.id, nombre: b.nombre, isin: b.isin, moneda: b.moneda, grupo,
      interesBruto: f.interes, comision, irpf: f.irpf, irpfPct, custodia, interesNeto,
      capital: f.amortizacion, total: interesNeto - custodia + f.amortizacion,
    };
  });
}

export function cobrosDeCartera(bonds: BondConPropuesta[], costos: Costos, instrumentos: Map<string, Instrumento>): Cobro[] {
  return bonds
    .filter((b) => b.estado === "activo" || b.estado === "vencido")
    .flatMap((b) => cobrosDeBono(b, costos, b.isin ? instrumentos.get(b.isin) : null))
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.nombre.localeCompare(y.nombre));
}

/** Posiciones valuadas al día, con resultado y datos de tipo de cambio. */
export function posiciones(
  bonds: BondConPropuesta[],
  costos: Costos,
  instrumentos: Map<string, Instrumento>,
  tasas: TasasFx | null,
  fxCompraPorPropuesta: Record<string, Record<string, number>>,
  corte: string = hoyIso(),
): Posicion[] {
  return bonds
    .filter((b) => b.estado === "activo")
    .map((b) => {
      const ins = b.isin ? instrumentos.get(b.isin) : null;
      const vn = b.valor_nominal * (b.cantidad || 1);
      const fechaCompra = (b.fecha_compra ?? b.created_at ?? corte).slice(0, 10);
      const aC = analizarBono({ ...datosBono(b), precio: b.precio_compra || 100 }, fechaCompra);
      const irpfPct = irpfDe(costos, { isin: b.isin ?? "", especie: ins?.especie ?? null, irpf_manual: ins?.irpf_manual ?? null });
      const netoC = aC.completo ? aplicarCostos(aC, vn, costos, irpfPct) : null;
      const invertido = netoC?.inversionTotal ?? (b.precio_compra / 100) * vn;
      const aH = analizarBono({ ...datosBono(b), precio: b.precio_actual || b.precio_compra }, corte);
      const interesCorrido = aH.completo ? (aH.interesCorrido * vn) / 100 : 0;
      const valorHoy = ((b.precio_actual || b.precio_compra) / 100) * vn + interesCorrido;
      const cobrado = cobrosDeBono(b, costos, ins).filter((c) => c.fecha <= corte).reduce((s, c) => s + c.total, 0);
      // Tipo de cambio de compra: el fijado en la propuesta (en moneda del cliente) se pasa a USD.
      const fxProp = b.propuesta_id ? fxCompraPorPropuesta[b.propuesta_id] : undefined;
      const fxHoy = tasas ? aUSD(1, b.moneda, tasas) : 1;
      let fxCompra = fxHoy;
      if (fxProp?.[b.moneda] != null && tasas) {
        const base = Object.entries(fxProp).find(([, v]) => v === 1)?.[0] ?? "USD";
        fxCompra = fxProp[b.moneda] * aUSD(1, base, tasas);
      }
      return {
        bond: b, grupo: grupoDe({ isin: b.isin ?? "", especie: ins?.especie ?? null } as Instrumento),
        vn, invertido, valorHoy, interesCorrido, cobrado,
        resultado: valorHoy + cobrado - invertido,
        tirCompra: netoC?.tirNeta ?? null, fxCompra, fxHoy,
      };
    });
}

export type ResumenEstado = {
  invertidoUSD: number;
  valorUSD: number;
  cobradoUSD: number;
  resultadoUSD: number;
  efectoPrecioUSD: number;
  efectoCambioUSD: number;
  porMoneda: { moneda: string; invertido: number; valor: number; cobrado: number; resultado: number; pctCartera: number }[];
  porGrupo: { clave: string; pct: number }[];
};

export function resumen(pos: Posicion[]): ResumenEstado {
  const invertidoUSD = pos.reduce((s, p) => s + p.invertido * p.fxCompra, 0);
  const valorUSD = pos.reduce((s, p) => s + p.valorHoy * p.fxHoy, 0);
  const cobradoUSD = pos.reduce((s, p) => s + p.cobrado * p.fxHoy, 0);
  const resultadoUSD = valorUSD + cobradoUSD - invertidoUSD;
  const efectoPrecioUSD = pos.reduce((s, p) => s + p.resultado * p.fxCompra, 0);
  const monedas = [...new Set(pos.map((p) => p.bond.moneda))];
  const porMoneda = monedas.map((m) => {
    const ps = pos.filter((p) => p.bond.moneda === m);
    const valor = ps.reduce((s, p) => s + p.valorHoy, 0);
    return {
      moneda: m,
      invertido: ps.reduce((s, p) => s + p.invertido, 0),
      valor,
      cobrado: ps.reduce((s, p) => s + p.cobrado, 0),
      resultado: ps.reduce((s, p) => s + p.resultado, 0),
      pctCartera: valorUSD > 0 ? (ps.reduce((s, p) => s + p.valorHoy * p.fxHoy, 0) / valorUSD) * 100 : 0,
    };
  });
  const g = new Map<string, number>();
  for (const p of pos) g.set(p.grupo, (g.get(p.grupo) ?? 0) + p.valorHoy * p.fxHoy);
  const porGrupo = [...g.entries()].map(([clave, v]) => ({ clave, pct: valorUSD > 0 ? (v / valorUSD) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  return { invertidoUSD, valorUSD, cobradoUSD, resultadoUSD, efectoPrecioUSD, efectoCambioUSD: resultadoUSD - efectoPrecioUSD, porMoneda, porGrupo };
}

/** Cobros agrupados por mes (YYYY-MM) y moneda. */
export function calendarioMensual(cobros: Cobro[], desde: string, meses: number) {
  const inicio = new Date(desde.slice(0, 7) + "-01T00:00:00");
  const lista: { mes: string; cobros: Cobro[]; porMoneda: Record<string, { interes: number; capital: number }> }[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cs = cobros.filter((c) => mesDe(c.fecha) === mes);
    const porMoneda: Record<string, { interes: number; capital: number }> = {};
    for (const c of cs) {
      porMoneda[c.moneda] ??= { interes: 0, capital: 0 };
      porMoneda[c.moneda].interes += c.interesNeto;
      porMoneda[c.moneda].capital += c.capital;
    }
    lista.push({ mes, cobros: cs, porMoneda });
  }
  return lista;
}

export const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
export const mesLargo = (ym: string) => `${NOMBRE_MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
