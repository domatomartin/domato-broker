"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtFecha } from "@/components/BondAnalysis";

type Link = { token: string; cuenta: string; cliente: string | null; creado: string; revocado: boolean; ultimo_acceso: string | null; accesos: number };

function nuevoToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Links privados de solo lectura para que cada cliente vea su cartera. */
export default function PortalLinks({ clientes }: { clientes: { c: string; nombre: string }[] }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function cargar() {
    const { data, error } = await supabase.from("portal_links").select("*").order("creado", { ascending: false });
    if (error) setError(error.message);
    setLinks((data as Link[]) ?? []);
  }
  useEffect(() => { cargar(); }, []);

  const url = (t: string) => `${window.location.origin}/portal/${t}`;
  async function crear(c: string, nombre: string) {
    setError(null);
    const { error } = await supabase.from("portal_links").insert({ token: nuevoToken(), cuenta: c, cliente: nombre });
    if (error) setError(error.message); else cargar();
  }
  async function desactivar(t: string) {
    const { error } = await supabase.from("portal_links").update({ revocado: true }).eq("token", t);
    if (error) setError(error.message); else cargar();
  }
  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(url(t)); setCopiado(t); setTimeout(() => setCopiado(null), 2000); } catch { window.prompt("Copiá el link:", url(t)); }
  }

  if (!links) return <p className="text-xs text-muted">Cargando…</p>;
  return (
    <div className="flex flex-col gap-2">
      {clientes.map(({ c, nombre }) => {
        const activo = links.find((l) => l.cuenta === c && !l.revocado);
        return (
          <div key={c} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-border px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-paper">{nombre}</p>
              {activo ? (
                <p className="text-[11px] text-muted">
                  Link activo desde {fmtFecha(activo.creado.slice(0, 10))} · {activo.accesos} {activo.accesos === 1 ? "visita" : "visitas"}
                  {activo.ultimo_acceso ? ` · última ${fmtFecha(activo.ultimo_acceso.slice(0, 10))}` : ""}
                </p>
              ) : (
                <p className="text-[11px] text-muted">Sin link para el cliente</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {activo ? (
                <>
                  <button type="button" onClick={() => copiar(activo.token)} className="rounded-full bg-gold px-3 py-1.5 font-medium text-white">{copiado === activo.token ? "✓ Copiado" : "Copiar link"}</button>
                  <a href={url(activo.token)} target="_blank" rel="noreferrer" className="underline text-muted">Ver como el cliente</a>
                  <button type="button" onClick={() => desactivar(activo.token)} className="underline text-loss">Desactivar</button>
                </>
              ) : (
                <button type="button" onClick={() => crear(c, nombre)} className="rounded-full border border-ink-border px-3 py-1.5 font-medium text-paper">Crear link</button>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-loss">{error}</p>}
      <p className="text-[10px] text-muted">
        El cliente ve su cartera, el resultado y los próximos cobros, sin poder modificar nada ni ver otras carteras. Cualquiera que tenga el link puede verlo: mandalo por un canal privado. Si lo desactivás deja de funcionar al instante; podés crear uno nuevo cuando quieras.
      </p>
    </div>
  );
}
