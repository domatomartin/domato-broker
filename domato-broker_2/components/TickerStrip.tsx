import clsx from "clsx";

export type TickerItem = {
  label: string;
  value: string;
  change: number; // signed %
};

export default function TickerStrip({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-ink-border bg-ink-panel">
      <div className="flex w-max ticker-track">
        {doubled.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-6 py-2 border-r border-ink-border whitespace-nowrap"
          >
            <span className="text-xs text-muted uppercase tracking-wide">
              {item.label}
            </span>
            <span className="font-mono mono-num text-sm text-paper">
              {item.value}
            </span>
            <span
              className={clsx(
                "font-mono mono-num text-xs",
                item.change > 0 && "text-gain",
                item.change < 0 && "text-loss",
                item.change === 0 && "text-muted"
              )}
            >
              {item.change > 0 ? "▲" : item.change < 0 ? "▼" : "–"}{" "}
              {Math.abs(item.change).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
