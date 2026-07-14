import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BVM_URL = "https://www.bvm.com.uy/vector";

export interface PrecioBvm {
  precio: number;
  cupon: number;
  fecha: string;
}

// Cache en memoria — se resetea en cada cold start de Vercel
let cache: { data: Record<string, PrecioBvm>; ts: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hora

function parseBvmHtml(html: string): Record<string, PrecioBvm> {
  const result: Record<string, PrecioBvm> = {};
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trPattern.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    // BVM row: [fecha, codigo_bvm, isin, descripcion, precio_sin_cupon, cupon_corrido]
    if (cells.length >= 5) {
      const fecha = cells[0];
      const isin = cells[2];
      const precio = parseFloat(cells[4].replace(",", "."));
      const cupon = parseFloat((cells[5] ?? "0").replace(",", ".")) || 0;
      if (isin && isin.length >= 10 && !isNaN(precio) && precio > 0) {
        result[isin] = { precio, cupon, fecha };
      }
    }
  }
  return result;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return NextResponse.json(cache.data);
  }
  try {
    const resp = await fetch(BVM_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*",
        "User-Agent": "Mozilla/5.0 (compatible; DoMatoBroker/1.0)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) throw new Error(`BVM devolvió HTTP ${resp.status}`);
    const html = await resp.text();
    const precios = parseBvmHtml(html);
    cache = { data: precios, ts: now };
    return NextResponse.json(precios);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "X-Cache": "stale", "X-Error": msg },
      });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
