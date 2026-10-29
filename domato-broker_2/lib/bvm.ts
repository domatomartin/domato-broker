// Catálogo de instrumentos de la BVM, a partir del vector de precios del BCU
// publicado en https://www.bvm.com.uy/vector.
//
// El vector completo trae ISIN y precio pero no la descripción; filtrado por
// especie sí la trae ("Notas Gob. 18/01/29 3,25%-UYNA00031UI9"), y de ahí salen
// el vencimiento y la tasa. Por eso se consulta especie por especie.

export const BVM_VECTOR_URL = "https://www.bvm.com.uy/vector";

export const ESPECIES_BVM = [
  "Bono Global Uruguay en $U",
  "Bonos Global Uruguay en U$S",
  "Bono Global Uruguay en UI",
  "Bono Global en EU",
  "Bonos del Tesoro",
  "Notas del Tesoro",
  "Notas del Tesoro $",
  "Notas del Tesoro UI",
  "Notas del Tesoro UP",
  "Notas del BCU",
  "Letras de Regulación Monetaria",
  "Letra de Tesoreria",
  "Bono de Ahorro Previsional",
  "Bono Canasta en REALES",
  "Obligaciones Negociables",
  "Obligaciones Negociables U$S",
  "Obligaciones Negociables UI",
  "Obligaciones Negociables UR",
  "Fideicomiso Financiero",
  "Fideicomiso Financiero $",
  "Fideicomiso Financiero U$S",
  "Fideicomiso Financiero UI",
  "Fideicomiso Financiero DUI",
  "Fideicomiso Financiero UP",
  "Fid. Fin. MIXTO",
  "Certificados de Participación",
  "Certificados de Participación en $U",
  "Certificados de Participación U$S",
  "Certificados de Participación UI",
  "Acciones de Empresas Privadas",
  "Acciones Preferidas Empresas Privadas",
  "Acciones con Intereses",
  "Org. Internacionales",
  "Org. Internacionales $",
  "Org. Internacionales U$S",
  "Org. Internacionales R$",
  "Org. Internacionales ME",
  "Org. Internacionales COP",
  "Bonos Soberanos Extranjeros",
  "Bonos Soberanos Extranjeros de USA",
  "Bonos Soberanos Extranjeros US$",
  "Bonos Soberanos en EUROS",
] as const;

export type InstrumentoBvm = {
  isin: string;
  codigo: string | null;
  nombre: string;
  especie: string | null;
  moneda: string;
  cupon: number | null;
  vencimiento: string | null; // YYYY-MM-DD
  precio: number | null;
  cupon_corrido: number | null;
  fecha_precio: string | null; // YYYY-MM-DD
};

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ordm: "º", ordf: "ª", deg: "°",
};

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m);
}

function limpiar(s: string): string {
  return decodificar(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** La BVM corta la descripción en ~40 caracteres y suele terminar en "-<ISIN o parte>". */
function quitarIsinFinal(desc: string, isin: string): string {
  const m = desc.match(/\s*-\s*([A-Z]{2}[A-Z0-9]*)$/);
  if (m && isin.startsWith(m[1])) return desc.slice(0, m.index).trim();
  return desc.replace(/[-\s]+$/, "").trim();
}

function parseNumero(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

function fechaIso(dd: string, mm: string, yy: string): string | null {
  const anio = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const d = Number(dd), m = Number(mm);
  if (!anio || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${anio}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Moneda a partir de la especie; si la especie no la dice, se mira el ISIN. */
export function monedaDe(especie: string | null, isin: string): string {
  const e = especie ?? "";
  if (/\bDUI\b|\bUI\b/.test(e)) return "UI";
  if (/\bUP\b/.test(e)) return "UP";
  if (/\bUR\b/.test(e)) return "UR";
  if (/U\$S|US\$|de USA/.test(e)) return "USD";
  if (/\$U|\s\$$/.test(e)) return "UYU";
  if (/R\$|REALES/.test(e)) return "BRL";
  if (/EUROS|\bEU\b/.test(e)) return "EUR";
  if (/COP/.test(e)) return "COP";

  // ISIN uruguayo: los caracteres 10-11 indican la moneda (UYNA00031UI9 → UI).
  if (isin.startsWith("UY")) {
    const sufijo = isin.slice(9, 11);
    if (sufijo === "UI") return "UI";
    if (sufijo === "US") return "USD";
    if (sufijo === "UP") return "UP";
    if (sufijo === "UR") return "UR";
    return "UYU";
  }
  if (/^(DE|FR|IT|ES|NL|AT|BE|EU)/.test(isin)) return "EUR";
  return "USD";
}

/** Saca vencimiento y tasa de descripciones como "Notas Gob. 18/01/29 3,25%-UYNA00031UI9". */
export function parseDescripcion(desc: string): { cupon: number | null; vencimiento: string | null } {
  const tasa = desc.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const fecha = desc.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)\b/);
  return {
    cupon: tasa ? parseNumero(tasa[1]) : null,
    vencimiento: fecha ? fechaIso(fecha[1], fecha[2], fecha[3]) : null,
  };
}

/** Parsea el HTML del vector: [fecha, código BVM, ISIN, descripción, precio sin cupón, cupón corrido]. */
export function parseVector(html: string, especie: string | null): InstrumentoBvm[] {
  const out: InstrumentoBvm[] = [];
  const filas = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const fila of filas) {
    const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpiar(m[1]));
    if (celdas.length < 5) continue;
    const isin = celdas[2]?.toUpperCase();
    if (!isin || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;

    const codigo = celdas[1] || null;
    const descripcion = quitarIsinFinal(celdas[3] ?? "", isin);
    const { cupon, vencimiento } = parseDescripcion(descripcion);
    const f = celdas[0].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const precio = parseNumero(celdas[4]);

    out.push({
      isin,
      codigo,
      nombre: descripcion || codigo || isin,
      especie,
      moneda: monedaDe(especie, isin),
      cupon,
      vencimiento,
      precio: precio && precio > 0 ? precio : null,
      cupon_corrido: parseNumero(celdas[5]),
      fecha_precio: f ? `${f[3]}-${f[2]}-${f[1]}` : null,
    });
  }
  return out;
}

/** Columnas que completa el usuario; la sincronización con la BVM nunca las pisa. */
export type DatosManuales = {
  cupon_manual?: number | null;
  vencimiento_manual?: string | null;
  frecuencia?: number | null; // pagos por año; la BVM no lo publica
  irpf_manual?: number | null; // tasa de IRPF propia del bono (si no, la de su tipo)
};

export type Instrumento = InstrumentoBvm & DatosManuales & { updated_at?: string };

/**
 * Letras (LRM del BCU, Letras de Tesorería, T-bills de EE.UU.): son a descuento,
 * sin cupón, y el vector publica la tasa de rendimiento en lugar del precio.
 */
export function cotizaEnTasa(i: Pick<InstrumentoBvm, "especie" | "isin">): boolean {
  return /Regulaci.n Monetaria|Letra de Tesor/i.test(i.especie ?? "") || i.isin.startsWith("US912797");
}

/** Datos a usar: lo cargado a mano gana sobre lo que trae la BVM. */
export function efectivo(i: Instrumento) {
  const vencimiento = i.vencimiento_manual ?? i.vencimiento;
  if (cotizaEnTasa(i)) {
    // Precio implícito de una letra a descuento a partir de su tasa efectiva anual.
    let precio: number | null = null;
    if (i.precio != null && vencimiento) {
      const h = new Date();
      const hoy = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
      const dias = (Date.parse(vencimiento) - hoy) / 86_400_000;
      if (dias > 0) precio = 100 / Math.pow(1 + i.precio / 100, dias / 365);
    }
    return { cupon: 0, vencimiento, frecuencia: 1, frecuenciaSupuesta: false, precio, tasaVector: i.precio, letra: true };
  }
  return {
    cupon: i.cupon_manual ?? i.cupon,
    vencimiento,
    frecuencia: i.frecuencia ?? 2,
    frecuenciaSupuesta: i.frecuencia == null,
    precio: i.precio,
    tasaVector: null as number | null,
    letra: false,
  };
}

export type Grupo = "Uruguay soberano" | "Corporativos" | "Fideicomisos" | "Acciones" | "Exterior" | "Otros";

export function grupoDe(i: Instrumento): Grupo {
  const e = i.especie ?? "";
  if (/Acciones/.test(e)) return "Acciones";
  if (/Obligaciones/.test(e)) return "Corporativos";
  if (/Fideicomiso|Fid\. Fin|Certificados/.test(e)) return "Fideicomisos";
  if (/Global Uruguay|Notas del|Bonos del Tesoro|Regulaci|Letra de Tesor|Previsional/.test(e)) return "Uruguay soberano";
  if (/Extranjeros|Soberanos|Org\. Intern|Global en EU|Canasta/.test(e)) return "Exterior";
  if (i.isin.startsWith("UY")) {
    if (i.isin.startsWith("UYFF")) return "Fideicomisos";
    if (i.isin.startsWith("UYON")) return "Corporativos";
    return "Otros";
  }
  return "Exterior";
}

export const GRUPOS: Grupo[] = ["Uruguay soberano", "Corporativos", "Fideicomisos", "Exterior", "Acciones", "Otros"];
