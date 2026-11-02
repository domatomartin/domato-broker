"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCostos } from "@/lib/useCostos";
import type { Instrumento } from "@/lib/bvm";
import type { TasasFx } from "@/lib/fx";
import type { BondConPropuesta } from "@/lib/estadoCuenta";

export type InfoPropuesta = { id: string; cliente: string | null; asesor: string | null; cuenta: string | null; fx_compra: Record<string, number> | null; perfil: { moneda?: string } | null };

/** Carga todo lo necesario para estados de cuenta, calendario y constancias. */
export function useDatosCartera() {
  const { costos } = useCostos();
  const [bonds, setBonds] = useState<BondConPropuesta[]>([]);
  const [instrumentos, setInstrumentos] = useState<Map<string, Instrumento>>(new Map());
  const [propuestas, setPropuestas] = useState<InfoPropuesta[]>([]);
  const [tasas, setTasas] = useState<(TasasFx & { UI_fecha?: string | null }) | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: p }, t] = await Promise.all([
        supabase.from("bonds").select("*").in("estado", ["activo", "vencido"]),
        supabase.from("propuestas").select("id, cliente, asesor, cuenta, fx_compra, perfil").eq("estado", "ejecutada"),
        fetch("/api/cotizaciones").then((r) => r.json()).catch(() => null),
      ]);
      const lista = (b as BondConPropuesta[]) ?? [];
      setBonds(lista);
      setPropuestas((p as InfoPropuesta[]) ?? []);
      setTasas(t);
      const isins = [...new Set(lista.map((x) => x.isin).filter((x): x is string => !!x))];
      if (isins.length) {
        const { data: ins } = await supabase.from("instrumentos").select("*").in("isin", isins);
        setInstrumentos(new Map(((ins as Instrumento[]) ?? []).map((i) => [i.isin, i])));
      }
      setCargando(false);
    })();
  }, []);

  const fxPorPropuesta = useMemo(
    () => Object.fromEntries(propuestas.filter((p) => p.fx_compra).map((p) => [p.id, p.fx_compra!])),
    [propuestas]
  );
  const cuentas = useMemo(() => [...new Set(bonds.map((b) => b.cuenta?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es")), [bonds]);

  return { costos, bonds, instrumentos, propuestas, tasas, fxPorPropuesta, cuentas, cargando };
}
