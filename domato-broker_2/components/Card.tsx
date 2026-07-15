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
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card-shadow rounded-2xl bg-ink-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-ink-border/50">
        <h2 className="text-sm font-semibold text-paper">{title}</h2>
        {action && <div>{action}</div>}
      </div>
      <div className="px-4 py-3 sm:px-5 sm:py-4">{children}</div>
    </div>
  );
}

export function Badge({
  tone = "info",
  children,
}: {
  tone?: "critical" | "warning" | "info";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0",
        tone === "critical" && "bg-loss/20 text-loss",
        tone === "warning" && "bg-gold/20 text-gold",
        tone === "info" && "bg-paper/10 text-muted"
      )}
    >
      {children}
    </span>
  );
}
