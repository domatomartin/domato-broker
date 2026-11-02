import { NextResponse } from "next/server";
import { usuarioDesdeRequest } from "@/lib/authServer";
import { admin, clavesVapid, enviarPush } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET  /api/push            → clave pública VAPID (para suscribir el dispositivo)
// POST /api/push            → { accion: "suscribir", sub } | { accion: "baja", endpoint } | { accion: "prueba" }
// Todo exige sesión del dueño.

export async function GET(req: Request) {
  if (!(await usuarioDesdeRequest(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { publicKey } = await clavesVapid();
  const { count } = await admin().from("push_subs").select("endpoint", { count: "exact", head: true });
  return NextResponse.json({ publicKey, dispositivos: count ?? 0 });
}

export async function POST(req: Request) {
  if (!(await usuarioDesdeRequest(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sb = admin();
  if (body.accion === "suscribir") {
    const sub = body.sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
    const { error } = await sb.from("push_subs").upsert({ endpoint: sub.endpoint, keys: sub.keys, dispositivo: String(body.dispositivo ?? "").slice(0, 120) }, { onConflict: "endpoint" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.accion === "baja") {
    await sb.from("push_subs").delete().eq("endpoint", String(body.endpoint ?? ""));
    return NextResponse.json({ ok: true });
  }
  if (body.accion === "prueba") {
    const r = await enviarPush({ titulo: "Domato", cuerpo: "Las notificaciones funcionan en este dispositivo ✅", url: "/alertas", tag: "prueba" }, sb);
    return NextResponse.json(r);
  }
  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
