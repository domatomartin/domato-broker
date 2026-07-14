import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePortfolio, portfolioTotals } from "@/lib/calculations";
import { Bond } from "@/lib/types";

// Called once a day by Vercel Cron (see vercel.json) to freeze the day's
// portfolio value into patrimonio_snapshots, powering the Histórico page.

const FALLBACK_TASAS = {
  UYU_per_USD: 40.1,
  ARS_per_USD: 1485,
  UI_in_UYU: 6.6026, // actualizar mensualmente desde BCU/INE
};

async function fetchTasas() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "success") {
        return {
          UYU_per_USD: data.rates?.UYU ?? FALLBACK_TASAS.UYU_per_USD,
          ARS_per_USD: data.rates?.ARS ?? FALLBACK_TASAS.ARS_per_USD,
          UI_in_UYU: FALLBACK_TASAS.UI_in_UYU,
        };
      }
    }
  } catch {
    // usar fallback
  }
  return FALLBACK_TASAS;
}

function toUSD(valor: number, moneda: string, tasas: typeof FALLBACK_TASAS): number {
  if (moneda === "UYU") return valor / tasas.UYU_per_USD;
  if (moneda === "UI") return (valor * tasas.UI_in_UYU) / tasas.UYU_per_USD;
  if (moneda === "ARS") return valor / tasas.ARS_per_USD;
  return valor; // USD u otras
}

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const computed = computePortfolio((bonds as Bond[]) ?? []);
  const totals = portfolioTotals(computed);
  const tasas = await fetchTasas();

  // Convertir cada moneda a USD y sumar
  const valorTotalUsd = Object.entries(totals).reduce(
    (sum, [moneda, t]) => sum + toUSD(t.valorTotal, moneda, tasas),
    0
  );

  const { error: upsertError } = await supabaseAdmin
    .from("patrimonio_snapshots")
    .upsert(
      {
        fecha: new Date().toISOString().slice(0, 10),
        valor_total: Math.round(valorTotalUsd),
        efectivo_usd: 0,
        efectivo_uyu: 0,
      },
      { onConflict: "fecha" }
    );

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, valor_total: valorTotalUsd, por_moneda: totals, tasas });
}
