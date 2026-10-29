import { createClient } from "@supabase/supabase-js";

/**
 * Verifica el token de Supabase que manda la app (Authorization: Bearer …).
 * Devuelve el usuario o null. Usar en rutas de API que no deben ser públicas.
 */
export async function usuarioDesdeRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user ?? null;
}
