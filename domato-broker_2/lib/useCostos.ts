"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COSTOS_DEFECTO, normalizarCostos, type Costos } from "@/lib/costos";

/** Lee la configuración de costos (fila única) y permite guardarla. */
export function useCostos() {
  const [costos, setCostos] = useState<Costos>(COSTOS_DEFECTO);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.from("costos_config").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      if (!vivo) return;
      setCostos(normalizarCostos(data as Partial<Costos> | null));
      setCargado(true);
    });
    return () => { vivo = false; };
  }, []);

  async function guardar(nuevos: Costos) {
    const { error } = await supabase.from("costos_config").upsert({ id: 1, ...nuevos, updated_at: new Date().toISOString() });
    if (!error) setCostos(nuevos);
    return error?.message ?? null;
  }

  return { costos, cargado, guardar };
}

