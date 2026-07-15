export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral" | "gold";
}) {
  return (
    <div className="card-shadow rounded-2xl bg-ink-panel px-4 py-3 sm:px-5 sm:py-4 min-w-0">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.08em] sm:tracking-[0.12em] text-muted mb-1.5 sm:mb-2 truncate">
        {label}
      </p>
      <p
        className={clsx(
          "font-mono mono-num text-lg sm:text-2xl leading-tight break-words",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "gold" && "text-gold",
          tone === "neutral" && "text-paper"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-2 truncate">{sub}</p>}
    </div>
  );
}
