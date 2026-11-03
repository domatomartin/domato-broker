"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import { fmtFecha } from "@/components/BondAnalysis";
import { useRol } from "@/lib/rol";

type Miembro = { email: string; rol: "colaborador" | "lectura"; activo: boolean; creado: string };

async function api(metodo: "GET" | "POST", body?: unknown) {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const r = await fetch("/api/equipo", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

const ROLES = {
  colaborador: "Ve todo y arma propuestas, fichas, notas y reuniones. No ejecuta compras, no borra ni cambia costos.",
  lectura: "Solo ve: carteras, clientes, propuestas y reportes.",
};

export default function EquipoPage() {
  const { esDuenio, rol } = useRol();
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [email, setEmail] = useState("");
  const [nuevoRol, setNuevoRol] = useState<Miembro["rol"]>("colaborador");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    const r = await api("GET");
    setMiembros(r.miembros ?? []);
  }
  useEffect(() => { if (esDuenio) cargar(); }, [esDuenio]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setEnviando(true);
    const r = await api("POST", { email, rol: nuevoRol, activo: true });
    setEnviando(false);
    if (r.error) { setMsg({ ok: false, texto: r.error }); return; }
    setMsg({
      ok: true,
      texto: r.invitacion === "enviada" ? `Listo. Le llegó un mail a ${email} para crear su contraseña.`
        : r.invitacion === "ya tenía usuario" ? `Listo. ${email} ya tenía usuario: entra con su contraseña (o “Olvidé mi contraseña”).`
        : r.invitacion ? `Quedó agregado, pero el mail no salió (${r.invitacion}). Que entre con “Olvidé mi contraseña”.`
        : "Actualizado.",
    });
    setEmail("");
    cargar();
  }

  async function cambiar(m: Miembro, cambios: Partial<Miembro>) {
    const r = await api("POST", { ...m, ...cambios });
    if (r.error) setMsg({ ok: false, texto: r.error });
    cargar();
  }

  if (rol && !esDuenio) return <p className="text-sm text-muted">Esta sección es solo para el administrador.</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-paper">Equipo</h1>
        <p className="text-sm text-muted">Dale acceso a alguien que trabaje con vos. Cada uno entra con su propio usuario y contraseña.</p>
      </div>

      <Panel title="Agregar a alguien">
        <form onSubmit={agregar} className="flex flex-col gap-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com"
            className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper" />
          <div className="flex flex-col gap-2 sm:flex-row">
            {(Object.keys(ROLES) as Miembro["rol"][]).map((r) => (
              <label key={r} className={`flex flex-1 cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${nuevoRol === r ? "border-gold bg-gold/5" : "border-ink-border"}`}>
                <input type="radio" name="rol" checked={nuevoRol === r} onChange={() => setNuevoRol(r)} className="mt-1" />
                <span><span className="font-medium capitalize text-paper">{r === "lectura" ? "Solo lectura" : "Colaborador"}</span>
                  <span className="block text-xs text-muted">{ROLES[r]}</span></span>
              </label>
            ))}
          </div>
          <button type="submit" disabled={enviando} className="self-start rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {enviando ? "Enviando…" : "Agregar y mandar invitación"}
          </button>
          {msg && <p className={`rounded px-3 py-2 text-sm ${msg.ok ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>{msg.texto}</p>}
        </form>
      </Panel>

      <Panel title="Quiénes tienen acceso">
        <ul className="flex flex-col divide-y divide-ink-border text-sm">
          <li className="flex items-center justify-between py-2">
            <span className="text-paper">Vos (administrador)</span><span className="text-xs text-muted">Acceso total</span>
          </li>
          {miembros === null && <li className="py-2 text-muted">Cargando…</li>}
          {miembros?.map((m) => (
            <li key={m.email} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={m.activo ? "text-paper" : "text-muted line-through"}>{m.email}</p>
                <p className="text-xs text-muted">Desde {fmtFecha(m.creado.slice(0, 10))}{!m.activo && " · sin acceso"}</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={m.rol} onChange={(e) => cambiar(m, { rol: e.target.value as Miembro["rol"] })} disabled={!m.activo}
                  className="rounded border border-ink-border bg-ink px-2 py-1 text-xs text-paper">
                  <option value="colaborador">Colaborador</option>
                  <option value="lectura">Solo lectura</option>
                </select>
                <button type="button" onClick={() => cambiar(m, { activo: !m.activo })} className={`text-xs underline ${m.activo ? "text-loss" : "text-gain"}`}>
                  {m.activo ? "Quitar acceso" : "Devolver acceso"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">Quitar el acceso corta la lectura de datos al instante. Lo que haya cargado queda guardado.</p>
      </Panel>
    </div>
  );
}
