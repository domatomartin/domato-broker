import { NextResponse } from "next/server";

// FRED (Federal Reserve Economic Data) — free API, requires a key from
// https://fred.stlouisfed.org/docs/api/api_key.html
// Set FRED_API_KEY in your environment variables.

const SERIES = {
  treasury2y: "DGS2",
  treasury5y: "DGS5",
  treasury10y: "DGS10",
  treasury20y: "DGS20",
  treasury30y: "DGS30",
  dxy: "DTWEXBGS",
};

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta FRED_API_KEY en las variables de entorno" },
      { status: 200 }
    );
  }

  try {
    const entries = await Promise.all(
      Object.entries(SERIES).map(async ([label, seriesId]) => {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=2`;
        const res = await fetch(url, { next: { revalidate: 1800 } });
        const json = await res.json();
        const obs = json.observations ?? [];
        const latest = obs[0] ? parseFloat(obs[0].value) : null;
        const prev = obs[1] ? parseFloat(obs[1].value) : null;
        return [label, { value: latest, prev }];
      })
    );
    return NextResponse.json({ data: Object.fromEntries(entries) });
  } catch (err) {
    return NextResponse.json({ error: "Error consultando FRED" }, { status: 500 });
  }
}
