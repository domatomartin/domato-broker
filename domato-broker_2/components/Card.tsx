import clsx from "clsx";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "warning" | "critical" | "gain";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    neutral: "bg-ink text-muted",
    info: "bg-gold/5 text-gold",
    warning: "bg-warn/10 text-warn",
    critical: "bg-loss/10 text-loss",
    gain: "bg-gain/10 text-gain",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        styles[tone]
      )}
    >
      {children}
    </span>
  );
}

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
    <div className="card-shadow rounded-2xl bg-ink-panel px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">
        {label}
      </p>
      <p
        className={clsx(
          "font-mono mono-num text-2xl leading-none",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "gold" && "text-gold",
          tone === "neutral" && "text-paper"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-shadow rounded-2xl bg-ink-panel">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-border">
        <h2 className="font-display font-semibold text-base text-paper">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
