import { NextResponse } from "next/server";
import { admin } from "@/lib/push";

// Histórico de precios de un título según el vector de precios del BCU (publicado por la BVM).
// GET /api/historico?isin=UYFFRA091UI5&anios=5  →  { isin, puntos: [{ fecha, precio }], fuente }
// Los precios quedan guardados en precios_historicos: a la BVM solo se le pide lo que falta
// (la primera vez el rango completo; después, los días nuevos, que además carga el cron diario).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Punto = { fecha: string; precio: number };

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const limpiar = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
const DIA = 86_400_000;

async function deLaBvm(isin: string, desde: Date, hasta: Date): Promise<Punto[]> {
  const url = `https://www.bvm.com.uy/vector/graficar?isin=${isin}&fechad=${ddmmyyyy(desde)}&fechah=${ddmmyyyy(hasta)}`;
  const r = await fetch(url, { headers: { Accept: "text/html,*/*", "User-Agent": "Mozilla/5.0 (compatible; DoMatoBroker/1.0)" }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`BVM devolvió HTTP ${r.status}`);
  const html = await r.text();
  const puntos: Punto[] = [];
  for (const fila of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const c = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpiar(m[1]));
    // [fecha, ISIN, código BVM, descripción, precio sin cupón]
    if (c.length < 5 || c[1]?.toUpperCase() !== isin) continue;
    const f = c[0].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const precio = Number(c[4].replace(",", "."));
    if (f && precio > 0) puntos.push({ fecha: `${f[3]}-${f[2]}-${f[1]}`, precio });
  }
  return puntos;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isin = (url.searchParams.get("isin") ?? "").toUpperCase().trim();
  const anios = Math.min(10, Math.max(1, Number(url.searchParams.get("anios") ?? 5) || 5));
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return NextResponse.json({ error: "ISIN inválido" }, { status: 400 });

  const hasta = new Date();
  const desde = new Date(hasta.getFullYear() - anios, hasta.getMonth(), hasta.getDate());
  const fuente = `https://www.bvm.com.uy/vector/graficar?isin=${isin}&fechad=${ddmmyyyy(desde)}&fechah=${ddmmyyyy(hasta)}`;
  const sb = admin();

  const leer = async () => {
    const out: Punto[] = [];
    for (let desdeFila = 0; ; desdeFila += 1000) {
      const { data } = await sb.from("precios_historicos").select("fecha, precio").eq("isin", isin).gte("fecha", iso(desde)).order("fecha").range(desdeFila, desdeFila + 999);
      out.push(...((data as Punto[]) ?? []).map((p) => ({ fecha: p.fecha, precio: Number(p.precio) })));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  try {
    let puntos = await leer();
    // ¿Qué falta? El comienzo del rango (primera consulta o rango más largo) y/o los días recientes.
    // precios_cobertura recuerda desde qué fecha ya se consultó a la BVM (aunque no haya precios tan viejos).
    const { data: cob } = await sb.from("precios_cobertura").select("desde").eq("isin", isin).maybeSingle();
    const cubiertoDesde = cob?.desde ? Date.parse(cob.desde) : null;
    const pedidos: [Date, Date][] = [];
    if (!puntos.length && (cubiertoDesde == null || cubiertoDesde > desde.getTime())) pedidos.push([desde, hasta]);
    else if (puntos.length) {
      const primero = Date.parse(puntos[0].fecha), ultimo = Date.parse(puntos[puntos.length - 1].fecha);
      if ((cubiertoDesde == null || cubiertoDesde > desde.getTime()) && primero - desde.getTime() > 10 * DIA) pedidos.push([desde, new Date(primero - DIA)]);
      if (hasta.getTime() - ultimo > 4 * DIA) pedidos.push([new Date(ultimo + DIA), hasta]);
    }
    if (pedidos.length) {
      const nuevos = (await Promise.all(pedidos.map(([a, b]) => deLaBvm(isin, a, b)))).flat();
      for (let k = 0; k < nuevos.length; k += 500) {
        await sb.from("precios_historicos").upsert(nuevos.slice(k, k + 500).map((p) => ({ isin, fecha: p.fecha, precio: p.precio })), { onConflict: "isin,fecha" });
      }
      if (nuevos.length) {
        const releidos = await leer();
        // Si la base no está disponible, se devuelve igual lo que trajo la BVM.
        const mapa = new Map([...puntos, ...nuevos].map((p) => [p.fecha, p.precio]));
        for (const p of releidos) mapa.set(p.fecha, p.precio);
        puntos = [...mapa.entries()].filter(([f]) => f >= iso(desde)).map(([fecha, precio]) => ({ fecha, precio })).sort((x, y) => x.fecha.localeCompare(y.fecha));
      }
      if (cubiertoDesde == null || cubiertoDesde > desde.getTime()) await sb.from("precios_cobertura").upsert({ isin, desde: iso(desde) }, { onConflict: "isin" });
    }
    return NextResponse.json({ isin, puntos, fuente }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo consultar la BVM" }, { status: 502 });
  }
}
