"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function aUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function api(body?: object) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/push", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

/** Activa las notificaciones push en este dispositivo (en iPhone, solo con la app instalada). */
export default function ActivarPush() {
  const [estado, setEstado] = useState<"cargando" | "no-soporta" | "ios-sin-instalar" | "bloqueado" | "inactivo" | "activo">("cargando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setEstado(ios && !instalada ? "ios-sin-instalar" : "no-soporta");
        return;
      }
      if (Notification.permission === "denied") { setEstado("bloqueado"); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    })();
  }, []);

  async function activar() {
    setOcupado(true); setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setEstado(permiso === "denied" ? "bloqueado" : "inactivo"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { publicKey, error } = await api();
      if (!publicKey) throw new Error(error ?? "sin clave");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aUint8(publicKey) });
      const r = await api({ accion: "suscribir", sub: sub.toJSON(), dispositivo: navigator.userAgent });
      if (r.error) throw new Error(r.error);
      setEstado("activo");
      await api({ accion: "prueba" });
      setMsg("Listo: te mandamos una notificación de prueba.");
    } catch (e) {
      setMsg(`No se pudo activar: ${e instanceof Error ? e.message : "error"}`);
    } finally { setOcupado(false); }
  }

  async function desactivar() {
    setOcupado(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api({ accion: "baja", endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setEstado("inactivo"); setOcupado(false); setMsg(null);
  }

  async function probar() {
    setOcupado(true);
    const r = await api({ accion: "prueba" });
    setMsg(r.error ? `Error: ${r.error}` : `Enviada a ${r.enviados} dispositivo${r.enviados === 1 ? "" : "s"}.`);
    setOcupado(false);
  }

  const boton = "rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2 text-sm">
      {estado === "cargando" && <p className="text-xs text-muted">Revisando…</p>}
      {estado === "ios-sin-instalar" && <p className="text-xs text-muted">En el iPhone las notificaciones funcionan con la app instalada: abrila desde el ícono de Domato en la pantalla de inicio y activalas ahí.</p>}
      {estado === "no-soporta" && <p className="text-xs text-muted">Este navegador no permite notificaciones push.</p>}
      {estado === "bloqueado" && <p className="text-xs text-warn">Las notificaciones están bloqueadas para Domato. Habilitalas en los ajustes del teléfono (Ajustes → Notificaciones → Domato) y volvé a entrar.</p>}
      {estado === "inactivo" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={activar} disabled={ocupado} className={`${boton} bg-gold text-white`}>🔔 Activar notificaciones en este dispositivo</button>
          <span className="text-xs text-muted">Te avisa cuando se activa una señal en la estrategia de un cliente.</span>
        </div>
      )}
      {estado === "activo" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gain">🔔 Notificaciones activas en este dispositivo</span>
          <button type="button" onClick={probar} disabled={ocupado} className={`${boton} border border-ink-border text-paper`}>Enviar prueba</button>
          <button type="button" onClick={desactivar} disabled={ocupado} className="text-xs text-muted underline">Desactivar</button>
        </div>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
