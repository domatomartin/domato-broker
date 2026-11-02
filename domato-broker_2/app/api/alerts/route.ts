import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autorizadoCronOUsuario } from "@/lib/authServer";
import { computePortfolio } from "@/lib/calculations";
import { Bond } from "@/lib/types";
import { computeBondAlerts } from "@/lib/alerts";
import { fotoMercado } from "@/lib/mercado";
import { evaluarSenales, type EstadoSenales, type Senal, type SenalEvaluada } from "@/lib/senales";
import { enviarPush } from "@/lib/push";
import { efectivo, type Instrumento } from "@/lib/bvm";

export const maxDuration = 60;

type AlertaCliente = { propuestaId: string; cliente: string; cuenta: string | null; senal: SenalEvaluada };

// Pensado para un cron diario (ver vercel.json): calcula las alertas de
// cupones/vencimientos/rendimiento y, si están configuradas las variables
// RESEND_API_KEY y ALERT_EMAIL_TO, además las manda por email. Si no están
// configuradas, simplemente devuelve el JSON — igual que el patrón de
// FRED_API_KEY para Mercados.

export async function GET(request: Request) {
  // Antes quedaba abierta si no había CRON_SECRET: ahora exige el secreto del cron o un usuario logueado.
  if (!(await autorizadoCronOUsuario(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  const { data: bonds, error } = await supabaseAdmin
    .from("bonds")
    .select("*")
    .eq("estado", "activo");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const computed = computePortfolio((bonds as Bond[]) ?? []);
  const alerts = computeBondAlerts(computed);

  // Señales de la estrategia de cada cliente: se evalúan con el mercado y los precios de hoy.
  const sinEmail = new URL(request.url).searchParams.get("sinEmail") === "1";
  const clientes: AlertaCliente[] = [];
  const nuevas: AlertaCliente[] = []; // señales que se activaron hoy (no estaban activas en la evaluación anterior)
  const { data: props } = await supabaseAdmin
    .from("propuestas")
    .select("id, cliente, cuenta, estado, senales, senales_estado")
    .in("estado", ["ejecutada", "presentada"])
    .not("senales", "is", null);
  if (props?.length) {
    const foto = await fotoMercado();
    const isins = [...new Set(props.flatMap((p) => ((p.senales as Senal[]) ?? []).filter((x) => x.indicador.startsWith("PRECIO:")).map((x) => x.indicador.slice(7))))];
    const precios: Record<string, number | null> = {};
    if (isins.length) {
      const { data: ins } = await supabaseAdmin.from("instrumentos").select("*").in("isin", isins);
      for (const i of (ins as Instrumento[]) ?? []) precios[i.isin] = efectivo(i).precio ?? null;
    }
    const ahora = new Date().toISOString();
    for (const p of props) {
      const evaluadas = evaluarSenales((p.senales as Senal[]) ?? [], foto, precios);
      await supabaseAdmin.from("propuestas").update({ senales_estado: { fecha: ahora, evaluadas } }).eq("id", p.id);
      const antes = new Set(((p.senales_estado as EstadoSenales | null)?.evaluadas ?? []).filter((x) => x.activa).map((x) => `${x.indicador}|${x.condicion}|${x.umbral}`));
      for (const senal of evaluadas.filter((x) => x.activa)) {
        const a = { propuestaId: p.id, cliente: p.cliente ?? "", cuenta: p.cuenta, senal };
        clientes.push(a);
        if (!antes.has(`${senal.indicador}|${senal.condicion}|${senal.umbral}`)) nuevas.push(a);
      }
    }
  }

  // Aviso al celular solo por las señales nuevas, para no repetir lo mismo todos los días.
  let push: Awaited<ReturnType<typeof enviarPush>> | null = null;
  if (nuevas.length) {
    try {
      const primera = nuevas[0];
      push = await enviarPush({
        titulo: nuevas.length === 1 ? `Señal activada · ${primera.cliente || primera.cuenta || "cliente"}` : `${nuevas.length} señales nuevas en estrategias de clientes`,
        cuerpo: nuevas.length === 1 ? `${primera.senal.descripcion} (hoy ${primera.senal.valor}). ${primera.senal.accion}` : nuevas.slice(0, 3).map((x) => `${x.cliente || x.cuenta}: ${x.senal.descripcion}`).join(" · "),
        url: nuevas.length === 1 ? `/propuestas/${primera.propuestaId}` : "/alertas",
        tag: "senales",
      }, supabaseAdmin);
    } catch { /* el push no debe frenar las alertas */ }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;

  if (!sinEmail && resendKey && emailTo && (alerts.length > 0 || clientes.length > 0)) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Domato Broker <onboarding@resend.dev>",
          to: emailTo,
          subject: `${clientes.length ? `${clientes.length} señal(es) de clientes · ` : ""}${alerts.length} alerta(s) — Domato Broker`,
          html:
            (clientes.length
              ? `<h3>Señales activadas en estrategias de clientes</h3><ul>${clientes.map((c) => `<li><b>${c.cliente || c.cuenta}</b>: ${c.senal.descripcion} (hoy ${c.senal.valor}) → ${c.senal.accion}</li>`).join("")}</ul>`
              : "") + (alerts.length ? `<h3>Alertas de cartera</h3><ul>${alerts.map((a) => `<li>${a.mensaje}</li>`).join("")}</ul>` : ""),
        }),
      });
    } catch {
      // No bloqueamos la respuesta si el email falla; las alertas ya están calculadas.
    }
  }

  return NextResponse.json({ alerts, clientes, nuevas: nuevas.length, push, emailed: !sinEmail && Boolean(resendKey && emailTo) });
}
