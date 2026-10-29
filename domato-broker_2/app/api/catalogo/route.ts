import { NextResponse } from "next/server";
import { BVM_VECTOR_URL, ESPECIES_BVM, parseVector } from "@/lib/bvm";

export const dynamic = "force-dynamic";
// La BVM tarda ~30 s en responder cada especie filtrada.
export const maxDuration = 60;

// GET /api/catalogo                → lista de especies a consultar
// GET /api/catalogo?especie=<...>  → instrumentos de esa especie, normalizados
export async function GET(req: Request) {
  const especie = new URL(req.url).searchParams.get("especie");
  if (!especie) return NextResponse.json({ especies: ESPECIES_BVM });

  try {
    const resp = await fetch(`${BVM_VECTOR_URL}?especie=${encodeURIComponent(especie)}`, {
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*",
        "User-Agent": "Mozilla/5.0 (compatible; DoMatoBroker/1.0)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    if (!resp.ok) throw new Error(`BVM devolvió HTTP ${resp.status}`);
    const instrumentos = parseVector(await resp.text(), especie);
    return NextResponse.json({ especie, instrumentos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ especie, error: msg }, { status: 502 });
  }
}
