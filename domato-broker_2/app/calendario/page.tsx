"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { Panel, Badge } from "@/components/Card";
import clsx from "clsx";

type EventItem = { date: Date; label: string; tipo: "cupon" | "vencimiento" };

function buildEvents(bonds: Bond[]): EventItem[] {
  const events: EventItem[] = [];
  bonds.forEach((b) => {
    if (b.proximo_pago_interes) {
      events.push({ date: new Date(b.proximo_pago_interes), label: `Cupón — ${b.nombre}`, tipo: "cupon" });
    }
    if (b.proximo_vencimiento) {
      events.push({ date: new Date(b.proximo_vencimiento), label: `Vencimiento — ${b.nombre}`, tipo: "vencimiento" });
    }
  });
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export default function CalendarioPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo")
      .then(({ data }) => setBonds((data as Bond[]) ?? []));
  }, []);

  const events = useMemo(() => buildEvents(bonds), [bonds]);

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  const upcoming = events.filter((e) => e.date.getTime() >= Date.now() - 86400000).slice(0, 12);

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Calendario financiero</h1>
        <p className="text-sm text-muted mt-1">Cupones, intereses y vencimientos de toda tu cartera.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Panel
          title={`${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`}
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="rounded border border-ink-border px-2.5 py-1 text-xs text-paper hover:border-gold transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="rounded border border-ink-border px-2.5 py-1 text-xs text-paper hover:border-gold transition-colors"
              >
                Siguiente →
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {DIAS.map((d) => (
              <div key={d} className="text-[11px] uppercase tracking-wide text-muted py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, i) => {
              if (!day) return <div key={i} className="h-16 rounded-lg" />;
              const dayEvents = events.filter((e) => sameDay(e.date, day));
              const isToday = sameDay(day, new Date());
              return (
                <div
                  key={i}
                  className={clsx(
                    "h-16 rounded-lg border px-1.5 py-1 flex flex-col gap-0.5 overflow-hidden",
                    isToday ? "border-gold bg-gold/5" : "border-ink-border"
                  )}
                >
                  <span className={clsx("text-[11px]", isToday ? "text-gold font-semibold" : "text-muted")}>
                    {day.getDate()}
                  </span>
                  {dayEvents.slice(0, 2).map((e, j) => (
                    <span
                      key={j}
                      className={clsx(
                        "text-[9px] leading-tight rounded px-1 truncate",
                        e.tipo === "cupon" ? "bg-gain/10 text-gain" : "bg-warn/10 text-warn"
                      )}
                    >
                      {e.label}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Próximos eventos">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">Sin eventos próximos cargados.</p>
          ) : (
            <div className="flex flex-col divide-y divide-ink-border/50">
              {upcoming.map((e, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-paper">{e.label}</p>
                    <p className="text-[11px] text-muted">
                      {e.date.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Badge tone={e.tipo === "cupon" ? "gain" : "warning"}>
                    {e.tipo === "cupon" ? "Cupón" : "Vencimiento"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
