import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

  // 3. Call Anthropic with streaming
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      stream: true,
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return NextResponse.json({ error: err }, { status: upstream.status });
  }

  // 4. Transform Anthropic SSE → plain text stream (text deltas only)
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const readable = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const evt = JSON.parse(data);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta"
              ) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
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
