import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarPush } from "@/lib/push";

// Datos de solo lectura de una cartera para el portal del cliente.
// El token es la única llave: 32 caracteres aleatorios, revocable desde Clientes.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!/^[a-f0-9]{32}$/.test(token ?? "")) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const { data: link } = await sb.from("portal_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revocado) return NextResponse.json({ error: "Este link no existe o fue desactivado. Pedile uno nuevo a tu asesor." }, { status: 404 });

  // Link de una propuesta: el cliente la ve y puede aceptarla.
  if (link.propuesta_id) {
    const { data: prop } = await sb.from("propuestas").select("id, cliente, asesor, perfil, items, analisis, metricas, estado, aceptacion, created_at, fecha_presentada").eq("id", link.propuesta_id).maybeSingle();
    if (!prop) return NextResponse.json({ error: "La propuesta ya no está disponible." }, { status: 404 });
    await sb.from("portal_links").update({ ultimo_acceso: new Date().toISOString(), accesos: (link.accesos ?? 0) + 1 }).eq("token", token);
    const ac = prop.aceptacion as { nombre: string; fecha: string } | null;
    return NextResponse.json({ tipo: "propuesta", propuesta: { ...prop, aceptacion: ac ? { nombre: ac.nombre, fecha: ac.fecha } : null } });
  }

  const [{ data: bonds }, { data: props }, { data: costos }] = await Promise.all([
    sb.from("bonds").select("id, nombre, isin, moneda, cupon, frecuencia, proximo_vencimiento, valor_nominal, cantidad, precio_compra, precio_actual, fecha_compra, created_at, estado, cuenta, propuesta_id").in("estado", ["activo", "vencido"]),
    sb.from("propuestas").select("id, cliente, asesor, cuenta, fx_compra").eq("estado", "ejecutada"),
    sb.from("costos_config").select("*").eq("id", 1).maybeSingle(),
  ]);
  const cuenta = String(link.cuenta).trim();
  const misBonds = (bonds ?? []).filter((b) => (b.cuenta ?? "").trim() === cuenta);
  const misProps = (props ?? []).filter((p) => (p.cuenta ?? "").trim() === cuenta || misBonds.some((b) => b.propuesta_id === p.id));
  const isins = [...new Set(misBonds.map((b) => b.isin).filter(Boolean))];
  const { data: instrumentos } = isins.length
    ? await sb.from("instrumentos").select("isin, nombre, especie, moneda, cupon, cupon_manual, vencimiento, vencimiento_manual, frecuencia, precio, fecha_precio, amortizaciones, escalonado, irpf_manual, rendimiento_estimado").in("isin", isins)
    : { data: [] };

  await sb.from("portal_links").update({ ultimo_acceso: new Date().toISOString(), accesos: (link.accesos ?? 0) + 1 }).eq("token", token);

  return NextResponse.json({
    tipo: "cartera",
    cliente: link.cliente ?? misProps[0]?.cliente ?? null,
    asesor: misProps[0]?.asesor ?? null,
    cuenta,
    bonds: misBonds,
    propuestas: misProps,
    instrumentos: instrumentos ?? [],
    costos: costos ?? null,
  });
}

/** El cliente acepta la propuesta compartida: queda registrado nombre, fecha y dispositivo, y se avisa al asesor. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!/^[a-f0-9]{32}$/.test(token ?? "")) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre ?? "").trim().slice(0, 120);
  if (nombre.length < 3 || body.acepto !== true) return NextResponse.json({ error: "Escribí tu nombre completo y marcá que aceptás." }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const { data: link } = await sb.from("portal_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revocado || !link.propuesta_id) return NextResponse.json({ error: "Este link no permite aceptar una propuesta." }, { status: 404 });
  const { data: prop } = await sb.from("propuestas").select("id, cliente, aceptacion, items, metricas, perfil").eq("id", link.propuesta_id).maybeSingle();
  if (!prop) return NextResponse.json({ error: "La propuesta ya no está disponible." }, { status: 404 });
  if (prop.aceptacion) return NextResponse.json({ ok: true, aceptacion: { nombre: prop.aceptacion.nombre, fecha: prop.aceptacion.fecha } });

  const aceptacion = {
    nombre,
    fecha: new Date().toISOString(),
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    dispositivo: (req.headers.get("user-agent") ?? "").slice(0, 200),
    // Copia de lo que aceptó, por si la propuesta se modifica después.
    version: { items: prop.items, metricas: prop.metricas, perfil: prop.perfil },
  };
  const { error } = await sb.from("propuestas").update({ aceptacion }).eq("id", prop.id);
  if (error) return NextResponse.json({ error: "No se pudo registrar. Probá de nuevo en un rato." }, { status: 500 });
  try {
    await enviarPush({ titulo: "Propuesta aceptada ✅", cuerpo: `${nombre} aceptó la propuesta${prop.cliente ? ` de ${prop.cliente}` : ""}.`, url: `/propuestas/${prop.id}`, tag: `acepta-${prop.id}` }, sb);
  } catch { /* el aviso es opcional */ }
  return NextResponse.json({ ok: true, aceptacion: { nombre, fecha: aceptacion.fecha } });
}
