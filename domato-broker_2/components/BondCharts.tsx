"use client";

import { cobrosAcumulados, sensibilidad, type AnalisisBono } from "@/lib/bondMath";

const ISO = ["USD", "UYU", "ARS", "EUR", "BRL", "COP"];

function monto(v: number, moneda: string | null) {
  if (!moneda) return v.toLocaleString("es-UY", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 1 });
  if (ISO.includes(moneda)) {
    return new Intl.NumberFormat("es-UY", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(v);
  }
  return `${v.toLocaleString("es-UY", { maximumFractionDigits: 0 })} ${moneda}`;
}

/** Paso "lindo" para un eje: 1, 2, 2.5 o 5 por una potencia de 10. */
function pasoRedondo(bruto: number) {
  if (bruto <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const r = bruto / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
}

function compacto(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

/**
 * Curva de lo cobrado acumulado (cupones + capital) contra lo invertido hoy.
 * `k` = valor nominal / 100; con k=1 los importes quedan cada 100 de nominal.
 */
export function CobrosChart({ a, k = 1, moneda = null }: { a: AnalisisBono; k?: number; moneda?: string | null }) {
  const puntos = cobrosAcumulados(a).map((p) => ({ anios: p.anios, acumulado: p.acumulado * k }));
  return <CobrosAcumuladosSvg puntos={puntos} inversion={a.precioSucio * k} moneda={moneda} />;
}

/** Igual que CobrosChart pero para una cartera: flujos ya en plata. */
export function CobrosCarteraChart({ flujos, inversion, moneda = null }: { flujos: { anios: number; total: number }[]; inversion: number; moneda?: string | null }) {
  const orden = [...flujos].sort((x, y) => x.anios - y.anios);
  let acc = 0;
  const puntos = orden.map((f) => ({ anios: f.anios, acumulado: (acc += f.total) }));
  return <CobrosAcumuladosSvg puntos={puntos} inversion={inversion} moneda={moneda} />;
}

function CobrosAcumuladosSvg({ puntos, inversion, moneda }: { puntos: { anios: number; acumulado: number }[]; inversion: number; moneda: string | null }) {
  if (!puntos.length) return null;
  const k = 1;

  const W = 520, H = 210, pl = 40, pr = 12, pt = 20, pb = 26;
  const total = puntos[puntos.length - 1].acumulado * k;
  const tMax = puntos[puntos.length - 1].anios || 1;
  const paso_ = pasoRedondo(Math.max(total, inversion) / 4);
  const yMax = Math.ceil((Math.max(total, inversion) * 1.06) / paso_) * paso_;
  const x = (t: number) => pl + (t / tMax) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / yMax) * (H - pt - pb);

  // Escalones: el acumulado sube en cada fecha de pago.
  let d = `M ${x(0)} ${y(0)}`;
  let prev = 0;
  for (const p of puntos) {
    d += ` L ${x(p.anios)} ${y(prev)} L ${x(p.anios)} ${y(p.acumulado * k)}`;
    prev = p.acumulado * k;
  }
  const area = `${d} L ${x(tMax)} ${y(0)} Z`;

  const ticksY: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += paso_) ticksY.push(v);
  const anioInicio = new Date().getFullYear();
  const paso = tMax > 12 ? 4 : tMax > 6 ? 2 : 1;
  const ticksX: number[] = [];
  for (let t = 0; t <= tMax + 1e-9; t += paso) ticksX.push(t);


  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cobros acumulados contra lo invertido">
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="stroke-ink-border" strokeWidth={1} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" className="fill-muted" fontSize={11}>{compacto(v)}</text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-muted" fontSize={11}>{anioInicio + Math.round(t)}</text>
      ))}

      <path d={area} className="fill-gain" fillOpacity={0.12} />
      <path d={d} className="stroke-gain" strokeWidth={2} fill="none" strokeLinejoin="round" />

      {/* Lo invertido hoy */}
      <line x1={pl} x2={W - pr} y1={y(inversion)} y2={y(inversion)} className="stroke-paper" strokeWidth={1.2} strokeDasharray="5 4" />
      <text x={pl + 6} y={y(inversion) - 6} className="fill-paper" fontSize={12} fontWeight={600}>
        Invertido hoy {monto(inversion, moneda)}
      </text>

      <circle cx={x(tMax)} cy={y(total)} r={4} className="fill-gain" />
      <text x={x(tMax) - 8} y={y(total) + 4} textAnchor="end" className="fill-gain" fontSize={13} fontWeight={700}>
        Total cobrado {monto(total, moneda)}
      </text>
    </svg>
  );
}

/** Cuánto valdría hoy el bono si la tasa de mercado sube o baja. */
export function SensibilidadChart({ a, k = 1, moneda = null }: { a: AnalisisBono; k?: number; moneda?: string | null }) {
  const filas = sensibilidad(a, [-200, -100, 0, 100, 200]);
  if (!filas.length) return null;
  const maxAbs = Math.max(...filas.map((f) => Math.abs(f.variacionPct)), 1);
  const inversion = a.precioSucio * k;

  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((f) => {
        const ancho = (Math.abs(f.variacionPct) / maxAbs) * 50;
        const sube = f.variacionPct > 0;
        const etiqueta = f.deltaPb === 0 ? "Tasa actual" : `${f.deltaPb > 0 ? "+" : "−"}${Math.abs(f.deltaPb) / 100} punto${Math.abs(f.deltaPb) === 100 ? "" : "s"}`;
        return (
          <div key={f.deltaPb} className="grid grid-cols-[104px_1fr_92px] items-center gap-2 text-[11px]">
            <span className="text-muted leading-tight">
              {etiqueta}
              <span className="block text-[10px] opacity-80">TIR {f.tir.toLocaleString("es-UY", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%</span>
            </span>
            <div className="relative h-4">
              <div className="absolute inset-y-0 left-1/2 w-px bg-ink-border" />
              {f.deltaPb !== 0 && (
                <div
                  className={sube ? "absolute inset-y-0.5 left-1/2 rounded-r bg-gain/70" : "absolute inset-y-0.5 right-1/2 rounded-l bg-loss/60"}
                  style={{ width: `${ancho}%` }}
                />
              )}
            </div>
            <span className={`text-right tabular-nums ${f.deltaPb === 0 ? "text-paper" : sube ? "text-gain" : "text-loss"}`}>
              {f.deltaPb === 0 ? monto(inversion, moneda) : `${sube ? "+" : ""}${f.variacionPct.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`}
              <span className="block text-[10px] text-muted">
                {f.deltaPb === 0
                  ? `precio ${f.precioLimpio.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`
                  : `${sube ? "+" : "−"}${monto(Math.abs((inversion * f.variacionPct) / 100), moneda)}`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
