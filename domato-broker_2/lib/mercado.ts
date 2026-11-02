// Foto del mercado para la IA: tasas de EE.UU., dólar, monedas de la región, commodities y volatilidad.
// Usa el endpoint público de gráficos de Yahoo Finance (sin clave). Solo en el servidor.

export type DatoMercado = { id?: string; nombre: string; valor: number | null; var1m: number | null; unidad?: string };
export type FotoMercado = { fecha: string; datos: DatoMercado[] };

const SIMBOLOS: { id: string; s: string; nombre: string; unidad?: string }[] = [
  { id: "IRX", s: "^IRX", nombre: "Tasa Letras EE.UU. 3 meses", unidad: "%" },
  { id: "FVX", s: "^FVX", nombre: "Tasa Treasury 5 años", unidad: "%" },
  { id: "TNX", s: "^TNX", nombre: "Tasa Treasury 10 años", unidad: "%" },
  { id: "TYX", s: "^TYX", nombre: "Tasa Treasury 30 años", unidad: "%" },
  { id: "DXY", s: "DX-Y.NYB", nombre: "Índice dólar (DXY)" },
  { id: "UYU", s: "UYU=X", nombre: "Dólar en Uruguay (UYU por USD)" },
  { id: "BRL", s: "BRL=X", nombre: "Dólar en Brasil (BRL por USD)" },
  { id: "EURUSD", s: "EURUSD=X", nombre: "Euro (USD por EUR)" },
  { id: "VIX", s: "^VIX", nombre: "Volatilidad (VIX)" },
  { id: "SPX", s: "^GSPC", nombre: "S&P 500" },
  { id: "WTI", s: "CL=F", nombre: "Petróleo WTI", unidad: "US$" },
  { id: "ORO", s: "GC=F", nombre: "Oro", unidad: "US$" },
];

async function dato(s: string): Promise<{ valor: number | null; var1m: number | null }> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!r.ok) return { valor: null, var1m: null };
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const valor: number | null = res?.meta?.regularMarketPrice ?? null;
    const cierres: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const primero = cierres.find((c) => c != null) ?? null;
    const var1m = valor != null && primero ? ((valor - primero) / primero) * 100 : null;
    return { valor, var1m };
  } catch {
    return { valor: null, var1m: null };
  }
}

export async function fotoMercado(): Promise<FotoMercado> {
  const datos = await Promise.all(
    SIMBOLOS.map(async (x) => ({ id: x.id, nombre: x.nombre, unidad: x.unidad, ...(await dato(x.s)) }))
  );
  return { fecha: new Date().toISOString(), datos: datos.map((d) => ({ ...d, valor: d.valor != null ? Number(d.valor.toFixed(3)) : null, var1m: d.var1m != null ? Number(d.var1m.toFixed(2)) : null })) };
}

export function mercadoTexto(f: FotoMercado | null | undefined): string {
  if (!f?.datos?.length) return "(sin datos de mercado)";
  return f.datos
    .filter((d) => d.valor != null)
    .map((d) => `- ${d.nombre}${d.id ? ` [${d.id}]` : ""}: ${d.valor}${d.unidad === "%" ? "%" : ""}${d.var1m != null ? ` (${d.var1m >= 0 ? "+" : ""}${d.var1m}% en el último mes)` : ""}`)
    .join("\n");
}
