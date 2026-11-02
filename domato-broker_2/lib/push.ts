// Notificaciones push (Web Push) del lado del servidor.
// Las claves VAPID las genera el propio servidor la primera vez y las guarda en app_config
// (tabla sin políticas RLS: solo la service role la lee). Nadie tiene que copiar ni pegar claves.

import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
}

type Claves = { publicKey: string; privateKey: string };

export async function clavesVapid(sb: SupabaseClient = admin()): Promise<Claves> {
  const { data } = await sb.from("app_config").select("valor").eq("clave", "vapid").maybeSingle();
  if (data?.valor?.publicKey && data?.valor?.privateKey) return data.valor as Claves;
  const nuevas = webpush.generateVAPIDKeys();
  // upsert con ignoreDuplicates: si dos pedidos llegan a la vez, gana el primero y releemos.
  await sb.from("app_config").upsert({ clave: "vapid", valor: nuevas }, { onConflict: "clave", ignoreDuplicates: true });
  const { data: otra } = await sb.from("app_config").select("valor").eq("clave", "vapid").maybeSingle();
  return (otra?.valor as Claves) ?? nuevas;
}

export type Aviso = { titulo: string; cuerpo: string; url?: string; tag?: string };

/** Manda el aviso a todos los dispositivos suscriptos. Borra las suscripciones vencidas. */
export async function enviarPush(aviso: Aviso, sb: SupabaseClient = admin()) {
  const { publicKey, privateKey } = await clavesVapid(sb);
  webpush.setVapidDetails("mailto:domato.martin@gmail.com", publicKey, privateKey);
  const { data: subs } = await sb.from("push_subs").select("endpoint, keys");
  let enviados = 0, fallidos = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(aviso), { TTL: 60 * 60 * 24 });
      enviados++;
    } catch (e) {
      fallidos++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
  return { enviados, fallidos, dispositivos: subs?.length ?? 0 };
}
