"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const EMAIL_DUENIO = "domato.martin@gmail.com";
export type Rol = "duenio" | "colaborador" | "lectura" | "ninguno";

let cache: { email: string; rol: Rol } | null = null;

/** Rol del usuario logueado: el dueño, un colaborador del equipo, solo lectura, o nadie. */
export async function rolActual(): Promise<Rol> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email?.toLowerCase() ?? "";
  if (!email) return "ninguno";
  if (cache?.email === email) return cache.rol;
  let rol: Rol = "ninguno";
  if (email === EMAIL_DUENIO) rol = "duenio";
  else {
    const { data: fila } = await supabase.from("equipo").select("rol, activo").eq("email", email).maybeSingle();
    const f = fila as { rol: Rol; activo: boolean } | null;
    if (f?.activo) rol = f.rol;
  }
  cache = { email, rol };
  return rol;
}

export function useRol() {
  const [rol, setRol] = useState<Rol | null>(cache?.rol ?? null);
  useEffect(() => {
    rolActual().then(setRol);
    const { data } = supabase.auth.onAuthStateChange(() => { cache = null; rolActual().then(setRol); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { rol, esDuenio: rol === "duenio", puedeEditar: rol === "duenio" || rol === "colaborador" };
}
