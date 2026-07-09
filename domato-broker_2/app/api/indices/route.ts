import { NextResponse } from "next/server";

// Uses Yahoo Finance's public (unauthenticated) chart endpoint.
// No API key required, but it's an unofficial endpoint — if Yahoo changes it,
// swap this for a licensed provider (e.g. Twelve Data, Alpha Vantage).

const SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "CL=F", label: "WTI" },
  { symbol: "BZ=F", label: "Brent" },
  { symbol: "GC=F", label: "Oro" },
  { symbol: "SI=F", label: "Plata" },
  { symbol: "HG=F", label: "Cobre" },
  { symbol: "DX-Y.NYB", label: "DXY" },
  { symbol: "EURUSD=X", label: "EUR/USD" },
  { symbol: "JPY=X", label: "USD/JPY" },
  { symbol: "UYU=X", label: "USD/UYU" },
  { symbol: "ARS=X", label: "USD/ARS" },
  { symbol: "BRL=X", label: "USD/BRL" },
];

async function fetchQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=2d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { price, change };
}

export async function GET() {
  try {
    const results = await Promise.all(
      SYMBOLS.map(async ({ symbol, label }) => {
        const q = await fetchQuote(symbol);
        return {
          label,
          value: q ? q.price.toFixed(q.price < 10 ? 4 : 2) : "—",
          change: q ? q.change : 0,
        };
      })
    );
    return NextResponse.json({ items: results });
  } catch (err) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
