import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getPortfolioContext(req: NextRequest): Promise<string> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const contextResp = await fetch(`${baseUrl}/api/asesor/context`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
    })

    if (!contextResp.ok) return ''
    return await contextResp.text()
  } catch {
    return ''
  }
}

function buildSystemPrompt(portfolioContext: string): string {
  const base = `Sos Domato Asesor, el asistente financiero personal de esta plataforma. Respondés en español rioplatense, de forma concisa y directa.

Capacidades:
- Analizás la cartera de bonos y acciones del cliente
- Explicás métricas financieras (TIR, precio sucio/limpio, interés corrido, duración)
- Alertás sobre riesgos de concentración, vencimientos próximos y variaciones de precio
- Cuando un bono cotiza muy lejos de la par, lo mencionás proactivamente
- Si hay alertas de concentración en el contexto, las nombrás

Reglas:
- Citás datos concretos del contexto (precio, TIR, vencimiento)
- Nunca inventás precios ni rendimientos
- Si no tenés la información en el contexto, lo decís
- Vas al punto, sin introducción larga`

  if (!portfolioContext) return base

  return `${base}

---
CONTEXTO ACTUAL DEL PORTAFOLIO:
${portfolioContext}
---`
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages?.length) {
      return NextResponse.json({ error: 'messages requeridos' }, { status: 400 })
    }

    const portfolioContext = await getPortfolioContext(req)
    const systemPrompt = buildSystemPrompt(portfolioContext)

    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            )
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error('[asesor/chat]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
