// Conversión de cualquier moneda de la cartera a dólares, con las cotizaciones de /api/cotizaciones.
export type TasasFx = {
  UYU_per_USD: number;
  UI_in_UYU: number;
  ARS_per_USD?: number;
  EUR_per_USD?: number;
  BRL_per_USD?: number;
};

// Valores de respaldo si la cotización del día no llega (aproximados).
const RESPALDO = { EUR_per_USD: 0.9, BRL_per_USD: 5.4, ARS_per_USD: 1450 };

export function aUSD(valor: number, moneda: string, t: TasasFx): number {
  switch (moneda) {
    case "USD": return valor;
    case "UYU": return valor / t.UYU_per_USD;
    case "UI": return (valor * t.UI_in_UYU) / t.UYU_per_USD;
    case "ARS": return valor / (t.ARS_per_USD ?? RESPALDO.ARS_per_USD);
    case "EUR": return valor / (t.EUR_per_USD ?? RESPALDO.EUR_per_USD);
    case "BRL": return valor / (t.BRL_per_USD ?? RESPALDO.BRL_per_USD);
    default: return valor; // UP, UR y otras: sin cotización cargada
  }
}
