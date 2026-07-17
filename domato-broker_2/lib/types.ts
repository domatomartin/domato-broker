export type Bond = {
  id: string;
  nombre: string;
  codigo: string | null;
  isin: string | null;
  moneda: "USD" | "UYU" | "UI" | "EUR" | string;
  cantidad: number;
  valor_nominal: number;
  precio_compra: number;
  precio_actual: number;
  precio_mercado?: number | null;
  precio_updated_at?: string | null;
  cupon: number | null;
  frecuencia?: number | null;
  proximo_pago_interes: string | null;
  proximo_vencimiento: string | null;
  fecha_compra: string | null;
  corredor: string | null;
  estado: "activo" | "vencido" | "vendido";
  cuenta?: string | null;
  ticker?: string | null;
  asset_type?: string | null;
  notas?: string | null;
  dividendo?: number | null;
  tir: number | null;
  duration: number | null;
  duration_modificada: number | null;
  convexidad: number | null;
  created_at?: string;
};

export type BondComputed = Bond & {
  valor_mercado: number;
  ganancia: number;
  rentabilidad_pct: number;
};

export type PatrimonioSnapshot = {
  id?: string;
  fecha: string;
  valor_total: number;
  efectivo_usd: number;
  efectivo_uyu: number;
};

export type Movimiento = {
  id: string;
  fecha: string;
  tipo: "compra" | "venta" | "cupon" | "interes" | "deposito" | "retiro";
  bono_id: string | null;
  descripcion: string;
  monto: number;
  moneda: string;
};

export type InvestorProfile = {
  id?: number;
  objetivos_financieros: string | null;
  rentabilidad_objetivo: number | null;
  riesgo_aceptado: "conservador" | "moderado" | "agresivo" | string;
  horizonte_inversion: string | null;
  distribucion_objetivo: string | null;
  updated_at?: string;
};

export const CSV_BOND_COLUMNS = [
  "nombre",
  "codigo",
  "isin",
  "moneda",
  "cantidad",
  "valor_nominal",
  "precio_compra",
  "precio_actual",
  "cupon",
  "proximo_pago_interes",
  "proximo_vencimiento",
  "fecha_compra",
  "corredor",
] as const;
