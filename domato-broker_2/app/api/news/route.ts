import { NextResponse } from "next/server";
import Parser from "rss-parser";

const parser = new Parser();

// Free public RSS feeds. Swap or add sources as needed — many outlets
// (Bloomberg, Reuters premium) require licensed API access instead of RSS.
const FEEDS: { url: string; region: string }[] = [
  { url: "https://www.ambito.com/rss/pages/finanzas.xml", region: "Argentina" },
  { url: "https://news.google.com/rss/search?q=econom%C3%ADa+uruguay&hl=es-419&gl=UY", region: "Uruguay" },
  { url: "https://news.google.com/rss/search?q=federal+reserve+OR+treasury+yields&hl=en-US&gl=US", region: "Estados Unidos" },
  { url: "https://news.google.com/rss/search?q=economia+brasil&hl=pt-BR&gl=BR", region: "Brasil" },
];

const KEYWORDS = [
  "bono", "bonos", "tasa", "tasas", "inflación", "inflacion", "fed", "reserva federal",
  "petróleo", "petroleo", "riesgo país", "riesgo pais", "dólar", "dolar", "treasury",
  "economía", "economia", "mercado", "bcu", "bvm",
];

export async function GET() {
  try {
    const allItems = await Promise.all(
      FEEDS.map(async ({ url, region }) => {
        try {
          const feed = await parser.parseURL(url);
          return (feed.items ?? []).slice(0, 8).map((item) => ({
            title: item.title ?? "",
            link: item.link ?? "",
            pubDate: item.pubDate ?? "",
            region,
          }));
        } catch {
          return [];
        }
      })
    );

    const flat = allItems.flat();
    const relevant = flat.filter((item) =>
      KEYWORDS.some((kw) => item.title.toLowerCase().includes(kw))
    );

    const sorted = (relevant.length > 0 ? relevant : flat).sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

    return NextResponse.json({ items: sorted.slice(0, 30) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
