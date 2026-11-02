import { NextResponse } from "next/server";

// Histórico de precios de un título según el vector de precios del BCU (publicado por la BVM).
// GET /api/historico?isin=UYFFRA091UI5&anios=5  →  { isin, codigo, descripcion, puntos: [{ fecha, precio }] }

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Punto = { fecha: string; precio: number };
type Respuesta = { isin: string; codigo: string | null; descripcion: string | null; puntos: Punto[]; fuente: string };

const cache = new Map<string, { ts: number; data: Respuesta }>();
const TTL = 6 * 60 * 60 * 1000;

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const limpiar = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isin = (url.searchParams.get("isin") ?? "").toUpperCase().trim();
  const anios = Math.min(10, Math.max(1, Number(url.searchParams.get("anios") ?? 5) || 5));
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return NextResponse.json({ error: "ISIN inválido" }, { status: 400 });

  const clave = `${isin}:${anios}`;
  const c = cache.get(clave);
  if (c && Date.now() - c.ts < TTL) return NextResponse.json(c.data);

  const hasta = new Date();
  const desde = new Date(hasta.getFullYear() - anios, hasta.getMonth(), hasta.getDate());
  const fuente = `https://www.bvm.com.uy/vector/graficar?isin=${isin}&fechad=${ddmmyyyy(desde)}&fechah=${ddmmyyyy(hasta)}`;
  try {
    const r = await fetch(fuente, {
      headers: { Accept: "text/html,*/*", "User-Agent": "Mozilla/5.0 (compatible; DoMatoBroker/1.0)" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`BVM devolvió HTTP ${r.status}`);
    const html = await r.text();
    const puntos: Punto[] = [];
    let codigo: string | null = null, descripcion: string | null = null;
    for (const fila of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const c = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpiar(m[1]));
      // [fecha, ISIN, código BVM, descripción, precio sin cupón]
      if (c.length < 5 || c[1]?.toUpperCase() !== isin) continue;
      const f = c[0].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const precio = Number(c[4].replace(",", "."));
      if (!f || !(precio > 0)) continue;
      codigo ??= c[2] || null;
      descripcion ??= c[3] || null;
      puntos.push({ fecha: `${f[3]}-${f[2]}-${f[1]}`, precio });
    }
    puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const data: Respuesta = { isin, codigo, descripcion, puntos, fuente };
    cache.set(clave, { ts: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo consultar la BVM" }, { status: 502 });
  }
}
