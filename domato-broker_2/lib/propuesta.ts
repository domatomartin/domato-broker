// Propuestas de inversión: perfil del cliente, mezcla de bonos y su cálculo como cartera.

import { analizarBono, hoyIso, tirDeFlujos, type AnalisisBono } from "@/lib/bondMath";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, type Costos, type ResultadoNeto } from "@/lib/costos";
import { efectivo, grupoDe, type Grupo, type Instrumento } from "@/lib/bvm";

export type Riesgo = "conservador" | "moderado" | "agresivo";
export type Objetivo = "renta" | "crecimiento" | "preservar";

export type PerfilCliente = {
  monto: number;
  moneda: "USD" | "UYU" | "UI";
  plazoMaxAnios: number;
  riesgo: Riesgo;
  objetivo: Objetivo;
  notas: string;
};

export const PERFIL_DEFECTO: PerfilCliente = {
  monto: 50000,
  moneda: "USD",
  plazoMaxAnios: 10,
  riesgo: "moderado",
  objetivo: "renta",
  notas: "",
};

export const RIESGOS: Record<Riesgo, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  agresivo: "Agresivo",
};

export const OBJETIVOS: Record<Objetivo, string> = {
  renta: "Renta periódica",
  crecimiento: "Maximizar rendimiento",
  preservar: "Preservar capital",
};

/** Lo que se guarda de cada bono de la propuesta (foto al momento de proponer). */
export type ItemPropuesta = {
  isin: string;
  nombre: string;
  moneda: string;
  especie: string | null;
  peso: number; // % del monto
  precio: number | null;
  cupon: number | null;
  vencimiento: string | null;
  frecuencia: number;
  irpf_manual?: number | null;
  motivo?: string;
};

export type EjecucionItem = {
  isin: string;
  precio_compra: number;   // precio limpio pagado
  valor_nominal: number;
  fecha: string;           // YYYY-MM-DD
};

export type EstadoPropuesta = "borrador" | "presentada" | "ejecutada" | "descartada";

export type Propuesta = {
  id: string;
  cliente: string;
  asesor: string | null;
  perfil: PerfilCliente;
  items: ItemPropuesta[];
  analisis: string | null;
  metricas: MetricasGuardadas | null;
  estado: EstadoPropuesta;
  cuenta: string | null;
  ejecucion: EjecucionItem[] | null;
  fecha_presentada: string | null;
  fecha_ejecucion: string | null;
  created_at: string;
  updated_at: string;
};

export const ESTADOS: Record<EstadoPropuesta, string> = {
  borrador: "Borrador",
  presentada: "Presentada",
  ejecutada: "Ejecutada",
  descartada: "Descartada",
};

export function itemDesdeInstrumento(i: Instrumento, peso: number, motivo?: string): ItemPropuesta {
  const e = efectivo(i);
  return {
    isin: i.isin,
    nombre: i.nombre,
    moneda: i.moneda,
    especie: i.especie,
    peso,
    precio: e.precio,
    cupon: e.cupon,
    vencimiento: e.vencimiento,
    frecuencia: e.frecuencia,
    irpf_manual: i.irpf_manual ?? null,
    motivo,
  };
}

export type LineaCalculada = {
  item: ItemPropuesta;
  monto: number;        // en la moneda del perfil
  montoLocal: number;   // en la moneda del bono
  fx: number;           // 1 unidad de la moneda del bono, expresada en la moneda del perfil
  a: AnalisisBono;
  vn: number;
  neto: ResultadoNeto | null;
  grupo: Grupo;
};

export type MetricasCartera = {
  lineas: LineaCalculada[];
  pesoTotal: number;
  inversionTotal: number;
  costosCompra: number;
  costosTotales: number;
  irpfTotal: number;
  totalACobrarNeto: number;
  gananciaNeta: number;
  gananciaNetaPct: number;
  tirBruta: number | null;
  tirNeta: number | null;
  duration: number | null;
  plazoPromedio: number | null;
  interesAnual: number;
  monedas: string[];
  porGrupo: { clave: string; pct: number }[];
  porPlazo: { clave: string; pct: number }[];
  porAnio: { anio: string; interes: number; capital: number }[];
  flujos: { anios: number; total: number; fecha: string }[];
};

/** Resumen numérico que se guarda con la propuesta para compararlo después. */
export type MetricasGuardadas = {
  fecha: string;
  monto: number;
  inversionTotal: number;
  tirBruta: number | null;
  tirNeta: number | null;
  duration: number | null;
  totalACobrarNeto: number;
  gananciaNeta: number;
  interesAnual: number;
};

function bucketPlazo(anios: number | null): string {
  if (anios == null) return "Sin dato";
  if (anios <= 2) return "Hasta 2 años";
  if (anios <= 5) return "2 a 5 años";
  if (anios <= 10) return "5 a 10 años";
  return "Más de 10 años";
}

function agrupar(lineas: LineaCalculada[], clave: (l: LineaCalculada) => string, total: number) {
  const m = new Map<string, number>();
  for (const l of lineas) m.set(clave(l), (m.get(clave(l)) ?? 0) + l.monto);
  return [...m.entries()].map(([k, v]) => ({ clave: k, pct: total > 0 ? (v / total) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
}

/**
 * Valor de 1 unidad de cada moneda expresado en la moneda del perfil
 * (p. ej. perfil en pesos: UI → valor de la UI en pesos). Lo que no esté, vale 1.
 */
export type TiposDeCambio = Record<string, number>;

export function tiposParaPerfil(moneda: PerfilCliente["moneda"], t: { UYU_per_USD: number; UI_in_UYU: number } | null): TiposDeCambio {
  if (!t) return {};
  if (moneda === "UYU") return { UYU: 1, UI: t.UI_in_UYU, USD: t.UYU_per_USD };
  if (moneda === "USD") return { USD: 1, UYU: 1 / t.UYU_per_USD, UI: t.UI_in_UYU / t.UYU_per_USD };
  return { UI: 1, UYU: 1 / t.UI_in_UYU };
}

/** Calcula la propuesta como cartera: cada bono con su monto, costos, y los agregados (en la moneda del perfil). */
export function calcularCartera(items: ItemPropuesta[], montoTotal: number, costos: Costos, fecha?: string, fxs: TiposDeCambio = {}): MetricasCartera {
  const lineas: LineaCalculada[] = items.map((item) => {
    const fx = fxs[item.moneda] ?? 1;
    const monto = (montoTotal * item.peso) / 100;
    const montoLocal = monto / fx;
    const a = analizarBono({ cupon: item.cupon, frecuencia: item.frecuencia, vencimiento: item.vencimiento, precio: item.precio }, fecha);
    const vn = a.completo ? nominalNetoParaMonto(a, montoLocal, costos) : 0;
    const neto = a.completo ? aplicarCostos(a, vn, costos, irpfDe(costos, item)) : null;
    const grupo = grupoDe({ isin: item.isin, especie: item.especie } as Instrumento);
    return { item, monto, montoLocal, fx, a, vn, neto, grupo };
  });

  const validas = lineas.filter((l) => l.neto);
  const inversionTotal = validas.reduce((s, l) => s + l.neto!.inversionTotal * l.fx, 0);
  const inversionBruta = validas.reduce((s, l) => s + l.neto!.inversionBruta * l.fx, 0);

  // Flujos combinados en la moneda del perfil (UI convertida al valor de hoy: no proyecta inflación).
  const flujosNetos = validas.flatMap((l) => l.neto!.flujosNetos.map((f) => ({ anios: f.anios, total: f.total * l.fx, fecha: f.fecha })));
  const flujosBrutos = validas.flatMap((l) => l.a.flujos.map((f) => ({ anios: f.anios, total: ((f.total * l.vn) / 100) * l.fx })));
  const monedas = [...new Set(lineas.map((l) => l.item.moneda))];
  const unaMoneda = monedas.length === 1;

  const ponderar = (fn: (l: LineaCalculada) => number | null) => {
    let s = 0, w = 0;
    for (const l of validas) { const v = fn(l); if (v != null) { s += v * l.neto!.inversionTotal * l.fx; w += l.neto!.inversionTotal * l.fx; } }
    return w > 0 ? s / w : null;
  };

  const tirNeta = validas.length ? (unaMoneda ? tirDeFlujos(inversionTotal, flujosNetos) : ponderar((l) => l.neto!.tirNeta)) : null;
  const tirBruta = validas.length ? (unaMoneda ? tirDeFlujos(inversionBruta, flujosBrutos) : ponderar((l) => l.a.tir)) : null;

  const porAnioMap = new Map<string, { interes: number; capital: number }>();
  for (const l of validas) for (const f of l.neto!.flujosNetos) {
    const y = f.fecha.slice(0, 4);
    const acc = porAnioMap.get(y) ?? { interes: 0, capital: 0 };
    acc.interes += (f.interes - f.costos - f.irpf) * l.fx;
    acc.capital += f.amortizacion * l.fx;
    porAnioMap.set(y, acc);
  }

  const totalACobrarNeto = validas.reduce((s, l) => s + l.neto!.totalACobrarNeto * l.fx, 0);
  const gananciaNeta = totalACobrarNeto - inversionTotal;
  const montoAsignado = lineas.reduce((s, l) => s + l.monto, 0);

  return {
    lineas,
    pesoTotal: items.reduce((s, i) => s + i.peso, 0),
    inversionTotal,
    costosCompra: validas.reduce((s, l) => s + l.neto!.costoCompra * l.fx, 0),
    costosTotales: validas.reduce((s, l) => s + l.neto!.costosTotales * l.fx, 0),
    irpfTotal: validas.reduce((s, l) => s + l.neto!.irpfTotal * l.fx, 0),
    totalACobrarNeto,
    gananciaNeta,
    gananciaNetaPct: inversionTotal > 0 ? (gananciaNeta / inversionTotal) * 100 : 0,
    tirBruta,
    tirNeta,
    duration: ponderar((l) => l.a.duration),
    plazoPromedio: ponderar((l) => l.a.aniosAlVencimiento),
    interesAnual: validas.reduce((s, l) => s + ((l.a.cupon ?? 0) / 100) * l.vn * l.fx, 0),
    monedas,
    porGrupo: agrupar(lineas, (l) => l.grupo, montoAsignado),
    porPlazo: agrupar(lineas, (l) => bucketPlazo(l.a.aniosAlVencimiento), montoAsignado),
    porAnio: [...porAnioMap.entries()].sort().map(([anio, v]) => ({ anio, ...v })),
    flujos: flujosNetos.sort((a, b) => a.anios - b.anios),
  };
}

export function metricasParaGuardar(m: MetricasCartera, monto: number): MetricasGuardadas {
  return {
    fecha: hoyIso(),
    monto,
    inversionTotal: m.inversionTotal,
    tirBruta: m.tirBruta,
    tirNeta: m.tirNeta,
    duration: m.duration,
    totalACobrarNeto: m.totalACobrarNeto,
    gananciaNeta: m.gananciaNeta,
    interesAnual: m.interesAnual,
  };
}

/** Monedas de bonos aceptables para la moneda del cliente. */
export function monedasCompatibles(moneda: PerfilCliente["moneda"]): string[] {
  if (moneda === "UYU") return ["UYU", "UI"];
  if (moneda === "UI") return ["UI"];
  return ["USD"];
}

/** Candidatos del catálogo para que la IA elija: completos, en moneda y plazo del perfil. */
export function candidatosPara(perfil: PerfilCliente, instrumentos: Instrumento[], costos: Costos) {
  const monedas = monedasCompatibles(perfil.moneda);
  return instrumentos
    .filter((i) => monedas.includes(i.moneda))
    .map((i) => {
      const e = efectivo(i);
      const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.precio });
      const neto = a.completo ? aplicarCostos(a, nominalNetoParaMonto(a, 10000, costos), costos, irpfDe(costos, i)) : null;
      return { i, a, neto };
    })
    .filter((c) => c.a.completo && c.neto?.tirNeta != null && (c.a.aniosAlVencimiento ?? 99) <= perfil.plazoMaxAnios + 0.5)
    .filter((c) => grupoDe(c.i) !== "Acciones")
    .sort((x, y) => (y.neto!.tirNeta ?? 0) - (x.neto!.tirNeta ?? 0))
    .slice(0, 60)
    .map((c) => ({
      isin: c.i.isin,
      nombre: c.i.nombre,
      moneda: c.i.moneda,
      tipo: grupoDe(c.i),
      especie: c.i.especie,
      precio: Number((efectivo(c.i).precio ?? 0).toFixed(2)),
      cupon: efectivo(c.i).cupon,
      vencimiento: efectivo(c.i).vencimiento,
      plazo_anios: Number((c.a.aniosAlVencimiento ?? 0).toFixed(1)),
      tir_bruta: Number((c.a.tir ?? 0).toFixed(2)),
      tir_neta: Number((c.neto!.tirNeta ?? 0).toFixed(2)),
      irpf_pct: irpfDe(costos, c.i),
      duration: Number((c.a.duration ?? 0).toFixed(2)),
      letra: efectivo(c.i).letra,
    }));
}

export type Candidato = ReturnType<typeof candidatosPara>[number];
