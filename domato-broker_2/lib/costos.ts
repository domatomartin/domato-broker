

import { tirDeFlujos, type AnalisisBono } from "@/lib/bondMath";
import { grupoDe, type Instrumento } from "@/lib/bvm";

/** Costos del corredor. Porcentajes en %, sin IVA (el IVA se aplica aparte). */
export type Costos = {
  comision_compra_pct: number;   // sobre el monto operado
  comision_venta_pct: number;    // por si se vende antes (no se usa al vencimiento)
  custodia_anual_pct: number;    // sobre el valor de la tenencia, por año
  comision_cupon_pct: number;    // sobre cada cupón cobrado
  gasto_fijo: number;            // por operación de compra, en la moneda del bono
  iva_pct: number;               // IVA sobre comisiones y custodia
  // IRPF (persona física residente) retenido sobre cada pago de intereses.
  irpf_soberano_pct: number;     // deuda pública uruguaya: exonerada (art. 27 T7, lit. A)
  irpf_privado_pct: number;      // ON y fideicomisos locales > 3 años con cotización: 7%
  irpf_exterior_pct: number;     // intereses de fuente extranjera: 12%
};

export const COSTOS_DEFECTO: Costos = {
  comision_compra_pct: 0.5,
  comision_venta_pct: 0.5,
  custodia_anual_pct: 0.25,
  comision_cupon_pct: 0,
  gasto_fijo: 0,
  iva_pct: 22,
  irpf_soberano_pct: 0,
  irpf_privado_pct: 7,
  irpf_exterior_pct: 12,
};

export const ETIQUETAS_COSTOS: Record<keyof Costos, string> = {
  comision_compra_pct: "Comisión de compra (%)",
  comision_venta_pct: "Comisión de venta (%)",
  custodia_anual_pct: "Custodia anual (%)",
  comision_cupon_pct: "Comisión sobre cupones (%)",
  gasto_fijo: "Gasto fijo por compra",
  iva_pct: "IVA sobre comisiones (%)",
  irpf_soberano_pct: "IRPF deuda pública uruguaya (%)",
  irpf_privado_pct: "IRPF ON y fideicomisos locales (%)",
  irpf_exterior_pct: "IRPF bonos del exterior (%)",
};

/** Tasa de IRPF sobre intereses para un instrumento: la propia del bono si se cargó, si no la de su tipo. */
export function irpfDe(c: Costos, i: { isin: string; especie: string | null; irpf_manual?: number | null }): number {
  if (i.irpf_manual != null && isFinite(Number(i.irpf_manual))) return Number(i.irpf_manual);
  const g = grupoDe(i as Instrumento);
  if (g === "Uruguay soberano") return c.irpf_soberano_pct;
  if (g === "Exterior") return c.irpf_exterior_pct;
  return c.irpf_privado_pct;
}

export function normalizarCostos(c: Partial<Costos> | null | undefined): Costos {
  const r = { ...COSTOS_DEFECTO };
  if (c) for (const k of Object.keys(r) as (keyof Costos)[]) if (c[k] != null && isFinite(Number(c[k]))) r[k] = Number(c[k]);
  return r;
}

export type ResultadoNeto = {
  inversionBruta: number;     // precio sucio × nominal
  costoCompra: number;        // comisión + IVA + gasto fijo
  inversionTotal: number;     // lo que sale del bolsillo
  custodiaTotal: number;      // custodia + IVA hasta el vencimiento
  comisionCupones: number;    // comisión + IVA sobre cupones
  irpfTotal: number;          // IRPF retenido sobre intereses
  irpfPct: number;
  costosTotales: number;      // costos del corredor (sin IRPF)
  totalACobrarNeto: number;
  gananciaNeta: number;
  gananciaNetaPct: number;
  tirNeta: number | null;
  costoEnTir: number | null;  // puntos de TIR que se llevan costos e IRPF
  flujosNetos: { fecha: string; anios: number; interes: number; amortizacion: number; costos: number; irpf: number; total: number }[];
};

/**
 * Aplica los costos del corredor a una compra de `valorNominal` y recalcula la TIR neta.
 * Custodia: % anual sobre lo invertido, descontada en cada pago de cupón.
 */
export function aplicarCostos(a: AnalisisBono, valorNominal: number, c: Costos, irpfPct = 0): ResultadoNeto | null {
  if (!a.completo || a.tir == null || valorNominal <= 0) return null;
  const k = valorNominal / 100;
  const iva = 1 + c.iva_pct / 100;
  const inversionBruta = a.precioSucio * k;
  const costoCompra = inversionBruta * (c.comision_compra_pct / 100) * iva + c.gasto_fijo;
  const inversionTotal = inversionBruta + costoCompra;

  let prevAnios = 0;
  let custodiaTotal = 0, comisionCupones = 0, irpfTotal = 0;
  const tasa = Math.max(0, irpfPct) / 100;
  const ultimo = a.flujos.length - 1;
  const flujosNetos = a.flujos.map((f, idx) => {
    const interes = f.interes * k;
    const amortizacion = f.amortizacion * k;
    const custodia = inversionBruta * (c.custodia_anual_pct / 100) * iva * Math.max(0, f.anios - prevAnios);
    const comCupon = interes * (c.comision_cupon_pct / 100) * iva;
    // IRPF: se retiene sobre cada cupón; en letras sin cupón, sobre el descuento al vencimiento.
    const descuento = (a.cupon ?? 0) === 0 && idx === ultimo ? Math.max(0, (100 - a.precioSucio) * k) : 0;
    const irpf = (interes + descuento) * tasa;
    prevAnios = f.anios;
    custodiaTotal += custodia;
    comisionCupones += comCupon;
    irpfTotal += irpf;
    const costos = custodia + comCupon;
    return { fecha: f.fecha, anios: f.anios, interes, amortizacion, costos, irpf, total: interes + amortizacion - costos - irpf };
  });

  const totalACobrarNeto = flujosNetos.reduce((s, f) => s + f.total, 0);
  const tirNeta = tirDeFlujos(inversionTotal, flujosNetos);
  const gananciaNeta = totalACobrarNeto - inversionTotal;
  return {
    inversionBruta,
    costoCompra,
    inversionTotal,
    custodiaTotal,
    comisionCupones,
    irpfTotal,
    irpfPct: Math.max(0, irpfPct),
    costosTotales: costoCompra + custodiaTotal + comisionCupones,
    totalACobrarNeto,
    gananciaNeta,
    gananciaNetaPct: (gananciaNeta / inversionTotal) * 100,
    tirNeta,
    costoEnTir: tirNeta != null ? a.tir - tirNeta : null,
    flujosNetos,
  };
}

/** Nominal que se compra con un monto total, ya descontando la comisión de compra. */
export function nominalNetoParaMonto(a: AnalisisBono, monto: number, c: Costos): number {
  if (a.precioSucio <= 0) return 0;
  const iva = 1 + c.iva_pct / 100;
  const disponible = Math.max(0, monto - c.gasto_fijo) / (1 + (c.comision_compra_pct / 100) * iva);
  return (disponible / a.precioSucio) * 100;
}
