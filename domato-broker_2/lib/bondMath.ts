// Matemática de bonos para simular compras y comparar opciones de inversión.
//
// Convenciones (simplificadas, suficientes para comparar y mostrar a clientes):
// - Bono "bullet": cupón fijo, amortiza el 100% al vencimiento. Los bonos que
//   amortizan en cuotas (varios globales de Uruguay lo hacen en los últimos años)
//   quedan con una TIR aproximada.
// - Calendario de cupones hacia atrás desde el vencimiento, cada 12/frecuencia meses.
// - Interés corrido lineal dentro del período (actual/actual por período).
// - TIR efectiva anual: precio sucio = Σ flujo / (1+TIR)^t, con t en años medido
//   en períodos de cupón exactos (convención de mercado): t = (i + w) / frecuencia.
//   Para bonos en UI/UP es una tasa real en esa unidad.
// - Precios cada 100 de valor nominal.

export type DatosBono = {
  cupon: number | null;          // tasa anual en %, p.ej. 7.625
  frecuencia?: number | null;    // pagos por año (1, 2, 4, 12); por defecto 2
  vencimiento: string | null;    // YYYY-MM-DD
  precio: number | null;         // precio limpio (sin cupón) cada 100 VN
};

export type Flujo = {
  fecha: string;          // YYYY-MM-DD
  interes: number;        // cada 100 VN
  amortizacion: number;   // cada 100 VN
  total: number;          // cada 100 VN
  anios: number;          // años desde la fecha de cálculo
};

export type AnalisisBono = {
  completo: boolean;
  cupon: number | null;
  frecuencia: number;
  faltan: string[];
  flujos: Flujo[];
  ultimoCupon: string | null;
  proximoCupon: string | null;
  interesCorrido: number;      // cada 100 VN
  precioSucio: number;         // cada 100 VN
  tir: number | null;          // % efectiva anual
  tirNominal: number | null;   // % nominal anual capitalizable según frecuencia
  currentYield: number | null; // % cupón / precio limpio
  duration: number | null;     // años (Macaulay)
  durationModificada: number | null;
  convexidad: number | null;
  dv01: number | null;         // cambio de precio por 1 pb, cada 100 VN
  aniosAlVencimiento: number | null;
  totalIntereses: number;      // cupones futuros, cada 100 VN
  totalACobrar: number;        // cupones + capital, cada 100 VN
  gananciaAlVencimiento: number | null; // % sobre precio sucio, sin reinvertir
};

const DIA = 86_400_000;

function aFecha(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resta meses manteniendo el día (o el último día del mes si no existe). */
function restarMeses(d: Date, meses: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - meses;
  const dia = d.getUTCDate();
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dia, ultimo)));
}

export function hoyIso(): string {
  return iso(new Date());
}

/** Fechas de pago de cupón desde el último anterior a `desde` hasta el vencimiento. */
export function calendarioCupones(vencimiento: string, frecuencia: number, desde: string) {
  const meses = 12 / frecuencia;
  const vto = aFecha(vencimiento);
  const inicio = aFecha(desde);
  const fechas: Date[] = [];
  let f = vto;
  let i = 0;
  while (f > inicio && i < 2000) {
    fechas.unshift(f);
    i++;
    f = restarMeses(vto, meses * i);
  }
  return { anterior: f, futuras: fechas };
}

function precioDesdeTir(flujos: Flujo[], tir: number): number {
  return flujos.reduce((s, f) => s + f.total / Math.pow(1 + tir, f.anios), 0);
}

/** TIR efectiva anual (decimal) por bisección; null si no converge. */
function resolverTir(flujos: Flujo[], precioSucio: number): number | null {
  if (!flujos.length || precioSucio <= 0) return null;
  let lo = -0.99, hi = 5;
  if ((precioDesdeTir(flujos, lo) - precioSucio) * (precioDesdeTir(flujos, hi) - precioSucio) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = precioDesdeTir(flujos, mid) - precioSucio;
    if (Math.abs(v) < 1e-10) return mid;
    if (v > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function analizarBono(d: DatosBono, fechaCalculo: string = hoyIso()): AnalisisBono {
  const frecuencia = d.frecuencia && d.frecuencia > 0 ? d.frecuencia : 2;
  const faltan: string[] = [];
  if (d.cupon == null) faltan.push("tasa de cupón");
  if (!d.vencimiento) faltan.push("vencimiento");
  if (d.precio == null || d.precio <= 0) faltan.push("precio");

  const vacio: AnalisisBono = {
    completo: false, cupon: d.cupon, frecuencia, faltan, flujos: [], ultimoCupon: null, proximoCupon: null,
    interesCorrido: 0, precioSucio: d.precio ?? 0, tir: null, tirNominal: null,
    currentYield: d.cupon != null && d.precio ? (d.cupon / d.precio) * 100 : null,
    duration: null, durationModificada: null, convexidad: null, dv01: null,
    aniosAlVencimiento: d.vencimiento ? (aFecha(d.vencimiento).getTime() - aFecha(fechaCalculo).getTime()) / DIA / 365 : null,
    totalIntereses: 0, totalACobrar: 0, gananciaAlVencimiento: null,
  };
  if (faltan.length || !d.vencimiento || d.cupon == null || !d.precio) return vacio;
  if (aFecha(d.vencimiento) <= aFecha(fechaCalculo)) return { ...vacio, faltan: ["vencimiento futuro"] };

  const hoy = aFecha(fechaCalculo);
  const { anterior, futuras } = calendarioCupones(d.vencimiento, frecuencia, fechaCalculo);
  const cuponPeriodo = d.cupon / frecuencia; // cada 100 VN

  const largoPeriodo = (futuras[0].getTime() - anterior.getTime()) / DIA;
  const transcurrido = (hoy.getTime() - anterior.getTime()) / DIA;
  const w = 1 - transcurrido / largoPeriodo; // fracción del período hasta el próximo cupón

  const flujos: Flujo[] = futuras.map((f, i) => {
    const amortizacion = i === futuras.length - 1 ? 100 : 0;
    return {
      fecha: iso(f),
      interes: cuponPeriodo,
      amortizacion,
      total: cuponPeriodo + amortizacion,
      anios: (i + w) / frecuencia,
    };
  });

  const interesCorrido = cuponPeriodo * Math.max(0, Math.min(1, transcurrido / largoPeriodo));
  const precioSucio = d.precio + interesCorrido;

  const tir = resolverTir(flujos, precioSucio);
  let duration: number | null = null, durationModificada: number | null = null;
  let convexidad: number | null = null, dv01: number | null = null;
  if (tir != null) {
    const pv = flujos.map((f) => f.total / Math.pow(1 + tir, f.anios));
    const p = pv.reduce((a, b) => a + b, 0);
    duration = flujos.reduce((s, f, i) => s + f.anios * pv[i], 0) / p;
    durationModificada = duration / (1 + tir);
    convexidad = flujos.reduce((s, f, i) => s + f.anios * (f.anios + 1) * pv[i], 0) / (p * Math.pow(1 + tir, 2));
    dv01 = (precioDesdeTir(flujos, tir - 0.0001) - precioDesdeTir(flujos, tir + 0.0001)) / 2;
  }

  const totalIntereses = flujos.reduce((s, f) => s + f.interes, 0);
  const totalACobrar = totalIntereses + 100;

  return {
    completo: true,
    cupon: d.cupon,
    frecuencia,
    faltan: [],
    flujos,
    ultimoCupon: iso(anterior),
    proximoCupon: flujos[0]?.fecha ?? null,
    interesCorrido,
    precioSucio,
    tir: tir != null ? tir * 100 : null,
    tirNominal: tir != null ? (Math.pow(1 + tir, 1 / frecuencia) - 1) * frecuencia * 100 : null,
    currentYield: (d.cupon / d.precio) * 100,
    duration,
    durationModificada,
    convexidad,
    dv01,
    aniosAlVencimiento: flujos[flujos.length - 1].anios,
    totalIntereses,
    totalACobrar,
    gananciaAlVencimiento: ((totalACobrar - precioSucio) / precioSucio) * 100,
  };
}

/** Convierte un análisis cada 100 VN en importes para un valor nominal dado. */
export function escalar(a: AnalisisBono, valorNominal: number) {
  const k = valorNominal / 100;
  return {
    inversion: a.precioSucio * k,
    interesCorrido: a.interesCorrido * k,
    interesAnual: ((a.cupon ?? 0) / 100) * valorNominal,
    totalIntereses: a.totalIntereses * k,
    totalACobrar: a.totalACobrar * k,
    ganancia: (a.totalACobrar - a.precioSucio) * k,
    flujos: a.flujos.map((f) => ({ ...f, interes: f.interes * k, amortizacion: f.amortizacion * k, total: f.total * k })),
  };
}

/** Valor nominal que se compra con un monto, al precio sucio. */
export function nominalParaMonto(a: AnalisisBono, monto: number): number {
  return a.precioSucio > 0 ? (monto / a.precioSucio) * 100 : 0;
}

/**
 * Precio limpio (c/100) si la TIR de mercado cambia `deltaPb` puntos básicos hoy.
 * Sirve para mostrar el riesgo de vender antes del vencimiento.
 */
export function sensibilidad(a: AnalisisBono, deltasPb: number[] = [-200, -100, -50, 0, 50, 100, 200]) {
  if (!a.completo || a.tir == null) return [];
  const base = a.tir / 100;
  return deltasPb.map((d) => {
    const tir = base + d / 10_000;
    const sucio = precioDesdeTir(a.flujos, tir);
    const limpio = sucio - a.interesCorrido;
    return { deltaPb: d, tir: tir * 100, precioLimpio: limpio, variacionPct: ((sucio - a.precioSucio) / a.precioSucio) * 100 };
  });
}

/** Cobros acumulados en el tiempo (c/100), para graficar contra lo invertido. */
export function cobrosAcumulados(a: AnalisisBono) {
  let acc = 0;
  return a.flujos.map((f) => {
    acc += f.total;
    return { fecha: f.fecha, anios: f.anios, acumulado: acc, interesesAcumulados: acc - (f.amortizacion ? 100 : 0) };
  });
}
