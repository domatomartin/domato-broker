import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autorizadoCronOUsuario } from "@/lib/authServer";
import { computePortfolio } from "@/lib/calculations";
import { Bond } from "@/lib/types";
import { computeBondAlerts } from "@/lib/alerts";
import { fotoMercado } from "@/lib/mercado";
import { evaluarSenales, type EstadoSenales, type Senal, type SenalEvaluada } from "@/lib/senales";
import { enviarPush } from "@/lib/push";
import { correrNovedades } from "@/lib/novedades";
import { cumple, describir, valorActual, type Seguido } from "@/lib/seguimiento";
import { cobrosDeCartera, type BondConPropuesta } from "@/lib/estadoCuenta";
import { normalizarCostos, type Costos } from "@/lib/costos";
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

  // Primero, novedades del día: precios del vector, títulos nuevos y comunicados (solo en la corrida diaria).
  const sinEmailFlag = new URL(request.url).searchParams.get("sinEmail") === "1";
  let novedades: Awaited<ReturnType<typeof correrNovedades>> | null = null;
  if (!sinEmailFlag) { try { novedades = await correrNovedades(supabaseAdmin); } catch { /* sigue */ } }

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

  // Lista de seguimiento: avisa cuando un título cruza la TIR o el precio marcado (una vez por cruce).
  const seguidosDisparados: { isin: string; nombre: string; texto: string }[] = [];
  try {
    const { data: segs } = await supabaseAdmin.from("seguimiento").select("*");
    if (segs?.length) {
      const { data: insSeg } = await supabaseAdmin.from("instrumentos").select("*").in("isin", segs.map((x) => x.isin));
      const mapa = new Map(((insSeg as Instrumento[]) ?? []).map((i) => [i.isin, i]));
      for (const sg of segs as Seguido[]) {
        const ins = mapa.get(sg.isin);
        if (!ins) continue;
        const v = valorActual(ins, sg.tipo);
        const ahoraCumple = cumple(sg, v);
        if (ahoraCumple && !sg.disparada) seguidosDisparados.push({ isin: sg.isin, nombre: ins.nombre, texto: `${describir(sg)} (hoy ${v != null ? v.toFixed(2) : "—"}${sg.tipo === "tir" ? "%" : ""})` });
        await supabaseAdmin.from("seguimiento").update({ disparada: ahoraCumple, valor: v, ultima_revision: new Date().toISOString() }).eq("isin", sg.isin);
      }
      if (seguidosDisparados.length) {
        const p0 = seguidosDisparados[0];
        await enviarPush({
          titulo: seguidosDisparados.length === 1 ? `Seguimiento · ${p0.nombre}` : `${seguidosDisparados.length} títulos de tu lista cruzaron el nivel marcado`,
          cuerpo: seguidosDisparados.length === 1 ? p0.texto : seguidosDisparados.slice(0, 3).map((x) => `${x.nombre}: ${x.texto}`).join(" · "),
          url: "/seguimiento",
          tag: "seguimiento",
        }, supabaseAdmin);
      }
    }
  } catch { /* no frena las alertas */ }

  // Recordatorio: reuniones de hoy (solo en la corrida diaria de las 9).
  let reunionesHoy = 0;
  if (!sinEmail) {
    try {
      const ini = new Date(); ini.setUTCHours(3, 0, 0, 0); // 00:00 en Uruguay
      const fin = new Date(ini.getTime() + 86_400_000);
      const { data: rs } = await supabaseAdmin.from("reuniones").select("fecha, motivo, cliente_id, clientes(nombre)").eq("hecha", false).gte("fecha", ini.toISOString()).lt("fecha", fin.toISOString()).order("fecha");
      reunionesHoy = rs?.length ?? 0;
      if (rs?.length) {
        const hora = (f: string) => new Date(f).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
        const nom = (r: { clientes?: { nombre?: string } | { nombre?: string }[] | null }) => (Array.isArray(r.clientes) ? r.clientes[0]?.nombre : r.clientes?.nombre) ?? "cliente";
        await enviarPush({
          titulo: rs.length === 1 ? "Hoy tenés una reunión" : `Hoy tenés ${rs.length} reuniones`,
          cuerpo: rs.slice(0, 3).map((r) => `${hora(r.fecha)} ${nom(r)} · ${r.motivo}`).join(" · "),
          url: rs.length === 1 ? `/clientes/${rs[0].cliente_id}` : "/agenda",
          tag: "reuniones",
        }, supabaseAdmin);
      }
    } catch { /* no frena las alertas */ }
  }

  // Recordatorio: cobros de mañana en todas las carteras (solo en la corrida diaria, no en "Revisar ahora").
  let cobrosManiana = 0;
  if (!sinEmail) {
    try {
      const d = new Date(Date.now() + 86_400_000 - 3 * 3_600_000); // mañana en hora de Uruguay
      const maniana = d.toISOString().slice(0, 10);
      const activos = (bonds as BondConPropuesta[]) ?? [];
      const isinsB = [...new Set(activos.map((b) => b.isin).filter((x): x is string => !!x))];
      const [{ data: insB }, { data: cfg }] = await Promise.all([
        isinsB.length ? supabaseAdmin.from("instrumentos").select("*").in("isin", isinsB) : Promise.resolve({ data: [] }),
        supabaseAdmin.from("costos_config").select("*").eq("id", 1).maybeSingle(),
      ]);
      const mapaB = new Map(((insB as Instrumento[]) ?? []).map((i) => [i.isin, i]));
      const cobros = cobrosDeCartera(activos, normalizarCostos(cfg as Partial<Costos> | null), mapaB).filter((c) => c.fecha === maniana);
      cobrosManiana = cobros.length;
      if (cobros.length) {
        const cuentaDe = (id: string) => activos.find((b) => b.id === id)?.cuenta ?? "";
        const fmt = (v: number, m: string) => `${v.toLocaleString("es-UY", { maximumFractionDigits: 0 })} ${m}`;
        await enviarPush({
          titulo: cobros.length === 1 ? "Mañana hay un cobro" : `Mañana hay ${cobros.length} cobros`,
          cuerpo: cobros.slice(0, 3).map((c) => `${cuentaDe(c.bondId) ? cuentaDe(c.bondId) + ": " : ""}${c.nombre} ${fmt(c.total, c.moneda)}${c.capital ? " (vence)" : ""}`).join(" · "),
          url: "/cobros",
          tag: "cobros",
        }, supabaseAdmin);
      }
    } catch { /* no frena las alertas */ }
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

  return NextResponse.json({ novedades, alerts, clientes, nuevas: nuevas.length, push, seguimiento: seguidosDisparados.length, cobrosManiana, reunionesHoy, emailed: !sinEmail && Boolean(resendKey && emailTo) });
}
