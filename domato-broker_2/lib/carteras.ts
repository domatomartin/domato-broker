import type { Bond } from "@/lib/types";

// Carteras conocidas con nombre descriptivo. Cualquier otro valor de `cuenta`
// que aparezca en los bonos se muestra como una cartera más, con su propio nombre.
const NOMBRES_CONOCIDOS: Record<string, string> = {
  "2191": "Cta. 2191 — Nelson",
  "2192": "Cta. 2192 — Conjunta",
};

export const CARTERAS_BASE = Object.keys(NOMBRES_CONOCIDOS);

export const SIN_CARTERA = "__sin_cartera__";

export function carteraLabel(cuenta: string): string {
  if (cuenta === SIN_CARTERA) return "Sin cartera";
  return NOMBRES_CONOCIDOS[cuenta] ?? cuenta;
}

/** Lista de carteras: las conocidas + las que aparecen en los bonos cargados. */
export function listarCarteras(bonds: Pick<Bond, "cuenta">[]): string[] {
  const extra = new Set<string>();
  for (const b of bonds) {
    const c = b.cuenta?.trim();
    if (c && !NOMBRES_CONOCIDOS[c]) extra.add(c);
  }
  return [...CARTERAS_BASE, ...[...extra].sort((a, b) => a.localeCompare(b, "es"))];
}
