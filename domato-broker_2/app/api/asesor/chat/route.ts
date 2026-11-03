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
    "- Conocés a todos los clientes (sección CLIENTES y PROSPECTOS) con su perfil de inversor: toda sugerencia tiene que respetar el perfil, el plazo y la moneda del cliente. Si un cliente no tiene test de perfil, decilo y pedí que se haga antes de recomendar.",
    "- Para buscar oportunidades usá la sección CATÁLOGO (curva soberana y spreads); explicá el riesgo extra cuando algo rinde mucho más que el soberano.",
    "- La renta variable figura con rendimiento estimado desde la par: si el precio de mercado está muy arriba de 100, aclará que quien compra hoy gana menos.",
    "- Las TIR en UI y UP son reales (sin inflación): no las compares directo con dólares o pesos.",
    "- Esto es apoyo para el asesor; no es una orden de compra. No ejecutes nada.",
    "",
    "=== ESTADO ACTUAL DE LA CARTERA ===",
    contextText || "No se pudo obtener el contexto de la cartera en este momento.",
  ].join("\n");

  const stream = client.messages.stream({
    model: "claude-sonnet-5-5",
    max_tokens: 3000,
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
