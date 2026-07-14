"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { Panel, Badge } from "@/components/Card";
import clsx from "clsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarEvent = {
  date: Date;
  bond: Bond;
  tipo: "cupon" | "vencimiento";
  importe: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCuponRate(b: Bond): number | null {
  if (b.cupon != null) return b.cupon;
  const m = b.nombre.match(/(\d+)[,.](\d+)\s*%/);
  if (m) return parseFloat(m[0].replace(",", ".").replace("%", "").trim());
  return null;
}

function buildEvents(bonds: Bond[]): CalendarEvent[] {
  const evs: CalendarEvent[] = [];
  bonds.forEach((b) => {
    if (b.proximo_pago_interes) {
      const rate = getCuponRate(b);
      evs.push({
        date: new Date(b.proximo_pago_interes + "T00:00:00"),
        bond: b,
        tipo: "cupon",
        importe: rate != null ? (rate / 100) * b.valor_nominal * b.cantidad : null,
      });
    }
    if (b.proximo_vencimiento) {
      evs.push({
        date: new Date(b.proximo_vencimiento + "T00:00:00"),
        bond: b,
        tipo: "vencimiento",
        importe: b.valor_nominal * b.cantidad,
      });
    }
  });
  return evs.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmt(value: number, currency: string) {
  const cur = ["USD", "UYU", "EUR", "ARS"].includes(currency) ? currency : "USD";
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(value);
}

function totalsByCurrency(evs: CalendarEvent[]) {
  const acc: Record<string, number> = {};
  evs.forEach((e) => {
    if (e.importe != null) acc[e.bond.moneda] = (acc[e.bond.moneda] ?? 0) + e.importe;
  });
  return acc;
}

// ─── Day Modal ────────────────────────────────────────────────────────────────

function DayModal({ day, events, onClose }: { day: Date; events: CalendarEvent[]; onClose: () => void }) {
  const cupones = events.filter((e) => e.tipo === "cupon");
  const vencimientos = events.filter((e) => e.tipo === "vencimiento");
  const totals = totalsByCurrency(cupones);

  const dayLabel = day.toLocaleDateString("es-UY", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-ink border border-ink-border rounded-2xl w-full max-w-md max-h-[82vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-border shrink-0">
          <div>
            <p className="text-xs text-muted capitalize">{dayLabel}</p>
            <p className="font-display text-lg text-paper">
              {events.length} evento{events.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper text-xl leading-none px-1">✕</button>
        </div>

        {/* Events list */}
        <div className="overflow-y-auto flex-1 divide-y divide-ink-border/40">
          {cupones.length > 0 && (
            <div className="px-5 pt-3 pb-1">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Cupones</p>
            </div>
          )}
          {cupones.map((e, i) => {
            const rate = getCuponRate(e.bond);
            return (
              <div key={"c" + i} className="px-5 py-3 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <span className="inline-block rounded-full w-2 h-2 bg-gain mt-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-paper font-medium leading-snug">{e.bond.nombre}</p>
                  <p className="text-[11px] text-muted mt-0.5 space-x-1">
                    {rate != null && <span>Tasa {rate}%</span>}
                    <span>·</span>
                    <span>{e.bond.moneda}</span>
                    <span>·</span>
                    <span>{e.bond.cantidad} títulos</span>
                    {e.bond.corredor && (
                      <>
                        <span>·</span>
                        <span>{e.bond.corredor}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {e.importe != null ? (
                    <p className="text-sm font-mono font-semibold text-gain">
                      {fmt(e.importe, e.bond.moneda)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted italic">sin tasa</p>
                  )}
                </div>
              </div>
            );
          })}

          {vencimientos.length > 0 && (
            <div className="px-5 pt-3 pb-1">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Vencimientos</p>
            </div>
          )}
          {vencimientos.map((e, i) => (
            <div key={"v" + i} className="px-5 py-3 flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <span className="inline-block rounded-full w-2 h-2 bg-warn mt-1" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-paper font-medium leading-snug">{e.bond.nombre}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {e.bond.moneda} · {e.bond.cantidad} títulos · V.N. {fmt(e.bond.valor_nominal, e.bond.moneda)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-semibold text-warn">
                  {fmt(e.importe!, e.bond.moneda)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Totals footer */}
        {Object.keys(totals).length > 0 && (
          <div className="px-5 py-4 border-t border-ink-border bg-ink/80 shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Total cupones del día</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(totals).map(([cur, total]) => (
                <div key={cur}>
                  <p className="text-[10px] text-muted">{cur}</p>
                  <p className="font-mono text-lg font-semibold text-paper">{fmt(total, cur)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Weekly strip ─────────────────────────────────────────────────────────────

function WeeklyStrip({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const allDays: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) allDays.push(new Date(year, month, -i));
  for (let d = 1; d <= daysInMonth; d++) allDays.push(new Date(year, month, d));

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  const weekSums = weeks.map((week) =>
    totalsByCurrency(
      events.filter((e) => e.tipo === "cupon" && week.some((d) => sameDay(d, e.date)))
    )
  );

  if (!weekSums.some((s) => Object.keys(s).length > 0)) return null;

  return (
    <div className="rounded-xl border border-ink-border bg-ink/40 p-4">
      <p className="text-xs text-muted uppercase tracking-wide mb-3">Flujo semanal de cupones</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {weekSums.map((sums, wi) => {
          const week = weeks[wi];
          const label = `Sem. ${wi + 1} (${week[0].getDate()}–${week[week.length - 1].getDate()})`;
          return (
            <div key={wi} className="rounded-lg border border-ink-border/60 bg-ink/60 p-3">
              <p className="text-[11px] text-muted mb-1">{label}</p>
              {Object.keys(sums).length === 0 ? (
                <p className="text-xs text-muted/50">—</p>
              ) : (
                Object.entries(sums).map(([cur, total]) => (
                  <p key={cur} className="font-mono text-sm text-paper font-semibold">{fmt(total, cur)}</p>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

export default function CalendarioPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

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
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  const upcoming = useMemo(
    () => events.filter((e) => e.date.getTime() >= Date.now() - 86400000).slice(0, 12),
    [events]
  );

  const selectedEvents = useMemo(
    () => (selectedDay ? events.filter((e) => sameDay(e.date, selectedDay)) : []),
    [selectedDay, events]
  );

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
              <div key={d} className="text-[11px] uppercase tracking-wide text-muted py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, i) => {
              if (!day) return <div key={i} className="h-16 rounded-lg" />;
              const dayEvs = events.filter((e) => sameDay(e.date, day));
              const isToday = sameDay(day, new Date());
              const nCupon = dayEvs.filter((e) => e.tipo === "cupon").length;
              const nVenc = dayEvs.filter((e) => e.tipo === "vencimiento").length;
              return (
                <div
                  key={i}
                  onClick={() => dayEvs.length > 0 && setSelectedDay(day)}
                  className={clsx(
                    "h-16 rounded-lg border px-1.5 py-1 flex flex-col gap-0.5 overflow-hidden transition-colors",
                    isToday ? "border-gold bg-gold/5" : "border-ink-border",
                    dayEvs.length > 0 && "cursor-pointer hover:border-gold/60 hover:bg-gold/5"
                  )}
                >
                  <span className={clsx("text-[11px]", isToday ? "text-gold font-semibold" : "text-muted")}>
                    {day.getDate()}
                  </span>
                  {nCupon > 0 && (
                    <span className="text-[9px] leading-tight rounded px-1 bg-gain/10 text-gain truncate">
                      {nCupon} cupón{nCupon !== 1 ? "es" : ""}
                    </span>
                  )}
                  {nVenc > 0 && (
                    <span className="text-[9px] leading-tight rounded px-1 bg-warn/10 text-warn truncate">
                      {nVenc} venc.
                    </span>
                  )}
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
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-paper truncate">{e.bond.nombre}</p>
                    <p className="text-[11px] text-muted">
                      {e.date.toLocaleDateString("es-UY", { day: "2-digit", month: "short" })}
                      {e.importe != null ? ` · ${fmt(e.importe, e.bond.moneda)}` : ""}
                    </p>
                  </div>
                  <Badge tone={e.tipo === "cupon" ? "gain" : "warning"}>
                    {e.tipo === "cupon" ? "Cupón" : "Venc."}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <WeeklyStrip cursor={cursor} events={events} />

      {selectedDay && (
        <DayModal day={selectedDay} events={selectedEvents} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
