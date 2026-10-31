// Cotizaciones oficiales del Banco Central del Uruguay (BCU). Solo en el servidor.
// Se usa para el valor diario de la Unidad Indexada (código 9800), que publica el BCU según el INE.

const ENDPOINT = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";

const isoLocal = (d: Date) => d.toISOString().slice(0, 10);

/** Último valor publicado de una moneda/índice del BCU en los últimos 10 días. */
export async function cotizacionBcu(codigo: number): Promise<{ valor: number; fecha: string } | null> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 10 * 86_400_000);
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda><cot:item>${codigo}</cot:item></cot:Moneda>
        <cot:FechaDesde>${isoLocal(desde)}</cot:FechaDesde>
        <cot:FechaHasta>${isoLocal(hasta)}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"Cotizaction/AWSBCUCOTIZACIONES.Execute"' },
      body,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const xml = await r.text();
    // Cada dato trae <Fecha>, <TCC> y <TCV>; nos quedamos con el más reciente.
    const datos = [...xml.matchAll(/<Fecha>([^<]+)<\/Fecha>[\s\S]*?<TCV>([^<]+)<\/TCV>/g)]
      .map((m) => ({ fecha: m[1].slice(0, 10), valor: Number(m[2]) }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return datos.at(-1) ?? null;
  } catch {
    return null;
  }
}

export const UI_RESPALDO = 6.6026; // solo si el BCU no responde

/** Valor de la UI en pesos (oficial del día), con respaldo. */
export async function valorUI(): Promise<{ valor: number; fecha: string | null; fuente: "BCU" | "respaldo" }> {
  const d = await cotizacionBcu(9800);
  return d ? { valor: d.valor, fecha: d.fecha, fuente: "BCU" } : { valor: UI_RESPALDO, fecha: null, fuente: "respaldo" };
}
