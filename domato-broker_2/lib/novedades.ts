import { BVM_VECTOR_URL, parseVector, type InstrumentoBvm } from "@/lib/bvm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, enviarPush } from "@/lib/push";

// Cron diario (antes de abrir): actualiza precios del catálogo con el vector del día,
// agrega los títulos nuevos que aparecen en el vector y avisa por push de novedades
// (nuevas emisiones y comunicados nuevos de la BVM).


const UA = { Accept: "text/html,*/*", "User-Agent": "Mozilla/5.0 (compatible; DoMatoBroker/1.0)" };

async function comunicadosBvm(): Promise<{ fecha: string; titulo: string }[]> {
  const r = await fetch("https://www.bvm.com.uy/comunicados", { headers: UA, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return [];
  const texto = (await r.text()).replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ");
  const out: { fecha: string; titulo: string }[] = [];
  for (const m of texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*([^\n]{4,200})/g)) out.push({ fecha: `${m[3]}-${m[2]}-${m[1]}`, titulo: m[4].trim() });
  return out.slice(0, 60);
}

export async function correrNovedades(sb: SupabaseClient = admin()) {
  const resultado: Record<string, unknown> = {};

  // 1) Vector del día: precios y títulos nuevos.
  let nuevos: InstrumentoBvm[] = [];
  try {
    const r = await fetch(BVM_VECTOR_URL, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`BVM HTTP ${r.status}`);
    const vector = parseVector(await r.text(), null);
    const { data: existentes } = await sb.from("instrumentos").select("isin");
    const ya = new Set((existentes ?? []).map((x) => x.isin as string));
    // "Nuevo" = no estaba en el vector de días anteriores ni en el catálogo. La primera corrida solo aprende.
    const { data: vv } = await sb.from("app_config").select("valor").eq("clave", "vector_vistos").maybeSingle();
    const vistosVector = vv ? new Set<string>(vv.valor as string[]) : null;
    nuevos = vistosVector ? vector.filter((v) => !ya.has(v.isin) && !vistosVector.has(v.isin) && v.nombre && v.nombre !== v.isin) : [];
    await sb.from("app_config").upsert({ clave: "vector_vistos", valor: [...new Set([...(vistosVector ?? []), ...vector.map((v) => v.isin)])], actualizado: new Date().toISOString() }, { onConflict: "clave" });
    const precios = vector.filter((v) => ya.has(v.isin) && v.precio != null).map((v) => ({ isin: v.isin, precio: v.precio, cupon_corrido: v.cupon_corrido, fecha_precio: v.fecha_precio }));
    for (let i = 0; i < precios.length; i += 200) await sb.from("instrumentos").upsert(precios.slice(i, i + 200), { onConflict: "isin" });
    if (nuevos.length) await sb.from("instrumentos").insert(nuevos);
    resultado.precios = precios.length;
    resultado.nuevos = nuevos.map((n) => `${n.isin} ${n.nombre}`);
  } catch (e) {
    resultado.errorVector = e instanceof Error ? e.message : String(e);
  }

  // 2) Comunicados nuevos de la BVM (se recuerdan los ya vistos para avisar una sola vez).
  let comNuevos: { fecha: string; titulo: string }[] = [];
  try {
    const lista = await comunicadosBvm();
    const { data: cfg } = await sb.from("app_config").select("valor").eq("clave", "comunicados_vistos").maybeSingle();
    const vistos = new Set<string>((cfg?.valor as string[] | undefined) ?? []);
    const primeraVez = !cfg;
    comNuevos = lista.filter((c) => !vistos.has(`${c.fecha}|${c.titulo}`));
    await sb.from("app_config").upsert({ clave: "comunicados_vistos", valor: lista.map((c) => `${c.fecha}|${c.titulo}`), actualizado: new Date().toISOString() }, { onConflict: "clave" });
    if (primeraVez) comNuevos = []; // la primera corrida solo aprende lo que ya existe
    resultado.comunicados = comNuevos;
  } catch (e) {
    resultado.errorComunicados = e instanceof Error ? e.message : String(e);
  }

  // 3) Aviso al celular.
  const partes: string[] = [];
  if (nuevos.length) partes.push(`${nuevos.length} título${nuevos.length === 1 ? "" : "s"} nuevo${nuevos.length === 1 ? "" : "s"} en la BVM: ${nuevos.slice(0, 3).map((n) => n.nombre || n.isin).join(", ")}${nuevos.length > 3 ? "…" : ""}`);
  if (comNuevos.length) partes.push(`Comunicado BVM: ${comNuevos[0].titulo}${comNuevos.length > 1 ? ` (+${comNuevos.length - 1})` : ""}`);
  if (partes.length) {
    try {
      resultado.push = await enviarPush({ titulo: "Novedades del mercado", cuerpo: partes.join(" · "), url: nuevos.length ? "/opciones" : "/alertas", tag: "novedades" }, sb);
    } catch { /* sin push no pasa nada */ }
  }
  return resultado;
}
