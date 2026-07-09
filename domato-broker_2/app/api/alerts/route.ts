import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePortfolio } from "@/lib/calculations";
import { Bond } from "@/lib/types";
import { computeBondAlerts } from "@/lib/alerts";

// Pensado para un cron diario (ver vercel.json): calcula las alertas de
// cupones/vencimientos/rendimiento y, si están configuradas las variables
// RESEND_API_KEY y ALERT_EMAIL_TO, además las manda por email. Si no están
// configuradas, simplemente devuelve el JSON — igual que el patrón de
// FRED_API_KEY para Mercados.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
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

  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;

  if (resendKey && emailTo && alerts.length > 0) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Domato Broker <alertas@resend.dev>",
          to: emailTo,
          subject: `${alerts.length} alerta(s) en tu cartera — Domato Broker`,
          html: `<ul>${alerts.map((a) => `<li>${a.mensaje}</li>`).join("")}</ul>`,
        }),
      });
    } catch {
      // No bloqueamos la respuesta si el email falla; las alertas ya están calculadas.
    }
  }

  return NextResponse.json({ alerts, emailed: Boolean(resendKey && emailTo) });
}
