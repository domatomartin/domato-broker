import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// TEMP ADMIN ROUTE — DELETE AFTER USE
// Actualiza precios reales cuenta 2192 (fuente: Banco Provincia 13/07/2026 + Investing.com 14/07/2026)
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const updates = [
    { isin: 'US040114HX11', precio: 86.00,  ticker: 'AE29/GD29' },
    { isin: 'US040114HU71', precio: 131.62, ticker: 'AE38/GD38' },
    { isin: 'US040114HV54', precio: 118.17, ticker: 'AL41/GD41' },
    { isin: 'US040114GM64', precio: 89.10,  ticker: 'ARGEFRN35' },
    { isin: 'US760942AS16', precio: 117.44, ticker: 'ROU7625' },
    { isin: 'US760942BG68', precio: 90.29,  ticker: 'ROU525' },
  ]

  const results = []
  for (const { isin, precio, ticker } of updates) {
    const { data, error } = await supabase
      .from('bonds')
      .update({ precio_actual: precio })
      .eq('isin', isin)
      .eq('cuenta', '2192')
      .select('isin, nombre, precio_actual')

    results.push({ ticker, isin, precio, success: !error, error: error?.message ?? null, updated: data?.length ?? 0 })
  }

  const allOk = results.every(r => r.success)
  return NextResponse.json({ ok: allOk, results, ts: new Date().toISOString() })
}
