import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePortfolio, portfolioTotals } from "@/lib/calculations";
import { Bond } from "@/lib/types";

// POST { action: "reset" }     → borra todo el historial e inserta snapshot de hoy
// POST { action: "historico", fecha: "YYYY-MM-DD", valor_total: number }
//                              → upserta un cierre histórico manual

const FALLBACK_TASAS = { UYU_per_USD: 40.1, ARS_per_USD: 1485, UI_in_UYU: 6.6026 };

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
  } catch { /* usar fallback */ }
  return FALLBACK_TASAS;
}

function toUSD(valor: number, moneda: string, tasas: typeof FALLBACK_TASAS): number {
  if (moneda === "UYU") return valor / tasas.UYU_per_USD;
  if (moneda === "UI") return (valor * tasas.UI_in_UYU) / tasas.UYU_per_USD;
  if (moneda === "ARS") return valor / tasas.ARS_per_USD;
  return valor;
}

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  // --- Cargar cierre histórico manual ---
  if (body.action === "historico") {
    const { fecha, valor_total } = body as { fecha: string; valor_total: number };
    if (!fecha || !valor_total) {
      return NextResponse.json({ error: "Faltan fecha o valor_total" }, { status: 400 });
    }
    const { error } = await supabase
      .from("patrimonio_snapshots")
      .upsert({ fecha, valor_total: Math.round(valor_total), efectivo_usd: 0, efectivo_uyu: 0 }, { onConflict: "fecha" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, accion: "historico", fecha, valor_total });
  }

  // --- Reiniciar historial ---
  if (body.action === "reset") {
    // 1. Borrar todo el historial
    const { error: delError } = await supabase
      .from("patrimonio_snapshots")
      .delete()
      .gte("fecha", "1900-01-01");
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    // 2. Calcular valor actual de cartera en USD
    const { data: bonds, error: bondsError } = await supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo");
    if (bondsError) return NextResponse.json({ error: bondsError.message }, { status: 500 });

    const computed = computePortfolio((bonds as Bond[]) ?? []);
    const totals = portfolioTotals(computed);
    const tasas = await fetchTasas();
    const valorTotalUsd = Object.entries(totals).reduce(
      (sum, [moneda, t]) => sum + toUSD(t.valorTotal, moneda, tasas),
      0
    );

    // 3. Insertar snapshot de hoy
    const hoy = new Date().toISOString().slice(0, 10);
    const { error: insError } = await supabase
      .from("patrimonio_snapshots")
      .insert({ fecha: hoy, valor_total: Math.round(valorTotalUsd), efectivo_usd: 0, efectivo_uyu: 0 });
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });

    return NextResponse.json({ ok: true, accion: "reset", fecha: hoy, valor_total: valorTotalUsd, tasas });
  }

  return NextResponse.json({ error: "action inválida (usar reset | historico)" }, { status: 400 });
}
