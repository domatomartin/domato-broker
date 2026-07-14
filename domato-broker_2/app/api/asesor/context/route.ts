import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────────────

interface Bond {
  nombre: string;
  isin: string | null;
  moneda: string;
  cantidad: number;
  valor_nominal: number;
  precio_actual: number;
  precio_compra: number;
  cupon: number | null;
  frecuencia: number | null;
  proximo_pago_interes: string | null;
  proximo_vencimiento: string | null;
  cuenta: string | null;
}

interface Tasas {
  UYU_per_USD: number;
  ARS_per_USD: number;
  UI_in_UYU: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toUSD(valor: number, moneda: string, tasas: Tasas): number {
  switch (moneda) {
    case "USD": return valor;
    case "UYU": return valor / tasas.UYU_per_USD;
    case "UI":  return (valor * tasas.UI_in_UYU) / tasas.UYU_per_USD;
    case "ARS": return valor / tasas.ARS_per_USD;
    default:    return valor;
  }
}

function valorMercado(b: Bond): number {
  return (b.precio_actual / 100) * b.valor_nominal * b.cantidad;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number, dec = 2): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET() {
  // Use service role key server-side so RLS doesn't block the read.
  // Falls back to publishable key if service role is not configured.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  // 1. Fetch bonds
  const { data: bonds, error } = await supabase
    .from("bonds")
    .select("nombre,isin,moneda,cantidad,valor_nominal,precio_actual,precio_compra,cupon,frecuencia,proximo_pago_interes,proximo_vencimiento,cuenta")
    .eq("estado", "activo")
    .order("moneda");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Fetch FX rates from internal route
  // In Vercel: VERCEL_URL is set automatically (no protocol). In dev: localhost.
  let tasas: Tasas = { UYU_per_USD: 40.1, ARS_per_USD: 1485, UI_in_UYU: 6.6026 };
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const cotRes = await fetch(`${baseUrl}/api/cotizaciones`, {
      signal: AbortSignal.timeout(5000),
    });
    if (cotRes.ok) tasas = await cotRes.json();
  } catch { /* use fallback */ }

  // 3. Totals by currency + USD equivalent
  const byMoneda: Record<string, { valorTotal: number; costoTotal: number; usdTotal: number }> = {};
  let totalUSD = 0;
  let totalCostoUSD = 0;

  for (const b of bonds as Bond[]) {
    const vm = valorMercado(b);
    const costo = (b.precio_compra / 100) * b.valor_nominal * b.cantidad;
    const vmUSD = toUSD(vm, b.moneda, tasas);
    const costoUSD = toUSD(costo, b.moneda, tasas);

    if (!byMoneda[b.moneda]) byMoneda[b.moneda] = { valorTotal: 0, costoTotal: 0, usdTotal: 0 };
    byMoneda[b.moneda].valorTotal += vm;
    byMoneda[b.moneda].costoTotal += costo;
    byMoneda[b.moneda].usdTotal   += vmUSD;
    totalUSD      += vmUSD;
    totalCostoUSD += costoUSD;
  }

  const gananciaUSD = totalUSD - totalCostoUSD;
  const rentabilidad = totalCostoUSD > 0 ? (gananciaUSD / totalCostoUSD) * 100 : 0;

  // 4. Upcoming coupon payments (next 90 days)
  const hoy = new Date();
  const limite = new Date(hoy.getTime() + 90 * 86400000);
  const proximosCupones = (bonds as Bond[])
    .filter(b => b.proximo_pago_interes && b.cupon && b.cupon > 0)
    .map(b => {
      const freq = b.frecuencia && b.frecuencia > 0 ? b.frecuencia : 2;
      const tasaPeriodo = (b.cupon! / 100) / freq;
      const cobro = tasaPeriodo * b.valor_nominal * b.cantidad;
      const cobroUSD = toUSD(cobro, b.moneda, tasas);
      return {
        nombre: b.nombre,
        fecha: b.proximo_pago_interes!,
        cobro,
        cobroUSD,
        moneda: b.moneda,
        dias: daysUntil(b.proximo_pago_interes!),
      };
    })
    .filter(c => c.dias >= 0 && new Date(c.fecha) <= limite)
    .sort((a, b) => a.dias - b.dias);

  const totalCupones90dUSD = proximosCupones.reduce((s, c) => s + c.cobroUSD, 0);

  // 5. Build context text
  const hoyStr = hoy.toLocaleDateString("es-UY", { day: "2-digit", month: "long", year: "numeric" });

  let ctx = `=== CONTEXTO DE CARTERA — ${hoyStr} ===\n\n`;

  ctx += `## RESUMEN GENERAL\n`;
  ctx += `- Total cartera (equiv. USD): ${fmtUSD(totalUSD)}\n`;
  ctx += `- Costo de adquisición (equiv. USD): ${fmtUSD(totalCostoUSD)}\n`;
  ctx += `- Ganancia/Pérdida: ${fmtUSD(gananciaUSD)} (${gananciaUSD >= 0 ? "+" : ""}${fmtNum(rentabilidad)}%)\n`;
  ctx += `- Cantidad de instrumentos activos: ${(bonds as Bond[]).length}\n\n`;

  ctx += `## TOTALES POR MONEDA\n`;
  for (const [moneda, t] of Object.entries(byMoneda)) {
    ctx += `- ${moneda}: ${fmtNum(t.valorTotal, 0)} (≈ ${fmtUSD(t.usdTotal)})\n`;
  }
  ctx += `\n`;

  ctx += `## INSTRUMENTOS EN CARTERA\n`;
  for (const b of bonds as Bond[]) {
    const vm = valorMercado(b);
    const vmUSD = toUSD(vm, b.moneda, tasas);
    const pct = b.precio_compra > 0 ? ((b.precio_actual - b.precio_compra) / b.precio_compra * 100) : 0;
    ctx += `- ${b.nombre}`;
    if (b.isin) ctx += ` (ISIN: ${b.isin})`;
    ctx += ` | ${b.moneda} | Nominal: ${fmtNum(b.valor_nominal * b.cantidad, 0)}`;
    ctx += ` | Precio: ${fmtNum(b.precio_actual)}% (${pct >= 0 ? "+" : ""}${fmtNum(pct)}% vs compra)`;
    ctx += ` | Val.mercado: ${fmtUSD(vmUSD)}`;
    if (b.cupon) ctx += ` | Cupón: ${fmtNum(b.cupon)}% ${b.frecuencia === 1 ? "anual" : b.frecuencia === 4 ? "trimestral" : b.frecuencia === 12 ? "mensual" : "semestral"}`;
    if (b.proximo_vencimiento) ctx += ` | Vto: ${b.proximo_vencimiento}`;
    ctx += `\n`;
  }
  ctx += `\n`;

  if (proximosCupones.length > 0) {
    ctx += `## PRÓXIMOS CUPONES (90 días) — total: ${fmtUSD(totalCupones90dUSD)}\n`;
    for (const c of proximosCupones) {
      ctx += `- ${c.fecha} (+${c.dias}d): ${c.nombre} → ${fmtNum(c.cobro, 0)} ${c.moneda} (${fmtUSD(c.cobroUSD)})\n`;
    }
    ctx += `\n`;
  } else {
    ctx += `## PRÓXIMOS CUPONES (90 días)\n- Sin cobros programados en los próximos 90 días.\n\n`;
  }

  ctx += `## TASAS DE CAMBIO USADAS\n`;
  ctx += `- 1 USD = ${fmtNum(tasas.UYU_per_USD)} UYU\n`;
  ctx += `- 1 UI  = ${fmtNum(tasas.UI_in_UYU)} UYU\n`;
  ctx += `- 1 USD = ${fmtNum(tasas.ARS_per_USD, 0)} ARS\n`;

  return NextResponse.json({ context: ctx, bonds, totales: byMoneda, totalUSD, proximosCupones });
    }
