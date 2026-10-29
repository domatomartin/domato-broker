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

function limpiar(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
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

  // ISIN uruguayo: los caracteres 9-10 indican la moneda (UYNA00031UI9 → UI).
  if (isin.startsWith("UY")) {
    const sufijo = isin.slice(8, 10);
    if (sufijo === "UI") return "UI";
    if (sufijo === "US") return "USD";
    if (sufijo === "UP") return "UP";
    if (sufijo === "UR") return "UR";
    if (sufijo === "UY") return "UYU";
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
    const descripcion = (celdas[3] ?? "").replace(new RegExp(`\\s*-?\\s*${isin}$`), "").trim();
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
