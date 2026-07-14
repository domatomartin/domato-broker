import { NextResponse } from "next/server";

export type Tasas = {
  UYU_per_USD: number;
  ARS_per_USD: number;
  UI_in_UYU: number;
  fetched_at: string;
};

// Fallbacks — UI se actualiza mensualmente en INE/BCU
// Fuente: https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Unidad-Indexada.aspx
const FALLBACK = {
  UYU_per_USD: 40.1,
  ARS_per_USD: 1485,
  UI_in_UYU: 6.6026, // vigente julio 2026
};

// Cache en memoria (se resetea en cada deploy de Vercel)
let cache: { tasas: Tasas; ts: number } | null = null;
const TTL_MS = 4 * 60 * 60 * 1000; // 4 horas

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return NextResponse.json(cache.tasas);
  }

  let UYU_per_USD = FALLBACK.UYU_per_USD;
  let ARS_per_USD = FALLBACK.ARS_per_USD;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "success") {
        UYU_per_USD = data.rates?.UYU ?? FALLBACK.UYU_per_USD;
        ARS_per_USD = data.rates?.ARS ?? FALLBACK.ARS_per_USD;
      }
    }
  } catch {
    // usar fallback si la API externa falla
  }

  const tasas: Tasas = {
    UYU_per_USD,
    ARS_per_USD,
    UI_in_UYU: FALLBACK.UI_in_UYU,
    fetched_at: new Date().toISOString(),
  };

  cache = { tasas, ts: now };
  return NextResponse.json(tasas);
}
