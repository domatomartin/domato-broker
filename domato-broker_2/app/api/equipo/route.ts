import { NextResponse } from "next/server";
import { usuarioDesdeRequest } from "@/lib/authServer";
import { admin } from "@/lib/push";

export const dynamic = "force-dynamic";
const DUENIO = "domato.martin@gmail.com";

async function soloDuenio(req: Request) {
  const u = await usuarioDesdeRequest(req);
  return u?.email?.toLowerCase() === DUENIO;
}

/** Lista el equipo (solo el dueño). */
export async function GET(req: Request) {
  if (!(await soloDuenio(req))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { data, error } = await admin().from("equipo").select("*").order("creado");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ miembros: data });
}

/** Alta o cambio de un miembro: { email, rol, activo }. Si es nuevo, le manda la invitación por mail. */
export async function POST(req: Request) {
  if (!(await soloDuenio(req))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const rol = body.rol === "lectura" ? "lectura" : "colaborador";
  const activo = body.activo !== false;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email === DUENIO) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const sb = admin();
  const { data: previo } = await sb.from("equipo").select("email").eq("email", email).maybeSingle();
  const { error } = await sb.from("equipo").upsert({ email, rol, activo });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let invitacion: string | null = null;
  if (!previo && activo) {
    const origen = new URL(req.url).origin;
    const { error: e } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${origen}/cuenta/clave` });
    // Si ya tenía usuario en Supabase, no hace falta invitarlo: entra con su contraseña (o “Olvidé mi contraseña”).
    invitacion = e ? (/already|registered|exists/i.test(e.message) ? "ya tenía usuario" : e.message) : "enviada";
  }
  return NextResponse.json({ ok: true, invitacion });
}
