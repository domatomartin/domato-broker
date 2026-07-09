"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Card";
import clsx from "clsx";

type NewsItem = { title: string; link: string; pubDate: string; region: string };

const REGIONS = ["Todas", "Uruguay", "Estados Unidos", "Argentina", "Brasil"];

export default function NoticiasPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [region, setRegion] = useState("Todas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = region === "Todas" ? items : items.filter((i) => i.region === region);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Noticias financieras</h1>
        <p className="text-sm text-muted mt-1">
          Filtradas por relevancia: bonos, tasas, inflación, Fed, petróleo, riesgo país.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-xs border transition-colors",
              region === r
                ? "bg-gold text-ink border-gold"
                : "border-ink-border text-muted hover:text-paper"
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <Panel title={`${filtered.length} noticias`}>
        {loading ? (
          <p className="text-sm text-muted py-6 text-center">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">
            No hay noticias relevantes en este momento.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-ink-border/40">
            {filtered.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 flex flex-col gap-1 hover:bg-ink/40 -mx-5 px-5 transition-colors"
              >
                <div className="flex items-center gap-2 text-[11px] text-muted uppercase tracking-wide">
                  <span className="text-gold">{item.region}</span>
                  {item.pubDate && (
                    <span>· {new Date(item.pubDate).toLocaleDateString("es-UY")}</span>
                  )}
                </div>
                <p className="text-sm text-paper">{item.title}</p>
              </a>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
