import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { message, history = [] } = await req.json();

  // 1. Fetch portfolio context from Mingo's endpoint
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

  // 2. Build system prompt
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

  // 3. Stream with @anthropic-ai/sdk
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      ...history,
      { role: "user" as const, content: message },
    ],
  });

  // 4. Extract text deltas → plain text stream (compatible with page.tsx reader)
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        console.error("[asesor/chat] stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
