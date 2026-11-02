import { NextResponse } from "next/server";
import { fotoMercado } from "@/lib/mercado";

// Foto del mercado (tasas de EE.UU., dólar, VIX…): datos públicos, cacheados 1 hora.
export const revalidate = 3600;

export async function GET() {
  try {
    return NextResponse.json(await fotoMercado());
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el mercado" }, { status: 502 });
  }
}
