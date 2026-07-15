import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Fetch portfolio context from /api/asesor/context
  let contextText = "";
  try {
    const host = req.headers.get("host") ?? "";
    const proto = host.startsWith("localhost") ? "http" : "https";
    const ctxResp = await fetch(`${proto}://${host}/api/asesor/context`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
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
    "Sos un asesor financiero experto en mercados de Uruguay (BVM, BEVSA) y Argentina.",
    "Ayudás a analizar y gestionar una cartera de bonos y acciones en BCE&M Operadores (Bolsa de Valores de Montevideo).",
    "Respondé siempre en español rioplatense, de forma clara, concisa y profesional.",
    "Cuando tengas datos numéricos, usálos. Si los datos son insuficientes para una recomendación firme, indicalo.",
    "Podés usar markdown básico (negritas, listas) para estructurar la respuesta cuando ayude a la claridad.",
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
