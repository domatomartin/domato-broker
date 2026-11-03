import { aUSD, type TasasFx } from "@/lib/fx";
import { valorUI } from "@/lib/bcu";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autorizadoCronOUsuario } from "@/lib/authServer";
import { computePortfolio, portfolioTotals } from "@/lib/calculations";
import { Bond } from "@/lib/types";
import { posiciones, type BondConPropuesta } from "@/lib/estadoCuenta";
import { normalizarCostos, type Costos } from "@/lib/costos";
import type { Instrumento } from "@/lib/bvm";

// Called once a day by Vercel Cron (see vercel.json) to freeze the day's
// portfolio value into patrimonio_snapshots, powering the Histórico page.

const FALLBACK_TASAS = {
  UYU_per_USD: 40.1,
  ARS_per_USD: 1485,
  UI_in_UYU: 6.6026, // actualizar mensualmente desde BCU/INE
};

async function fetchTasas(): Promise<TasasFx> {
  return { ...(await fetchTasasBase()), UI_in_UYU: (await valorUI()).valor };
}

async function fetchTasasBase(): Promise<TasasFx> {
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
          EUR_per_USD: data.rates?.EUR,
          BRL_per_USD: data.rates?.BRL,
        };
      }
    }
  } catch {
    // usar fallback
  }
  return FALLBACK_TASAS;
}

function toUSD(valor: number, moneda: string, tasas: TasasFx): number {
  return aUSD(valor, moneda, tasas);
}

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const computed = computePortfolio((bonds as Bond[]) ?? []);
  const totals = portfolioTotals(computed);
  const tasas = await fetchTasas();

  // Mismo valor que Clientes y Estado de cuenta: precio + cupón corrido de cada título.
  const isins = [...new Set(((bonds as Bond[]) ?? []).map((b) => b.isin).filter((x): x is string => !!x))];
  const [{ data: ins }, { data: cfg }] = await Promise.all([
    isins.length ? supabaseAdmin.from("instrumentos").select("*").in("isin", isins) : Promise.resolve({ data: [] }),
    supabaseAdmin.from("costos_config").select("*").eq("id", 1).maybeSingle(),
  ]);
  const pos = posiciones((bonds as BondConPropuesta[]) ?? [], normalizarCostos(cfg as Partial<Costos> | null), new Map(((ins as Instrumento[]) ?? []).map((i) => [i.isin, i])), tasas, {});
  let valorTotalUsd = pos.reduce((sum, p) => sum + p.valorHoy * p.fxHoy, 0);
  if (!pos.length) valorTotalUsd = Object.entries(totals).reduce((sum, [moneda, t]) => sum + toUSD(t.valorTotal, moneda, tasas), 0);

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
