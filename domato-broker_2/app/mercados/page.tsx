"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Card";
import clsx from "clsx";

type MarketItem = { label: string; value: string; change: number };
type FredSeries = { value: number | null; prev: number | null };
type FredData = Record<string, FredSeries>;

// ─── Fila de índice / commodity / moneda ──────────────────────────────────────

function IndicatorRow({ item }: { item: MarketItem }) {
  const up = item.change > 0;
  const dn = item.change < 0;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-ink-border/40 last:border-0">
      <span className="text-sm text-paper">{item.label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono mono-num text-sm text-paper">{item.value}</span>
        <span className={clsx(
          "font-mono mono-num text-xs w-20 text-right tabular-nums",
          up && "text-gain", dn && "text-loss", !up && !dn && "text-muted"
        )}>
          {up ? "▲" : dn ? "▼" : "–"} {Math.abs(item.change).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ─── Fila de tasa (Treasury) con variación en bps ────────────────────────────

function TreasuryRow({ label, data }: { label: string; data?: FredSeries }) {
  const val = data?.value ?? null;
  const prev = data?.prev ?? null;
  const bps = val != null && prev != null && !isNaN(prev)
    ? Math.round((val - prev) * 100)
    : null;
  const up = bps != null && bps > 0;
  const dn = bps != null && bps < 0;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-ink-border/40 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono mono-num text-sm font-semibold text-paper">
          {val != null ? `${val.toFixed(2)}%` : "—"}
        </span>
        <span className={clsx(
          "font-mono text-xs w-20 text-right tabular-nums",
          up && "text-gain", dn && "text-loss", !up && !dn && "text-muted"
        )}>
          {bps != null
            ? <>{up ? "▲" : dn ? "▼" : "–"} {Math.abs(bps)} bps</>
            : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Curva de rendimientos (mini SVG) ────────────────────────────────────────

const MATURITIES = [
  { key: "treasury2y",  short: "2a" },
  { key: "treasury5y",  short: "5a" },
  { key: "treasury10y", short: "10a" },
  { key: "treasury20y", short: "20a" },
  { key: "treasury30y", short: "30a" },
];

function YieldCurve({ data }: { data: FredData }) {
  const vals = MATURITIES.map(m => data[m.key]?.value ?? null);
  const valid = vals.filter((v): v is number => v != null);
  if (valid.length < 3) return null;

  const W = 260, H = 52;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const rng = max - min || 0.1;

  const points = vals
    .map((v, i) => v != null
      ? [Math.round((i / (MATURITIES.length - 1)) * W), Math.round(H - ((v - min) / rng) * (H - 10) - 4)]
      : null
    )
    .filter((p): p is number[] => p != null);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");

  return (
    <div className="mt-4 pt-3 border-t border-ink-border/30">
      <p className="text-[10px] text-muted uppercase tracking-widest mb-3">Curva de rendimientos</p>
      <svg viewBox={`-4 0 ${W + 8} ${H + 14}`} className="w-full" style={{ height: 72 }}>
        <path d={path} fill="none" stroke="#b8972e" strokeWidth="1.5" strokeLinejoin="round" />
        {points.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill="#b8972e" />
            <text x={x} y={H + 13} textAnchor="middle" fontSize="8" fill="#888">
              {MATURITIES[i].short}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Grupos de mercado ────────────────────────────────────────────────────────

const GROUPS: Record<string, string[]> = {
  "Estados Unidos": ["Dow Jones", "Nasdaq", "S&P 500", "Russell 2000", "VIX"],
  Commodities: ["WTI", "Brent", "Oro", "Plata", "Cobre"],
  Monedas: ["DXY", "EUR/USD", "USD/JPY", "USD/UYU", "USD/ARS", "USD/BRL"],
};

const TREASURY_LABELS: { key: string; label: string }[] = [
  { key: "treasury2y",  label: "2 años" },
  { key: "treasury5y",  label: "5 años" },
  { key: "treasury10y", label: "10 años" },
  { key: "treasury20y", label: "20 años" },
  { key: "treasury30y", label: "30 años" },
];

// ─── Página ───────────────────────────────────────────────────────────────────

export default function MercadosPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [treasuries, setTreasuries] = useState<FredData>({});
  const [fredAvailable, setFredAvailable] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    fetch("/api/indices")
      .then(r => r.json())
      .then(data => {
        setItems(data.items ?? []);
        setUpdatedAt(new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }));
      });

    fetch("/api/fred")
      .then(r => r.json())
      .then(data => {
        if (data.error) { setFredAvailable(false); return; }
        setTreasuries(data.data ?? {});
      });
  }, []);

  const byLabel = (label: string) => items.find(i => i.label === label);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-paper">Mercados</h1>
          <p className="text-sm text-muted mt-1">
            Indicadores internacionales en tiempo real, actualizados cada 30 minutos.
          </p>
        </div>
        {updatedAt && (
          <p className="text-xs text-muted shrink-0 mb-0.5">Actualizado {updatedAt}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(GROUPS).map(([group, labels]) => (
          <Panel key={group} title={group}>
            {labels.map(label => (
              <IndicatorRow key={label} item={byLabel(label) ?? { label, value: "—", change: 0 }} />
            ))}
          </Panel>
        ))}

        <Panel title="Tasas del Tesoro (Treasury)">
          {fredAvailable ? (
            <>
              {TREASURY_LABELS.map(({ key, label }) => (
                <TreasuryRow key={key} label={label} data={treasuries[key]} />
              ))}
              <YieldCurve data={treasuries} />
            </>
          ) : (
            <div className="py-1 flex flex-col gap-2">
              <p className="text-sm text-muted">Clave FRED no configurada.</p>
              <p className="text-xs text-muted">
                Agregá <code className="text-gold">FRED_API_KEY</code> en las variables de entorno de Vercel.
                Clave gratuita en <span className="text-gold">fred.stlouisfed.org</span>.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
