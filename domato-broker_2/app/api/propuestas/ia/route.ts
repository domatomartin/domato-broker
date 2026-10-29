import Anthropic from "@anthropic-ai/sdk";
import { usuarioDesdeRequest } from "@/lib/authServer";
import { NextRequest, NextResponse } from "next/server";
import type { Candidato, PerfilCliente } from "@/lib/propuesta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Modelo principal y alternativa si la cuenta no tiene acceso al primero.
const MODELOS = ["claude-sonnet-5-5", "claude-haiku-4-5-20251001"];

type Body =
  | { modo: "sugerir"; perfil: PerfilCliente; cliente: string; candidatos: Candidato[] }
  | {
      modo: "analizar";
      perfil: PerfilCliente;
      cliente: string;
      items: { isin: string; nombre: string; peso: number; tir_neta: number | null; plazo_anios: number | null; tipo: string; moneda: string }[];
      metricas: Record<string, unknown>;
    };

const SISTEMA = [
  "Sos el asistente de un asesor de inversiones en Uruguay que opera bonos en la Bolsa de Valores de Montevideo.",
  "Escribís en español rioplatense, claro y profesional, para que el asesor lo presente a su cliente.",
  "Reglas:",
  "- Solo usás los instrumentos y números que te pasan; nunca inventes precios, tasas ni bonos.",
  "- Las tasas que recibís ya están netas de costos del corredor cuando dicen tir_neta.",
  "- Las TIR de bonos en UI (unidades indexadas) o UP son reales, por encima de la inflación: no las compares directo con TIR nominales en pesos; una TIR real del 2-3% puede equivaler a una nominal mayor.",
  "- Los montos y pesos se expresan en la moneda del cliente; el sistema convierte a UI con la cotización del día.",
  "- Diversificás por emisor, tipo de instrumento y plazo; evitás concentrar más del 40% en un solo bono salvo que haya pocos candidatos.",
  "- Ajustás la mezcla al perfil: conservador prioriza soberanos uruguayos y plazos cortos/medios; agresivo admite más plazo y corporativos/fideicomisos con mayor TIR.",
  "- Si el objetivo es renta, preferís bonos con cupón; si es preservar, plazos cortos y emisores soberanos.",
  "- Mencionás riesgos concretos (tasa, plazo, emisor, liquidez de la BVM, amortizaciones, moneda) sin alarmismo.",
  "- No prometés resultados; es una propuesta orientativa.",
].join("\n");

function perfilTexto(p: PerfilCliente, cliente: string) {
  return `Cliente: ${cliente || "(sin nombre)"}\nMonto: ${p.monto} ${p.moneda}\nPlazo máximo: ${p.plazoMaxAnios} años\nPerfil de riesgo: ${p.riesgo}\nObjetivo: ${p.objetivo}\nNotas del asesor: ${p.notas || "—"}`;
}

function extraerJson(texto: string): unknown {
  const tag = texto.match(/<json>([\s\S]*?)<\/json>/i)?.[1];
  const bruto = tag ?? texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bruto) throw new Error("La IA no devolvió datos estructurados.");
  return JSON.parse(bruto);
}

async function preguntar(prompt: string, maxTokens: number) {
  const client = new Anthropic();
  let ultimoError: unknown = null;
  for (const model of MODELOS) {
    try {
      const r = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SISTEMA,
        messages: [{ role: "user", content: prompt }],
      });
      const texto = r.content.map((c) => ("text" in c ? c.text : "")).join("");
      return { texto, model };
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("No se pudo consultar la IA.");
}

export async function POST(req: NextRequest) {
  // Solo usuarios logueados en la app (evita que cualquiera use la clave de la IA).
  if (!(await usuarioDesdeRequest(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  try {
    if (body.modo === "sugerir") {
      if (!body.candidatos?.length) return NextResponse.json({ error: "No hay bonos candidatos para ese perfil." }, { status: 400 });
      const prompt = [
        "Armá una propuesta de cartera de bonos diversificada para este cliente.",
        "",
        perfilTexto(body.perfil, body.cliente),
        "",
        "Bonos candidatos disponibles (JSON; tir_neta y tir_bruta en % anual, precios cada 100 de nominal):",
        JSON.stringify(body.candidatos),
        "",
        "Elegí entre 3 y 6 bonos SOLO de esa lista (usá el isin exacto) y asigná un peso en % a cada uno que sume 100.",
        "Devolvé SOLO esto, sin texto afuera:",
        "<json>",
        '{"items":[{"isin":"...","peso":30,"motivo":"una frase de por qué"}],',
        ' "analisis":"Texto para el informe con estas secciones, cada una como línea que empieza con ## : ## Estrategia, ## Por qué estos bonos, ## Riesgos a considerar, ## Seguimiento sugerido. Usá viñetas con - y negritas con **. Máximo 350 palabras."}',
        "</json>",
      ].join("\n");
      const { texto, model } = await preguntar(prompt, 2500);
      const json = extraerJson(texto) as { items?: { isin: string; peso: number; motivo?: string }[]; analisis?: string };

      const validos = new Set(body.candidatos.map((c) => c.isin));
      const items = (json.items ?? []).filter((x) => validos.has(x.isin) && Number(x.peso) > 0);
      if (!items.length) throw new Error("La IA no eligió bonos válidos; probá de nuevo.");
      const suma = items.reduce((s, x) => s + Number(x.peso), 0);
      const normalizados = items.map((x) => ({ isin: x.isin, peso: Math.round((Number(x.peso) / suma) * 1000) / 10, motivo: x.motivo?.slice(0, 300) }));
      return NextResponse.json({ items: normalizados, analisis: json.analisis ?? "", model });
    }

    if (body.modo === "analizar") {
      const prompt = [
        "Redactá el análisis para el informe de esta propuesta de cartera ya armada por el asesor.",
        "",
        perfilTexto(body.perfil, body.cliente),
        "",
        "Bonos y pesos (JSON):",
        JSON.stringify(body.items),
        "",
        "Métricas de la cartera (netas de costos del corredor):",
        JSON.stringify(body.metricas),
        "",
        "Usá estas secciones, cada una como línea que empieza con ## : ## Estrategia, ## Por qué estos bonos, ## Riesgos a considerar, ## Seguimiento sugerido.",
        "Viñetas con - y negritas con **. Máximo 350 palabras. Devolvé solo el texto.",
      ].join("\n");
      const { texto, model } = await preguntar(prompt, 1500);
      return NextResponse.json({ analisis: texto.trim(), model });
    }

    return NextResponse.json({ error: "Modo desconocido" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
