import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface Bond {
  nombre: string; isin: string | null; moneda: string; cantidad: number;
  valor_nominal: number; precio_actual: number; precio_compra: number;
  cupon: number | null; frecuencia: number | null;
  proximo_pago_interes: string | null; proximo_vencimiento: string | null;
  cuenta: string | null;
}
interface Tasas { UYU_per_USD: number; ARS_per_USD: number; UI_in_UYU: number; }

function toUSD(v: number, m: string, t: Tasas): number {
  if (m === "USD") return v;
  if (m === "UYU") return v / t.UYU_per_USD;
  if (m === "UI")  return (v * t.UI_in_UYU) / t.UYU_per_USD;
  if (m === "ARS") return v / t.ARS_per_USD;
  return v;
}
function calcVM(b: Bond) { return (b.precio_actual / 100) * b.valor_nominal * b.cantidad; }
function daysUntil(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); }
function fmtUSD(n: number) { return new Intl.NumberFormat("es-UY",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n); }
function fmtN(n: number, d=2) { return n.toLocaleString("es-UY",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function tirSimple(b: Bond): number | null {
  if (!b.cupon || b.cupon <= 0 || !b.precio_actual || b.precio_actual <= 0) return null;
  return (b.cupon / b.precio_actual) * 100;
}
function parLabel(p: number): string {
  if (p > 100.5) return "sobre la par";
  if (p < 99.5)  return "bajo la par";
  return "a la par";
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: bonds, error } = await supabase
    .from("bonds")
    .select("nombre,isin,moneda,cantidad,valor_nominal,precio_actual,precio_compra,cupon,frecuencia,proximo_pago_interes,proximo_vencimiento,cuenta")
    .eq("estado","activo").order("moneda");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let tasas: Tasas = { UYU_per_USD: 43.5, ARS_per_USD: 1100, UI_in_UYU: 6.2 };
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    const r = await fetch(`${base}/api/cotizaciones`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) tasas = await r.json();
  } catch { /* fallback */ }

  const byMoneda: Record<string,{valorTotal:number;costoTotal:number;usdTotal:number}> = {};
  let totalUSD = 0, totalCostoUSD = 0;
  for (const b of bonds as Bond[]) {
    const v = calcVM(b), c = (b.precio_compra/100)*b.valor_nominal*b.cantidad;
    const vU = toUSD(v,b.moneda,tasas), cU = toUSD(c,b.moneda,tasas);
    if (!byMoneda[b.moneda]) byMoneda[b.moneda]={valorTotal:0,costoTotal:0,usdTotal:0};
    byMoneda[b.moneda].valorTotal+=v; byMoneda[b.moneda].costoTotal+=c; byMoneda[b.moneda].usdTotal+=vU;
    totalUSD+=vU; totalCostoUSD+=cU;
  }
  const ganancia = totalUSD - totalCostoUSD;
  const rent = totalCostoUSD > 0 ? (ganancia/totalCostoUSD)*100 : 0;

  // #22 — Concentración: bonos >15% del total
  const concentrados = (bonds as Bond[])
    .map(b => {
      const vU = toUSD(calcVM(b), b.moneda, tasas);
      const pct = totalUSD > 0 ? (vU / totalUSD) * 100 : 0;
      return { nombre: b.nombre, pct };
    })
    .filter(x => x.pct > 15)
    .sort((a, b) => b.pct - a.pct);

  const limite = new Date(Date.now() + 90*86400000);
  const proxCupones = (bonds as Bond[])
    .filter(b => b.proximo_pago_interes && b.cupon && b.cupon > 0)
    .map(b => {
      const freq = b.frecuencia && b.frecuencia > 0 ? b.frecuencia : 2;
      const cobro = ((b.cupon!/100)/freq)*b.valor_nominal*b.cantidad;
      return { nombre:b.nombre, fecha:b.proximo_pago_interes!, cobro, cobroUSD:toUSD(cobro,b.moneda,tasas), moneda:b.moneda, dias:daysUntil(b.proximo_pago_interes!) };
    })
    .filter(c => c.dias >= 0 && new Date(c.fecha) <= limite)
    .sort((a,b)=>a.dias-b.dias);
  const totalCup90 = proxCupones.reduce((s,c)=>s+c.cobroUSD,0);

  const hoy = new Date();
  const hoyStr = hoy.toLocaleDateString("es-UY",{day:"2-digit",month:"long",year:"numeric"});
  let ctx = `=== CONTEXTO DE CARTERA — ${hoyStr} ===\n\n`;

  // #22 — Alertas de concentración al inicio
  for (const c of concentrados)
    ctx += `⚠️ CONCENTRACIÓN: ${c.nombre} = ${fmtN(c.pct)}% del portafolio\n`;
  if (concentrados.length > 0) ctx += `\n`;

  ctx += `## RESUMEN GENERAL\n`;
  ctx += `- Total (equiv. USD): ${fmtUSD(totalUSD)}\n`;
  ctx += `- Costo adquisición: ${fmtUSD(totalCostoUSD)}\n`;
  ctx += `- Ganancia/Pérdida: ${fmtUSD(ganancia)} (${ganancia>=0?"+":""}${fmtN(rent)}%)\n`;
  ctx += `- Instrumentos activos: ${(bonds as Bond[]).length}\n\n`;

  ctx += `## TOTALES POR MONEDA\n`;
  for (const [mon,t] of Object.entries(byMoneda))
    ctx += `- ${mon}: ${fmtN(t.valorTotal,0)} (≈ ${fmtUSD(t.usdTotal)})\n`;

  ctx += `\n## INSTRUMENTOS EN CARTERA\n`;
  for (const b of bonds as Bond[]) {
    const vU = toUSD(calcVM(b),b.moneda,tasas);
    const pct = b.precio_compra>0?((b.precio_actual-b.precio_compra)/b.precio_compra*100):0;
    const tir = tirSimple(b);
    const par = parLabel(b.precio_actual);
    const freq = b.frecuencia===1?"anual":b.frecuencia===4?"trimestral":b.frecuencia===12?"mensual":"semestral";
    ctx += `- ${b.nombre}${b.isin?" ("+b.isin+")":""} | ${b.moneda} | ${fmtN(b.valor_nominal*b.cantidad,0)} nominal | precio:${fmtN(b.precio_actual)}% (${par}) | ${fmtUSD(vU)}`;
    if (pct!==0) ctx += ` | vs.compra:${pct>=0?"+":""}${fmtN(pct)}%`;
    if (b.cupon) ctx += ` | cupón:${fmtN(b.cupon)}% ${freq}`;
    if (tir!==null) ctx += ` | TIR:${fmtN(tir)}%`;
    if (b.proximo_vencimiento) ctx += ` | vto:${b.proximo_vencimiento}`;
    ctx += `\n`;
  }

  if (proxCupones.length>0) {
    ctx += `\n## PRÓXIMOS CUPONES 90d — ${fmtUSD(totalCup90)}\n`;
    for (const c of proxCupones)
      ctx += `- ${c.fecha} (+${c.dias}d): ${c.nombre} ${fmtN(c.cobro,0)} ${c.moneda} (${fmtUSD(c.cobroUSD)})\n`;
  }

  ctx += `\n## TASAS: 1 USD=${fmtN(tasas.UYU_per_USD)}UYU | 1 UI=${fmtN(tasas.UI_in_UYU)}UYU | 1 USD=${fmtN(tasas.ARS_per_USD,0)}ARS\n`;

  // #21 — Exposición por moneda al final
  ctx += `\n## EXPOSICIÓN POR MONEDA\n`;
  ctx += Object.entries(byMoneda)
    .sort((a,b) => b[1].usdTotal - a[1].usdTotal)
    .map(([mon,t]) => `${mon} ${fmtUSD(t.usdTotal)} (${fmtN(totalUSD>0?t.usdTotal/totalUSD*100:0,0)}%)`)
    .join(' | ') + '\n';

  return NextResponse.json({ context:ctx, bonds, totales:byMoneda, totalUSD, proximosCupones:proxCupones });
           }
