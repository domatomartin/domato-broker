// Exportar a Excel (.xlsx) desde el navegador. La librería se carga solo al exportar.

export type Hoja = { nombre: string; filas: Record<string, string | number | null | undefined>[] };

export async function descargarExcel(archivo: string, hojas: Hoja[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ "Sin datos": "" }]);
    // Ancho de columnas según el contenido más largo (tope 50).
    const cols = Object.keys(h.filas[0] ?? { "Sin datos": "" });
    ws["!cols"] = cols.map((c) => ({ wch: Math.min(50, Math.max(c.length, ...h.filas.map((f) => String(f[c] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, archivo.endsWith(".xlsx") ? archivo : `${archivo}.xlsx`);
}

/** Redondeo para que Excel muestre números limpios. */
export const r2 = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
