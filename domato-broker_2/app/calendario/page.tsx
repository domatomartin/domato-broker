"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { Panel, Badge } from "@/components/Card";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEvent = {
  date: Date;
  bond: Bond;
  tipo: "cupon" | "vencimiento";
  label: string;
  importe: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEvents(bonds: Bond[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  bonds.forEach((b) => {
    const importeCupon =
      b.cupon != null
        ? (b.cupon / 100) * (b.valor_nominal ?? 0) * (b.cantidad ?? 1)
        : null;
    const importeVenc =
      b.valor_nominal != null && b.cantidad != null
        ? b.valor_nominal * b.cantidad
        : null;

    if (b.proximo_pago_interes) {
      events.push({
        date: new Date(b.proximo_pago_interes + "T12:00:00"),
        bond: b,
        tipo: "cupon",
        label: b.nombre,
        importe: importeCupon,
      });
    }
    if (b.proximo_vencimiento) {
      events.push({
        date: new Date(b.proximo_vencimiento + "T12:00:00"),
        bond: b,
        tipo: "vencimiento",
        label: b.nombre,
        importe: importeVenc,
      });
    }
  });
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMoney(amount: number, currency: string): string {
  const sym: Record<string, string> = {
    USD: "U$S", UYU: "$U", UI: "UI", UST: "U$T", ARS: "AR$", EUR: "€",
  };
  const s = sym[currency] ?? currency;
  return `${s} ${amount.toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

function weekLabel(key: string): string {
  const [yearStr, weekStr] = key.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const startOfWeek = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek.getTime() + 6 * 86400000);
  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
  return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}`;
}

const CURRENCY_DOT: Record<string, string> = {
  USD: "bg-[#22c55e]", UYU: "bg-[#3b82f6]", UI: "bg-[#a855f7]",
  UST: "bg-[#14b8a6]", ARS: "bg-[#f97316]", EUR: "bg-[#eab308]",
};

const CURRENCY_BADGE: Record<string, string> = {
  USD: "bg-green-900/40 text-green-300 border border-green-700",
  UYU: "bg-blue-900/40 text-blue-300 border border-blue-700",
  UI:  "bg-purple-900/40 text-purple-300 border border-purple-700",
  UST: "bg-teal-900/40 text-teal-300 border border-teal-700",
  ARS: "bg-orange-900/40 text-orange-300 border border-orange-700",
  EUR: "bg-yellow-900/40 text-yellow-300 border border-yellow-700",
};

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const DIAS = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

// ─── Day Detail Modal ──────────────────────────────────────────────────────────

function DayModal({
  date,
  events,
  onClose,
}: {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const label = date.toLocaleDateString("es-UY", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const totals = events.reduce<Record<string, number>>((acc, e) => {
    if (e.importe != null) {
      const cur = e.bond.moneda;
      acc[cur] = (acc[cur] ?? 0) + e.importe;
    }
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
          <div>
            <p className="text-xs text-muted uppercase tracking-wide">Cobros del día</p>
            <h3 className="text-base font-semibold text-paper capitalize">{label}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-[#2e2e2e]">
          {events.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">Sin cobros este día.</p>
          ) : events.map((e, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-3">
              <span className={clsx("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", CURRENCY_DOT[e.bond.moneda] ?? "bg-gray-500")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-paper truncate">{e.bond.nombre}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded", CURRENCY_BADGE[e.bond.moneda] ?? "bg-gray-800 text-gray-300")}>
                    {e.bond.moneda}
                  </span>
                  <Badge tone={e.tipo === "cupon" ? "gain" : "warning"}>
                    {e.tipo === "cupon" ? "Cupón" : "Vencimiento"}
                  </Badge>
                  {e.bond.corredor && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-muted">
                      {e.bond.corredor}
                    </span>
                  )}
                </div>
              </div>
              {e.importe != null && (
                <p className="text-sm font-semibold text-paper whitespace-nowrap">
                  {formatMoney(e.importe, e.bond.moneda)}
                </p>
              )}
            </div>
          ))}
        </div>
        {Object.keys(totals).length > 0 && (
          <div className="border-t border-[#2e2e2e] px-5 py-3 bg-[#111] rounded-b-xl">
            <p className="text-xs text-muted uppercase tracking-wide mb-2">Total del día</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(totals).map(([cur, amt]) => (
                <span key={cur} className={clsx("text-xs font-bold px-2 py-1 rounded", CURRENCY_BADGE[cur] ?? "bg-gray-800 text-gray-300")}>
                  {formatMoney(amt, cur)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Weekly Strip ──────────────────────────────────────────────────────────────

function WeeklyStrip({
  events,
  year,
  month,
}: {
  events: CalendarEvent[];
  year: number;
  month: number;
}) {
  const byWeek = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    events.forEach((e) => {
      if (e.date.getFullYear() !== year || e.date.getMonth() !== month) return;
      if (e.importe == null) return;
      const wk = getWeekKey(e.date);
      if (!map[wk]) map[wk] = {};
      const cur = e.bond.moneda;
      map[wk][cur] = (map[wk][cur] ?? 0) + e.importe;
    });
    return map;
  }, [events, year, month]);

  const weeks = Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b));
  if (weeks.length === 0) return null;

  return (
    <Panel title="Disponible por semana">
      <div className="divide-y divide-ink-border/50">
        {weeks.map(([wk, totals]) => (
          <div key={wk} className="py-2.5 flex items-center gap-4 flex-wrap">
            <span className="text-xs text-muted w-24 flex-shrink-0">{weekLabel(wk)}</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(totals).map(([cur, amt]) => (
                <span key={cur} className={clsx("text-xs font-semibold px-2 py-0.5 rounded", CURRENCY_BADGE[cur] ?? "bg-gray-800 text-gray-300")}>
                  {formatMoney(amt, cur)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-3">* Importes estimados: tasa cupón × valor nominal × cantidad.</p>
    </Panel>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [year, month]);

  const upcoming = events.filter((e) => e.date.getTime() >= Date.now() - 86400000).slice(0, 12);
  const selectedDayEvents = selectedDay ? events.filter((e) => sameDay(e.date, selectedDay)) : [];

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Calendario financiero</h1>
        <p className="text-sm text-muted mt-1">Cupones, intereses y vencimientos de toda tu cartera.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Panel
          title={`${MESES[month]} ${year}`}
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                className="rounded border border-ink-border px-2.5 py-1 text-xs text-paper hover:border-gold transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setCursor(new Date(year, month + 1, 1))}
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
              const dayEvents = events.filter((e) => sameDay(e.date, day));
              const isToday = sameDay(day, new Date());
              const currencies = [...new Set(dayEvents.map((e) => e.bond.moneda))];
              return (
                <button
                  key={i}
                  onClick={() => dayEvents.length > 0 && setSelectedDay(day)}
                  className={clsx(
                    "h-16 rounded-lg border px-1.5 py-1 flex flex-col gap-0.5 overflow-hidden text-left transition-colors w-full",
                    isToday ? "border-gold bg-gold/5"
                    : dayEvents.length > 0 ? "border-ink-border hover:border-gold/60 cursor-pointer"
                    : "border-ink-border cursor-default"
                  )}
                >
                  <span className={clsx("text-[11px]", isToday ? "text-gold font-semibold" : "text-muted")}>
                    {day.getDate()}
                  </span>
                  {currencies.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap">
                      {currencies.slice(0, 4).map((c) => (
                        <span key={c} className={clsx("w-1.5 h-1.5 rounded-full", CURRENCY_DOT[c] ?? "bg-gray-500")} />
                      ))}
                    </div>
                  )}
                  {dayEvents.slice(0, 1).map((e, j) => (
                    <span key={j} className={clsx("text-[9px] leading-tight rounded px-1 truncate", e.tipo === "cupon" ? "bg-gain/10 text-gain" : "bg-warn/10 text-warn")}>
                      {dayEvents.length > 1 ? `${dayEvents.length} cobros` : e.label}
                    </span>
                  ))}
                  {dayEvents.length === 1 && dayEvents[0].importe != null && (
                    <span className="text-[8px] text-muted leading-tight truncate">
                      {formatMoney(dayEvents[0].importe, dayEvents[0].bond.moneda)}
                    </span>
                  )}
                </button>
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
                <div key={i} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-paper truncate">{e.label}</p>
                    <p className="text-[11px] text-muted">
                      {e.date.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    {e.importe != null && (
                      <p className="text-[11px] text-gain font-medium">{formatMoney(e.importe, e.bond.moneda)}</p>
                    )}
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

      <WeeklyStrip events={events} year={year} month={month} />

      {selectedDay && (
        <DayModal date={selectedDay} events={selectedDayEvents} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
