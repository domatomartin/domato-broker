"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import { fmtFecha } from "@/components/BondAnalysis";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

// Tablas que entran en el respaldo (todo lo que carga el asesor; el catálogo solo con los datos manuales).
const TABLAS = ["bonds", "propuestas", "clientes", "cliente_notas", "costos_config", "seguimiento", "patrimonio_snapshots", "movimientos", "portal_links"];

export default function SeguridadPage() {
  const [factores, setFactores] = useState<Factor[] | null>(null);
  const [alta, setAlta] = useState<{ id: string; qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [respaldando, setRespaldando] = useState(false);

  async function cargar() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactores(((data?.totp ?? []) as Factor[]).filter((f) => f.status === "verified"));
  }
  useEffect(() => { cargar(); }, []);

  async function empezar() {
    setMsg(null);
    // Si quedó un alta a medias, se limpia antes de crear otra.
    const { data: todos } = await supabase.auth.mfa.listFactors();
    for (const f of (todos?.all ?? []).filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Domato ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) { setMsg(`No se pudo iniciar: ${error?.message ?? "error"}`); return; }
    setAlta({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
  }

  async function confirmar() {
    if (!alta) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.id, code: codigo.trim() });
    if (error) { setMsg("Código incorrecto. Revisá que la hora del teléfono esté bien y probá con el código nuevo."); return; }
    setAlta(null); setCodigo("");
    setMsg("Listo: desde ahora, al entrar con la contraseña te va a pedir el código de la app.");
    cargar();
  }

  async function quitar(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setMsg(error ? `No se pudo quitar: ${error.message}` : "Verificación en dos pasos desactivada.");
    cargar();
  }

  async function respaldo() {
    setRespaldando(true); setMsg(null);
    const out: Record<string, unknown> = { generado: new Date().toISOString(), app: "Domato Broker" };
    for (const t of TABLAS) {
      const { data, error } = await supabase.from(t).select("*");
      out[t] = error ? { error: error.message } : data;
    }
    const { data: ins } = await supabase.from("instrumentos").select("isin, nombre, cupon_manual, vencimiento_manual, frecuencia, irpf_manual, amortizaciones, escalonado, rendimiento_estimado, distribucion_estimada, oculto, notas");
    out.instrumentos_datos_manuales = ins;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `respaldo-domato-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setRespaldando(false);
    setMsg("Respaldo descargado. Guardalo en un lugar seguro (Drive, iCloud o un pendrive): tiene los datos de tus clientes.");
  }

  const activa = (factores?.length ?? 0) > 0;
  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-paper">Seguridad</h1>
        <p className="text-sm text-muted mt-1">Verificación en dos pasos para entrar y respaldo de todos tus datos.</p>
      </div>

      <Panel title="Verificación en dos pasos">
        {factores == null ? <p className="text-sm text-muted">Cargando…</p> : activa ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gain">✓ Activada. Al entrar con la contraseña se pide además el código de tu app de autenticación.</p>
            {factores.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-sm">
                <span className="text-paper">{f.friendly_name ?? "App de autenticación"} · desde {fmtFecha(f.created_at.slice(0, 10))}</span>
                <button type="button" onClick={() => quitar(f.id)} className="text-xs text-loss underline">Desactivar</button>
              </div>
            ))}
          </div>
        ) : alta ? (
          <div className="flex flex-col gap-3">
            <ol className="list-decimal pl-5 text-sm text-paper">
              <li>Abrí una app de autenticación en el celular: <b>Google Authenticator</b>, <b>Authy</b> o, en el iPhone, <b>Ajustes → Contraseñas</b>.</li>
              <li>Escaneá este código (o cargá la clave a mano).</li>
              <li>Escribí el código de 6 dígitos que te muestra.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={alta.qr} alt="Código QR para la app de autenticación" className="h-44 w-44 rounded-lg bg-white p-2" />
              <div className="text-xs text-muted">
                <p>Clave para cargar a mano:</p>
                <p className="mt-1 break-all font-mono text-sm text-paper">{alta.secreto}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="w-32 rounded border border-ink-border bg-ink px-3 py-2 text-center tracking-[0.3em] text-paper" />
              <button type="button" onClick={confirmar} disabled={codigo.length !== 6} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Activar</button>
              <button type="button" onClick={() => setAlta(null)} className="text-sm text-muted underline">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-paper">Si alguien consigue tu contraseña, igual no puede entrar sin el código que genera tu celular cada 30 segundos.</p>
            <button type="button" onClick={empezar} className="self-start rounded bg-gold px-4 py-2 text-sm font-medium text-white">Activar verificación en dos pasos</button>
          </div>
        )}
      </Panel>

      <Panel title="Respaldo de datos">
        <p className="text-sm text-paper">Descarga en un archivo todo lo que cargaste: carteras, propuestas, fichas y notas de clientes, costos, lista de seguimiento, histórico y los datos que completaste a mano en el catálogo.</p>
        <button type="button" onClick={respaldo} disabled={respaldando} className="self-start rounded border border-ink-border px-4 py-2 text-sm text-paper disabled:opacity-50">{respaldando ? "Preparando…" : "⬇ Descargar respaldo"}</button>
        <p className="text-[11px] text-muted">Conviene bajarlo una vez por mes. Supabase además guarda copias diarias de la base en su plan pago.</p>
      </Panel>

      {msg && <p className="rounded-lg bg-ink px-4 py-3 text-sm text-paper">{msg}</p>}
    </div>
  );
}
