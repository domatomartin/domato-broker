"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { computePortfolio } from "@/lib/calculations";
import { computeBondAlerts, computeMarketAlerts, severityOrder, AlertItem } from "@/lib/alerts";
import { Panel, Badge } from "@/components/Card";

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

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("bonds").select("*").eq("estado", "activo");
      setBonds((data as Bond[]) ?? []);
      setLoading(false);
    }
    load();

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

      <Panel title="Notificaciones por email o push">
        <p className="text-xs text-muted">
          Estas alertas ya se calculan en <code className="text-gold">/api/alerts</code>, listas para conectar a un
          cron diario. Para que además lleguen por email, sumá una cuenta de{" "}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-gold underline">
            Resend
          </a>{" "}
          (o el proveedor que prefieras) y las variables <code className="text-gold">RESEND_API_KEY</code> y{" "}
          <code className="text-gold">ALERT_EMAIL_TO</code> en tu <code className="text-gold">.env.local</code> /
          Vercel — el endpoint ya está preparado para tomarlas cuando existan. Notificaciones push requieren además
          registrar un service worker en el navegador; avisame si querés que la sumemos.
        </p>
      </Panel>
    </div>
  );
}
