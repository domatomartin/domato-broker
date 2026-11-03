"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Aceptacion = { nombre: string; fecha: string } | null;

function nuevoToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Link para que el cliente vea la propuesta y la acepte online. */
export default function CompartirPropuesta({ propuestaId, cliente, antesDeCompartir, puede }: { propuestaId: string; cliente: string; antesDeCompartir: () => Promise<unknown>; puede: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [aceptacion, setAceptacion] = useState<Aceptacion>(null);
  const [visitas, setVisitas] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function cargar() {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from("portal_links").select("token, accesos").eq("propuesta_id", propuestaId).eq("revocado", false).order("creado", { ascending: false }).limit(1),
      supabase.from("propuestas").select("aceptacion").eq("id", propuestaId).maybeSingle(),
    ]);
    const link = (l as { token: string; accesos: number }[] | null)?.[0];
    setToken(link?.token ?? null);
    setVisitas(link?.accesos ?? 0);
    setAceptacion((p as { aceptacion: Aceptacion } | null)?.aceptacion ?? null);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propuestaId]);

  const url = token ? `${window.location.origin}/portal/${token}` : "";
  async function crear() {
    setErr(null);
    await antesDeCompartir();
    const t = nuevoToken();
    const { error } = await supabase.from("portal_links").insert({ token: t, cuenta: null, cliente, propuesta_id: propuestaId });
    if (error) { setErr(error.message); return; }
    setToken(t);
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { window.prompt("Copiá el link:", url); }
  }
  async function desactivar() {
    if (!token) return;
    await supabase.from("portal_links").update({ revocado: true }).eq("token", token);
    setToken(null);
  }
  const wa = token ? `https://wa.me/?text=${encodeURIComponent(`Hola${cliente ? ` ${cliente.split(" ")[0]}` : ""}, te comparto la propuesta de inversión. Podés verla y aceptarla acá: ${url}`)}` : "";

  return (
    <div className="flex flex-col gap-2 text-sm">
      {aceptacion ? (
        <p className="rounded-lg bg-gain/10 px-3 py-2 font-medium text-gain">✓ Aceptada por {aceptacion.nombre} el {new Date(aceptacion.fecha).toLocaleString("es-UY", { dateStyle: "medium", timeStyle: "short" })}</p>
      ) : token ? (
        <p className="text-xs text-muted">Compartida · {visitas} {visitas === 1 ? "visita" : "visitas"} · todavía no la aceptó</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {token ? (
          <>
            <button type="button" onClick={copiar} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-white">{copiado ? "✓ Copiado" : "Copiar link"}</button>
            <a href={wa} target="_blank" rel="noreferrer" className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper">Enviar por WhatsApp</a>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">Ver como el cliente</a>
            <button type="button" onClick={cargar} className="text-xs text-muted underline">Actualizar</button>
            <button type="button" onClick={desactivar} className="text-xs text-loss underline">Desactivar link</button>
          </>
        ) : (
          <button type="button" onClick={crear} disabled={!puede} className="rounded border border-ink-border px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50">Compartir con el cliente para que la acepte</button>
        )}
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}
      <p className="text-[10px] text-muted">El cliente ve la composición, el rendimiento esperado y el análisis, y puede aceptarla con su nombre. Queda registrado cuándo y desde qué dispositivo, y te llega un aviso al celular.</p>
    </div>
  );
}
