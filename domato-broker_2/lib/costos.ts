

import { tirDeFlujos, type AnalisisBono } from "@/lib/bondMath";

/** Costos del corredor. Porcentajes en %, sin IVA (el IVA se aplica aparte). */
export type Costos = {
  comision_compra_pct: number;   // sobre el monto operado
  comision_venta_pct: number;    // por si se vende antes (no se usa al vencimiento)
  custodia_anual_pct: number;    // sobre el valor de la tenencia, por año
  comision_cupon_pct: number;    // sobre cada cupón cobrado
  gasto_fijo: number;            // por operación de compra, en la moneda del bono
  iva_pct: number;               // IVA sobre comisiones y custodia
};

export const COSTOS_DEFECTO: Costos = {
  comision_compra_pct: 0.5,
  comision_venta_pct: 0.5,
  custodia_anual_pct: 0.25,
  comision_cupon_pct: 0,
  gasto_fijo: 0,
  iva_pct: 22,
};

export const ETIQUETAS_COSTOS: Record<keyof Costos, string> = {
  comision_compra_pct: "Comisión de compra (%)",
  comision_venta_pct: "Comisión de venta (%)",
  custodia_anual_pct: "Custodia anual (%)",
  comision_cupon_pct: "Comisión sobre cupones (%)",
  gasto_fijo: "Gasto fijo por compra",
  iva_pct: "IVA sobre comisiones (%)",
};

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
  costosTotales: number;
  totalACobrarNeto: number;
  gananciaNeta: number;
  gananciaNetaPct: number;
  tirNeta: number | null;
  costoEnTir: number | null;  // puntos de TIR que se lleva el corredor
  flujosNetos: { fecha: string; anios: number; interes: number; amortizacion: number; costos: number; total: number }[];
};

/**
 * Aplica los costos del corredor a una compra de `valorNominal` y recalcula la TIR neta.
 * Custodia: % anual sobre lo invertido, descontada en cada pago de cupón.
 */
export function aplicarCostos(a: AnalisisBono, valorNominal: number, c: Costos): ResultadoNeto | null {
  if (!a.completo || a.tir == null || valorNominal <= 0) return null;
  const k = valorNominal / 100;
  const iva = 1 + c.iva_pct / 100;
  const inversionBruta = a.precioSucio * k;
  const costoCompra = inversionBruta * (c.comision_compra_pct / 100) * iva + c.gasto_fijo;
  const inversionTotal = inversionBruta + costoCompra;

  let prevAnios = 0;
  let custodiaTotal = 0, comisionCupones = 0;
  const flujosNetos = a.flujos.map((f) => {
    const interes = f.interes * k;
    const amortizacion = f.amortizacion * k;
    const custodia = inversionBruta * (c.custodia_anual_pct / 100) * iva * Math.max(0, f.anios - prevAnios);
    const comCupon = interes * (c.comision_cupon_pct / 100) * iva;
    prevAnios = f.anios;
    custodiaTotal += custodia;
    comisionCupones += comCupon;
    const costos = custodia + comCupon;
    return { fecha: f.fecha, anios: f.anios, interes, amortizacion, costos, total: interes + amortizacion - costos };
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
