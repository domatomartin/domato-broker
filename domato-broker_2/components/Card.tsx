import clsx from "clsx";
import { ReactNode } from "react";

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

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-ink-panel p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Badge({
  tone = "info",
  children,
}: {
  tone?: "critical" | "warning" | "info" | "gain" | "loss";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        tone === "critical" && "bg-loss/20 text-loss",
        tone === "warning" && "bg-amber-500/20 text-amber-400",
        tone === "info" && "bg-gold/20 text-gold",
        tone === "gain" && "bg-gain/20 text-gain",
        tone === "loss" && "bg-loss/20 text-loss"
      )}
    >
      {children}
    </span>
  );
}
