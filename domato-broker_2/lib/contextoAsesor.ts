// Contexto ampliado para el asesor IA: clientes y perfiles, propuestas, seguimiento,
// señales, oportunidades del catálogo (curva soberana y spreads) y novedades.

import type { SupabaseClient } from "@supabase/supabase-js";
import { analizarBono, hoyIso } from "@/lib/bondMath";
import { efectivo, grupoDe, type Instrumento } from "@/lib/bvm";
import { aplicarCostos, irpfDe, nominalNetoParaMonto, normalizarCostos, type Costos } from "@/lib/costos";
import { aUSD, type TasasFx } from "@/lib/fx";
import { cobrosDeCartera, posiciones, resumen, type BondConPropuesta } from "@/lib/estadoCuenta";
import { cumple, describir, valorActual, type Seguido } from "@/lib/seguimiento";
import type { FichaCliente } from "@/lib/perfilInversor";
import type { EstadoSenales } from "@/lib/senales";

const n = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("es-UY", { minimumFractionDigits: d, maximumFractionDigits: d }));
const usd = (v: number) => `US$ ${Math.round(v).toLocaleString("es-UY")}`;

export async function contextoAmpliado(sb: SupabaseClient, tasas: TasasFx): Promise<string> {
  const hoy = hoyIso();
  const enUnAnio = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();
  const [{ data: b }, { data: ins }, { data: cfg }, { data: fichas }, { data: props }, { data: segs }, { data: nov }] = await Promise.all([
    sb.from("bonds").select("*").in("estado", ["activo", "vencido"]),
    sb.from("instrumentos").select("*"),
    sb.from("costos_config").select("*").eq("id", 1).maybeSingle(),
    sb.from("clientes").select("*"),
    sb.from("propuestas").select("id, cliente, cuenta, estado, perfil, metricas, fx_compra, senales_estado, aceptacion, created_at").neq("estado", "descartada"),
    sb.from("seguimiento").select("*"),
    sb.from("novedades").select("*").gte("fecha", new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)).order("fecha", { ascending: false }).limit(10),
  ]);
  const costos: Costos = normalizarCostos(cfg as Partial<Costos> | null);
  const catalogo = ((ins as Instrumento[]) ?? []).filter((i) => !i.oculto);
  const mapa = new Map(((ins as Instrumento[]) ?? []).map((i) => [i.isin, i]));
  const bonds = (b as BondConPropuesta[]) ?? [];
  const fx = Object.fromEntries(((props as { id: string; fx_compra: Record<string, number> | null }[]) ?? []).filter((p) => p.fx_compra).map((p) => [p.id, p.fx_compra!]));
  const fichasL = (fichas as FichaCliente[]) ?? [];
  let ctx = "";

  // ---- Clientes ----
  const cuentas = [...new Set(bonds.map((x) => x.cuenta?.trim()).filter((x): x is string => !!x))];
  ctx += `\n## CLIENTES (${cuentas.length} con cartera)\n`;
  for (const c of cuentas) {
    const bs = bonds.filter((x) => (x.cuenta ?? "").trim() === c);
    const pos = posiciones(bs, costos, mapa, tasas, fx);
    const res = resumen(pos);
    const ficha = fichasL.find((f) => (f.cuenta ?? "").trim() === c);
    const cobros = cobrosDeCartera(bs, costos, mapa).filter((x) => x.fecha > hoy && x.fecha <= enUnAnio);
    const capital = cobros.reduce((s, x) => s + aUSD(x.capital, x.moneda, tasas), 0);
    const p = ficha?.perfil;
    ctx += `- ${ficha?.nombre ?? c} | perfil: ${p ? `${p.riesgo}, objetivo ${p.objetivo}, plazo hasta ${p.plazoMaxAnios} años (test ${p.fecha})` : "SIN TEST DE PERFIL"}`
      + ` | valor ${usd(res.valorUSD)} | resultado ${usd(res.resultadoUSD)} | monedas ${res.porMoneda.map((m) => `${m.moneda} ${m.pctCartera.toFixed(0)}%`).join(", ")}`
      + ` | tipos ${res.porGrupo.map((g) => `${g.clave} ${g.pct.toFixed(0)}%`).join(", ")}`
      + ` | cobros 12m ${usd(cobros.reduce((s, x) => s + aUSD(x.total, x.moneda, tasas), 0))}${capital ? ` (capital que vuelve ${usd(capital)})` : ""}`
      + `${ficha?.notas ? ` | notas: ${ficha.notas.slice(0, 200)}` : ""}\n`;
  }
  const prospectos = fichasL.filter((f) => !f.cuenta || !cuentas.includes(f.cuenta.trim()));
  if (prospectos.length) {
    ctx += `\n## PROSPECTOS (sin cartera todavía)\n`;
    for (const f of prospectos) ctx += `- ${f.nombre} | ${f.perfil ? `perfil ${f.perfil.riesgo}, objetivo ${f.perfil.objetivo}, plazo ${f.perfil.plazoMaxAnios} años` : "sin test"}${f.monto_previsto ? ` | monto previsto ${n(f.monto_previsto, 0)} ${f.moneda ?? "USD"}` : ""}${f.notas ? ` | ${f.notas.slice(0, 150)}` : ""}\n`;
  }

  // ---- Propuestas y señales ----
  type P = { id: string; cliente: string | null; estado: string; perfil: { monto?: number; moneda?: string; riesgo?: string } | null; metricas: { tirNeta?: number | null } | null; senales_estado: EstadoSenales | null; aceptacion: { nombre: string; fecha: string } | null; created_at: string };
  const ps = (props as P[]) ?? [];
  if (ps.length) {
    ctx += `\n## PROPUESTAS\n`;
    for (const p of ps) ctx += `- ${p.cliente || "sin nombre"} | ${p.estado}${p.aceptacion ? ` | ACEPTADA por ${p.aceptacion.nombre} el ${p.aceptacion.fecha.slice(0, 10)}` : ""} | ${n(p.perfil?.monto ?? 0, 0)} ${p.perfil?.moneda ?? ""} | TIR neta ${n(p.metricas?.tirNeta ?? null)}% | creada ${p.created_at.slice(0, 10)}\n`;
    const activas = ps.flatMap((p) => (p.senales_estado?.evaluadas ?? []).filter((s) => s.activa).map((s) => `${p.cliente}: ${s.descripcion} (hoy ${s.valor}) → ${s.accion}`));
    ctx += activas.length ? `\nSEÑALES ACTIVAS:\n${activas.map((x) => `- ${x}`).join("\n")}\n` : `\nSin señales activas en las estrategias.\n`;
  }

  // ---- Lista de seguimiento ----
  const sl = (segs as Seguido[]) ?? [];
  if (sl.length) {
    ctx += `\n## LISTA DE SEGUIMIENTO DEL ASESOR\n`;
    for (const s of sl) {
      const i = mapa.get(s.isin);
      const v = i ? valorActual(i, s.tipo) : null;
      ctx += `- ${i?.nombre ?? s.isin} | avisar si ${describir(s)} | hoy ${n(v)} ${cumple(s, v) ? "(SE CUMPLE)" : ""}\n`;
    }
  }

  // ---- Oportunidades del catálogo: curva soberana y mejores spreads por moneda ----
  type C = { i: Instrumento; tir: number; tirNeta: number; dur: number; grupo: string; variable: boolean };
  const cands: C[] = [];
  for (const i of catalogo) {
    const e = efectivo(i);
    if (e.letra) continue;
    const a = analizarBono({ cupon: e.cupon, frecuencia: e.frecuencia, vencimiento: e.vencimiento, precio: e.variable ? 100 : e.precio, amortizaciones: e.amortizaciones, escalonado: e.escalonado });
    if (!a.completo || a.tir == null || a.duration == null || a.tir > 30 || a.tir < -5) continue;
    const neto = aplicarCostos(a, nominalNetoParaMonto(a, 10000, costos), costos, irpfDe(costos, i));
    cands.push({ i, tir: a.tir, tirNeta: neto?.tirNeta ?? a.tir, dur: a.duration, grupo: grupoDe(i), variable: e.variable });
  }
  ctx += `\n## CATÁLOGO: CURVA SOBERANA Y MEJORES OPCIONES (TIR a precios del vector de hoy)\n`;
  for (const m of ["USD", "UI", "UYU", "UP"]) {
    const sob = cands.filter((c) => c.i.moneda === m && c.grupo === "Uruguay soberano" && !c.variable).sort((a, b) => a.dur - b.dur);
    if (sob.length) ctx += `- Soberanos ${m}: ${sob.map((c) => `dur ${n(c.dur, 1)}→${n(c.tir)}%`).join(", ")}\n`;
    const ref = (d: number) => { const cerca = sob.filter((s) => Math.abs(s.dur - d) < 2); return cerca.length ? cerca.reduce((s, c) => s + c.tir, 0) / cerca.length : null; };
    const top = cands.filter((c) => c.i.moneda === m && !c.variable && c.grupo !== "Uruguay soberano" && (c.grupo !== "Exterior" || c.tirNeta < 10)).sort((a, b) => b.tirNeta - a.tirNeta).slice(0, 6);
    if (top.length) ctx += `  Mejores no soberanos ${m}: ${top.map((c) => { const r = ref(c.dur); return `${c.i.nombre} (${c.grupo}, TIR neta ${n(c.tirNeta)}%, dur ${n(c.dur, 1)}${r != null ? `, +${n(c.tir - r)} pts vs soberano` : ""})`; }).join("; ")}\n`;
  }
  const varb = cands.filter((c) => c.variable);
  if (varb.length) ctx += `- Renta variable (rendimiento estimado desde la par, NO para quien compra hoy por encima de 100): ${varb.map((c) => `${c.i.nombre} ${n(c.tir)}% (precio ${n(efectivo(c.i).precioMercado)})`).join("; ")}\n`;

  const nl = (nov as { fecha: string; tipo: string; texto: string }[]) ?? [];
  if (nl.length) ctx += `\n## NOVEDADES RECIENTES\n${nl.map((x) => `- ${x.fecha} · ${x.tipo}: ${x.texto}`).join("\n")}\n`;

  ctx += `\nCostos del corredor: compra ${costos.comision_compra_pct}%, venta ${costos.comision_venta_pct}%, custodia ${costos.custodia_anual_pct}% anual, IVA ${costos.iva_pct}%. IRPF intereses: soberano ${costos.irpf_soberano_pct}%, ON/fideicomisos ${costos.irpf_privado_pct}%, exterior ${costos.irpf_exterior_pct}%.\n`;
  return ctx;
}
