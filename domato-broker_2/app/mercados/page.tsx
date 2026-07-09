"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Card";
import clsx from "clsx";

type Item = { label: string; value: string; change: number };

function IndicatorRow({ item }: { item: Item }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ink-border/40 last:border-0">
      <span className="text-sm text-paper">{item.label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono mono-num text-sm text-paper">{item.value}</span>
        <span
          className={clsx(
            "font-mono mono-num text-xs w-16 text-right",
            item.change > 0 && "text-gain",
            item.change < 0 && "text-loss",
            item.change === 0 && "text-muted"
          )}
        >
          {item.change > 0 ? "▲" : item.change < 0 ? "▼" : "–"}{" "}
          {Math.abs(item.change).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

const GROUPS: Record<string, string[]> = {
  "Estados Unidos": ["Dow Jones", "Nasdaq", "S&P 500", "Russell 2000", "VIX"],
  Commodities: ["WTI", "Brent", "Oro", "Plata", "Cobre"],
  Monedas: ["DXY", "EUR/USD", "USD/JPY", "USD/UYU", "USD/ARS", "USD/BRL"],
};

const TREASURY_LABELS: Record<string, string> = {
  treasury2y: "Treasury 2 años",
  treasury5y: "Treasury 5 años",
  treasury10y: "Treasury 10 años",
  treasury20y: "Treasury 20 años",
  treasury30y: "Treasury 30 años",
};

export default function MercadosPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [treasuries, setTreasuries] = useState<Record<string, { value: number | null }>>({});
  const [fredAvailable, setFredAvailable] = useState(true);

  useEffect(() => {
    fetch("/api/indices")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []));

    fetch("/api/fred")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setFredAvailable(false);
          return;
        }
        setTreasuries(data.data ?? {});
      });
  }, []);

  function byLabel(label: string) {
    return items.find((i) => i.label === label);
  }

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Mercados</h1>
        <p className="text-sm text-muted mt-1">
          Indicadores internacionales en tiempo real, actualizados cada 30 minutos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(GROUPS).map(([group, labels]) => (
          <Panel key={group} title={group}>
            {labels.map((label) => {
              const item = byLabel(label);
              return item ? (
                <IndicatorRow key={label} item={item} />
              ) : (
                <IndicatorRow key={label} item={{ label, value: "—", change: 0 }} />
              );
            })}
          </Panel>
        ))}

        <Panel title="Tasas (Treasury)">
          {fredAvailable ? (
            Object.entries(TREASURY_LABELS).map(([key, label]) => (
              <IndicatorRow
                key={key}
                item={{
                  label,
                  value: treasuries[key]?.value != null ? `${treasuries[key].value}%` : "—",
                  change: 0,
                }}
              />
            ))
          ) : (
            <p className="text-xs text-muted">
              Configurá <code className="text-gold">FRED_API_KEY</code> en las
              variables de entorno para ver las tasas del Tesoro americano
              (clave gratuita en fred.stlouisfed.org).
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
