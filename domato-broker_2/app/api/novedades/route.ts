import { NextResponse } from "next/server";
import { autorizadoCronOUsuario } from "@/lib/authServer";
import { correrNovedades } from "@/lib/novedades";

// Corre a mano lo mismo que hace el cron diario de /api/alerts: precios del día, títulos nuevos y comunicados BVM.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await autorizadoCronOUsuario(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await correrNovedades());
}
