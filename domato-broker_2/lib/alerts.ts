import { BondComputed } from "./types";
import { daysUntil } from "./calculations";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertItem = {
  id: string;
  tipo: "cupon" | "vencimiento" | "mercado" | "rendimiento";
  severidad: AlertSeverity;
  mensaje: string;
};

export function computeBondAlerts(bonds: BondComputed[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  bonds.forEach((b) => {
    const diasCupon = daysUntil(b.proximo_pago_interes);
    if (diasCupon !== null && diasCupon >= 0 && diasCupon <= 30) {
      alerts.push({
        id: `cupon-${b.id}`,
        tipo: "cupon",
        severidad: diasCupon <= 15 ? "warning" : "info",
        mensaje: `${b.nombre}: pago de cupón en ${diasCupon} día${diasCupon === 1 ? "" : "s"}.`,
      });
    }

    const diasVenc = daysUntil(b.proximo_vencimiento);
    if (diasVenc !== null && diasVenc >= 0 && diasVenc <= 60) {
      alerts.push({
        id: `venc-${b.id}`,
        tipo: "vencimiento",
        severidad: diasVenc <= 30 ? "warning" : "info",
        mensaje: `${b.nombre}: vencimiento en ${diasVenc} día${diasVenc === 1 ? "" : "s"}.`,
      });
    }

    // Proxy de "cambio fuerte en rendimiento": no tenemos precio del día
    // anterior por bono todavía (solo el valor total de cartera se
    // snapshotea diariamente), así que se usa la variación acumulada desde
    // la compra como señal de atención. Es una aproximación honesta, no un
    // dato intradiario.
    if (Math.abs(b.rentabilidad_pct) >= 10) {
      alerts.push({
        id: `rend-${b.id}`,
        tipo: "rendimiento",
        severidad: b.rentabilidad_pct < 0 ? "critical" : "info",
        mensaje: `${b.nombre}: variación acumulada desde la compra de ${b.rentabilidad_pct >= 0 ? "+" : ""}${b.rentabilidad_pct.toFixed(1)}%.`,
      });
    }
  });

  return alerts;
}

export function computeMarketAlerts(
  tickerItems: { label: string; value: string; change: number }[]
): AlertItem[] {
  return tickerItems
    .filter((i) => Math.abs(i.change) >= 2)
    .map((i) => ({
      id: `mkt-${i.label}`,
      tipo: "mercado" as const,
      severidad: (Math.abs(i.change) >= 4 ? "critical" : "warning") as AlertSeverity,
      mensaje: `${i.label}: ${i.change > 0 ? "suba" : "baja"} importante de ${Math.abs(i.change).toFixed(2)}% hoy.`,
    }));
}

export function severityOrder(s: AlertSeverity) {
  return s === "critical" ? 0 : s === "warning" ? 1 : 2;
}
