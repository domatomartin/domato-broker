import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Datos de solo lectura de una cartera para el portal del cliente.
// El token es la única llave: 32 caracteres aleatorios, revocable desde Clientes.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!/^[a-f0-9]{32}$/.test(token ?? "")) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const { data: link } = await sb.from("portal_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revocado) return NextResponse.json({ error: "Este link no existe o fue desactivado. Pedile uno nuevo a tu asesor." }, { status: 404 });

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
    cliente: link.cliente ?? misProps[0]?.cliente ?? null,
    asesor: misProps[0]?.asesor ?? null,
    cuenta,
    bonds: misBonds,
    propuestas: misProps,
    instrumentos: instrumentos ?? [],
    costos: costos ?? null,
  });
}
