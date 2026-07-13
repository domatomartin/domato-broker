import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePortfolio, portfolioTotals } from "@/lib/calculations";
import { Bond } from "@/lib/types";

// Called once a day by Vercel Cron (see vercel.json) to freeze the day's
// portfolio value into patrimonio_snapshots, powering the Histórico page.
// Uses the service role key since it runs server-side without a logged-in user.

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
  const totals = portfolioTotals(computed);

  // portfolioTotals devuelve un objeto por moneda — sumamos USD como referencia
  const valorTotalUsd = totals["USD"]?.valorTotal ?? 0;

  const { error: insertError } = await supabaseAdmin
    .from("patrimonio_snapshots")
    .upsert(
      {
        fecha: new Date().toISOString().slice(0, 10),
        valor_total: valorTotalUsd,
        efectivo_usd: 0,
        efectivo_uyu: 0,
      },
      { onConflict: "fecha" }
    );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, valor_total: valorTotalUsd, por_moneda: totals });
      }
