import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { usuarioDesdeRequest } from "@/lib/authServer";

export const dynamic = "force-dynamic";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  // Solo usuarios logueados: evita que cualquiera use la clave de la IA.
  if (!(await usuarioDesdeRequest(req))) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { messages } = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Fetch portfolio context from /api/asesor/context
  let contextText = "";
  try {
    const host = req.headers.get("host") ?? "";
    const proto = host.startsWith("localhost") ? "http" : "https";
    const ctxResp = await fetch(`${proto}://${host}/api/asesor/context`, {
      headers: { cookie: req.headers.get("cookie") ?? "", authorization: req.headers.get("authorization") ?? "" },
    });
    if (ctxResp.ok) {
      const ctx = await ctxResp.json();
      contextText =
        typeof ctx === "string"
          ? ctx
          : (ctx.context ?? ctx.text ?? JSON.stringify(ctx, null, 2));
    }
  } catch (e) {
    console.error("[asesor/chat] context fetch failed:", e);
  }

  const systemPrompt = [
    "Sos Mingo, asesor financiero especializado en mercados de Uruguay (BVM, BEVSA) y Argentina.",
    "Gestionás carteras de bonos y acciones en BCE&M Operadores (Bolsa de Valores de Montevideo).",
    "",
    "REGLAS:",
    "- Respondé siempre en español rioplatense, directo y profesional.",
    "- Citá datos concretos del contexto: precio actual, TIR, vencimiento, valor de mercado en USD.",
    "- Si hay líneas ⚠️ CONCENTRACIÓN en el contexto, mencioná el riesgo de concentración en tu análisis.",
    "- Bono 'sobre la par' (>100.5%): el inversor paga prima, TIR real < cupón — señalalo.",
    "- Bono 'bajo la par' (<99.5%): hay descuento, TIR real > cupón — puede ser oportunidad.",
    "- Si los datos son insuficientes para una recomendación firme, indicalo claramente.",
    "- Usá markdown (negritas, listas) para estructurar respuestas largas.",
    "- Nunca inventes datos que no estén en el contexto.",
    "",
    "=== ESTADO ACTUAL DE LA CARTERA ===",
    contextText || "No se pudo obtener el contexto de la cartera en este momento.",
  ].join("\n");

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  return new Response(stream.toReadableStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
        }
