"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { computePortfolio } from "@/lib/calculations";
import { computeBondAlerts, computeMarketAlerts, severityOrder, AlertItem } from "@/lib/alerts";
import { Panel, Badge } from "@/components/Card";
import Link from "next/link";
import type { EstadoSenales } from "@/lib/senales";
import ActivarPush from "@/components/ActivarPush";

type PropSenales = { id: string; cliente: string | null; cuenta: string | null; senales_estado: EstadoSenales | null };

const TIPO_LABEL: Record<AlertItem["tipo"], string> = {
  cupon: "Cupón",
  vencimiento: "Vencimiento",
  mercado: "Mercado",
  rendimiento: "Rendimiento",
};

function severityBadge(s: AlertItem["severidad"]) {
  if (s === "critical") return <Badge tone="critical">Crítica</Badge>;
  if (s === "warning") return <Badge tone="warning">Atención</Badge>;
  return <Badge tone="info">Informativa</Badge>;
}

export default function AlertasPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [ticker, setTicker] = useState<{ label: string; value: string; change: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [props, setProps] = useState<PropSenales[]>([]);
  const [revisando, setRevisando] = useState(false);

  async function cargarSenales() {
    const { data } = await supabase.from("propuestas").select("id, cliente, cuenta, senales_estado").not("senales", "is", null).in("estado", ["ejecutada", "presentada"]);
    setProps((data as PropSenales[]) ?? []);
  }
  async function revisarAhora() {
    setRevisando(true);
    const { data } = await supabase.auth.getSession();
    await fetch("/api/alerts?sinEmail=1", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
    await cargarSenales();
    setRevisando(false);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("bonds").select("*").eq("estado", "activo");
      setBonds((data as Bond[]) ?? []);
      setLoading(false);
    }
    load();
    cargarSenales();

    fetch("/api/indices")
      .then((r) => r.json())
      .then((data) => setTicker(data.items ?? []))
      .catch(() => setTicker([]));
  }, []);

  const computed = computePortfolio(bonds);
  const alerts = [...computeBondAlerts(computed), ...computeMarketAlerts(ticker)].sort(
    (a, b) => severityOrder(a.severidad) - severityOrder(b.severidad)
  );

  const criticas = alerts.filter((a) => a.severidad === "critical");
  const atencion = alerts.filter((a) => a.severidad === "warning");
  const info = alerts.filter((a) => a.severidad === "info");

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Alertas inteligentes</h1>
        <p className="text-sm text-muted mt-1">
          Cupones y vencimientos próximos, movimientos fuertes de mercado y variaciones relevantes de tu cartera.
        </p>
      </div>

      <Panel
        title={`${alerts.length} alerta${alerts.length === 1 ? "" : "s"} activa${alerts.length === 1 ? "" : "s"}`}
      >
        {loading ? (
          <p className="text-sm text-muted py-6 text-center">Cargando…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">
            No hay alertas por ahora. Volvé a chequear cuando se acerque un pago o un vencimiento.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-ink-border/50">
            {[...criticas, ...atencion, ...info].map((a) => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {severityBadge(a.severidad)}
                  <span className="text-xs text-muted uppercase tracking-wide">{TIPO_LABEL[a.tipo]}</span>
                </div>
                <p className="text-sm text-paper text-right flex-1">{a.mensaje}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Señales de las estrategias de clientes"
        action={
          <button type="button" onClick={revisarAhora} disabled={revisando} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold disabled:opacity-50">
            {revisando ? "Revisando…" : "↻ Revisar ahora"}
          </button>
        }
      >
        {!props.length ? (
          <p className="text-sm text-muted">Ningún cliente tiene estrategia con señales todavía. Se arman en cada propuesta, en “Estrategia de seguimiento”.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {props.map((p) => {
              const ev = p.senales_estado?.evaluadas ?? [];
              const activas = ev.filter((x) => x.activa);
              return (
                <div key={p.id} className={`rounded-xl border px-4 py-3 ${activas.length ? "border-loss/40 bg-loss/5" : "border-ink-border"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/propuestas/${p.id}`} className="font-medium text-paper hover:underline">{p.cliente || p.cuenta || "Cliente"}</Link>
                    <span className="text-xs text-muted">
                      {activas.length ? `${activas.length} activa${activas.length !== 1 ? "s" : ""}` : "sin señales activas"} de {ev.length}
                      {p.senales_estado?.fecha ? ` · revisado ${new Date(p.senales_estado.fecha).toLocaleDateString("es-UY")}` : " · aún sin revisar"}
                    </span>
                  </div>
                  {activas.map((x, i) => (
                    <p key={i} className="mt-1 text-sm text-paper">⚠ {x.descripcion} <span className="text-muted">(hoy {x.valor?.toLocaleString("es-UY", { maximumFractionDigits: 3 })})</span> → {x.accion}</p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Notificaciones">
        <ActivarPush />
        <p className="text-[11px] text-muted">
          Todos los días a las 9 se revisan las señales de las estrategias de tus clientes; cuando una se activa por primera vez te llega un aviso a cada dispositivo donde las activaste.
          Tocando el aviso se abre la propuesta del cliente. Los avisos por email se suman cuando cargues la clave de Resend en Vercel.
        </p>
      </Panel>
    </div>
  );
}
