"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import { hoyIso } from "@/lib/bondMath";
import { carteraLabel } from "@/lib/carteras";
import { PERFIL_DEFECTO } from "@/lib/propuesta";
import Reuniones from "@/components/clientes/Reuniones";
import { linkWhatsApp } from "@/lib/whatsapp";
import { DESCRIPCION_RIESGO, PREGUNTAS, PUNTAJE_MAX, evaluarPerfil, type FichaCliente, type NotaCliente } from "@/lib/perfilInversor";

const COLOR_RIESGO: Record<string, string> = { conservador: "bg-[#2a78d6]/10 text-[#1c5cab]", moderado: "bg-[#eda100]/15 text-[#8a5d00]", agresivo: "bg-[#e34948]/10 text-[#b42d2c]" };

export default function FichaPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [notas, setNotas] = useState<NotaCliente[]>([]);
  const [cuentas, setCuentas] = useState<string[]>([]);
  const [propuestas, setPropuestas] = useState<{ id: string; cliente: string | null; estado: string; created_at: string; cuenta: string | null }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [test, setTest] = useState<Record<string, number> | null>(null);
  const [nuevaNota, setNuevaNota] = useState("");
  const [fechaNota, setFechaNota] = useState(hoyIso());

  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: n }, { data: b }, { data: p }] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", params.id).maybeSingle(),
        supabase.from("cliente_notas").select("*").eq("cliente_id", params.id).order("fecha", { ascending: false }),
        supabase.from("bonds").select("cuenta").in("estado", ["activo", "vencido"]),
        supabase.from("propuestas").select("id, cliente, estado, created_at, cuenta").order("created_at", { ascending: false }),
      ]);
      setFicha(f as FichaCliente | null);
      setNotas((n as NotaCliente[]) ?? []);
      setCuentas([...new Set(((b as { cuenta: string | null }[]) ?? []).map((x) => x.cuenta?.trim()).filter((x): x is string => !!x))].sort());
      setPropuestas((p as typeof propuestas) ?? []);
    })();
  }, [params.id]);

  const resultado = useMemo(() => (test ? evaluarPerfil(test) : null), [test]);
  const suyas = ficha ? propuestas.filter((p) => (ficha.cuenta && (p.cuenta ?? "").trim() === ficha.cuenta) || (p.cliente ?? "").trim().toLowerCase() === ficha.nombre.trim().toLowerCase()) : [];

  if (!ficha) return <div className="p-8 text-sm text-muted">Cargando…</div>;

  const set = (cambios: Partial<FichaCliente>) => { setFicha({ ...ficha, ...cambios }); setSucio(true); };

  async function guardar(f: FichaCliente = ficha!) {
    const { error } = await supabase.from("clientes").update({
      nombre: f.nombre, cuenta: f.cuenta || null, email: f.email || null, telefono: f.telefono || null,
      monto_previsto: f.monto_previsto, moneda: f.moneda, perfil: f.perfil, notas: f.notas || null, updated_at: new Date().toISOString(),
    }).eq("id", f.id);
    setMsg(error ? `No se pudo guardar: ${error.message}` : "Guardado");
    if (!error) setSucio(false);
    setTimeout(() => setMsg(null), 2500);
  }

  async function guardarTest() {
    if (!resultado || !test) return;
    const f = { ...ficha!, perfil: { ...resultado, respuestas: test, fecha: hoyIso() } };
    setFicha(f); setTest(null);
    await guardar(f);
  }

  async function agregarNota() {
    if (!nuevaNota.trim()) return;
    const { data, error } = await supabase.from("cliente_notas").insert({ cliente_id: ficha!.id, fecha: fechaNota, texto: nuevaNota.trim() }).select().single();
    if (error) { setMsg(error.message); return; }
    setNotas([data as NotaCliente, ...notas].sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setNuevaNota("");
  }

  async function nuevaPropuesta() {
    const p = ficha!.perfil;
    const perfil = {
      ...PERFIL_DEFECTO,
      ...(ficha!.monto_previsto ? { monto: ficha!.monto_previsto } : {}),
      ...(ficha!.moneda && ["USD", "UYU", "UI"].includes(ficha!.moneda) ? { moneda: ficha!.moneda } : {}),
      ...(p ? { riesgo: p.riesgo, objetivo: p.objetivo, plazoMaxAnios: p.plazoMaxAnios } : {}),
    };
    const { data, error } = await supabase.from("propuestas").insert({ cliente: ficha!.nombre, cuenta: ficha!.cuenta, perfil, items: [], estado: "borrador" }).select("id").single();
    if (error) { setMsg(`No se pudo crear la propuesta: ${error.message}`); return; }
    router.push(`/propuestas/${(data as { id: string }).id}`);
  }

  const input = "w-full rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper";
  const p = ficha.perfil;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/clientes" className="text-xs text-muted underline">← Clientes</Link>
          <h1 className="font-display text-2xl sm:text-3xl text-paper">{ficha.nombre || "Cliente nuevo"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {p ? <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", COLOR_RIESGO[p.riesgo])}>Perfil {p.riesgo}</span> : <span className="rounded-full bg-warn/10 px-2.5 py-0.5 text-xs text-warn">Sin test de perfil</span>}
            {ficha.cuenta && <span>Cartera {carteraLabel(ficha.cuenta)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={nuevaPropuesta} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white">Nueva propuesta con este perfil</button>
          {ficha.cuenta && <Link href={`/estado-cuenta?cuenta=${encodeURIComponent(ficha.cuenta)}`} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Estado de cuenta</Link>}
          {ficha.telefono && <a href={linkWhatsApp(ficha.telefono, `Hola ${ficha.nombre.split(" ")[0]}, `)} target="_blank" rel="noreferrer" className="rounded border border-ink-border px-4 py-2 text-sm text-paper">WhatsApp</a>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Datos del cliente" action={<div className="flex items-center gap-2">{msg && <span className="text-xs text-muted">{msg}</span>}<button type="button" onClick={() => guardar()} disabled={!sucio} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Guardar</button></div>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted sm:col-span-2">Nombre y apellido<input className={input} value={ficha.nombre} onChange={(e) => set({ nombre: e.target.value })} /></label>
            <label className="text-xs text-muted">Email<input className={input} type="email" value={ficha.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></label>
            <label className="text-xs text-muted">Teléfono<input className={input} value={ficha.telefono ?? ""} onChange={(e) => set({ telefono: e.target.value })} /></label>
            <label className="text-xs text-muted">Cartera en el corredor
              <select className={input} value={ficha.cuenta ?? ""} onChange={(e) => set({ cuenta: e.target.value || null })}>
                <option value="">Todavía no invierte (prospecto)</option>
                {[...new Set([...(ficha.cuenta ? [ficha.cuenta] : []), ...cuentas])].map((c) => <option key={c} value={c}>{carteraLabel(c)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="text-xs text-muted">Monto previsto<input className={input} inputMode="decimal" value={ficha.monto_previsto ?? ""} onChange={(e) => set({ monto_previsto: Number(e.target.value.replace(/\./g, "").replace(",", ".")) || null })} /></label>
              <label className="text-xs text-muted">Moneda
                <select className={input} value={ficha.moneda ?? "USD"} onChange={(e) => set({ moneda: e.target.value })}>
                  {["USD", "UYU", "UI"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="text-xs text-muted sm:col-span-2">Notas generales
              <textarea className={clsx(input, "min-h-[80px]")} value={ficha.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} placeholder="Situación familiar, preferencias, restricciones (ej.: no quiere fideicomisos), de dónde viene el dinero…" />
            </label>
          </div>
        </Panel>

        <Panel title="Perfil de inversor" action={!test && <button type="button" onClick={() => setTest(p?.respuestas ? { ...p.respuestas } : {})} className="text-xs text-muted underline">{p ? "Rehacer el test" : "Hacer el test"}</button>}>
          {test ? (
            <div className="flex flex-col gap-4">
              {PREGUNTAS.map((q, k) => (
                <div key={q.id}>
                  <p className="mb-1.5 text-sm font-medium text-paper">{k + 1}. {q.texto}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {q.opciones.map((o, j) => (
                      <button key={j} type="button" onClick={() => setTest({ ...test, [q.id]: j })} className={clsx("rounded-lg border px-3 py-2 text-left text-xs", test[q.id] === j ? "border-gold bg-gold text-white" : "border-ink-border text-paper hover:bg-ink")}>{o.texto}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-xl bg-ink px-4 py-3">
                {resultado ? (
                  <>
                    <p className="text-sm text-paper">Resultado: <strong className="capitalize">{resultado.riesgo}</strong> · {resultado.puntaje}/{PUNTAJE_MAX} puntos · objetivo {resultado.objetivo} · plazo hasta {resultado.plazoMaxAnios} años</p>
                    <p className="mt-1 text-xs text-muted">{resultado.descripcion}</p>
                    {resultado.alertas.map((a) => <p key={a} className="mt-1 text-xs text-warn">{a}</p>)}
                  </>
                ) : <p className="text-xs text-muted">Faltan {PREGUNTAS.filter((q) => test[q.id] == null).length} respuestas.</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={guardarTest} disabled={!resultado} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Guardar perfil</button>
                <button type="button" onClick={() => setTest(null)} className="text-sm text-muted underline">Cancelar</button>
              </div>
            </div>
          ) : p ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={clsx("rounded-full px-3 py-1 text-sm font-semibold capitalize", COLOR_RIESGO[p.riesgo])}>{p.riesgo}</span>
                <span className="text-xs text-muted">{p.puntaje}/{PUNTAJE_MAX} puntos · test del {fmtFecha(p.fecha)}</span>
              </div>
              <p className="text-sm text-paper">{DESCRIPCION_RIESGO[p.riesgo]}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-ink px-3 py-2"><p className="text-muted">Objetivo</p><p className="font-medium capitalize text-paper">{p.objetivo}</p></div>
                <div className="rounded-lg bg-ink px-3 py-2"><p className="text-muted">Plazo máximo</p><p className="font-medium text-paper">{p.plazoMaxAnios} años</p></div>
              </div>
              {p.alertas?.map((a) => <p key={a} className="text-xs text-warn">{a}</p>)}
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">Ver respuestas</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {PREGUNTAS.map((q) => <li key={q.id}><span className="text-paper">{q.texto}</span> — {q.opciones[p.respuestas[q.id]]?.texto ?? "—"}</li>)}
                </ul>
              </details>
              {Date.now() - Date.parse(p.fecha) > 365 * 86_400_000 && <p className="text-xs text-warn">El test tiene más de un año: conviene actualizarlo.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">Ocho preguntas sobre objetivo, plazo, experiencia y tolerancia a pérdidas. El resultado se usa en las propuestas y en las sugerencias de reinversión.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Reuniones">
          <Reuniones clienteId={ficha.id} cliente={ficha.nombre} onNota={(t) => { setNuevaNota(t); document.getElementById("nota-nueva")?.focus(); }} />
        </Panel>

        <Panel title="Notas de reuniones">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <input type="date" className="rounded border border-ink-border bg-ink px-2 py-2 text-sm text-paper" value={fechaNota} onChange={(e) => setFechaNota(e.target.value)} />
              <textarea id="nota-nueva" className={clsx(input, "min-h-[60px] flex-1")} value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)} placeholder="Qué se habló, qué quedó pendiente…" />
            </div>
            <button type="button" onClick={agregarNota} disabled={!nuevaNota.trim()} className="self-end rounded bg-gold px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Agregar nota</button>
            {notas.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {notas.map((n) => (
                  <li key={n.id} className="rounded-lg bg-ink px-3 py-2">
                    <p className="text-[11px] font-semibold text-muted">{fmtFecha(n.fecha)}</p>
                    <p className="whitespace-pre-line text-sm text-paper">{n.texto}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted">Todavía no hay notas.</p>}
          </div>
        </Panel>

        <Panel title="Propuestas">
          {suyas.length ? (
            <ul className="flex flex-col gap-1.5">
              {suyas.map((x) => (
                <li key={x.id} className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-sm">
                  <span className="text-paper">{fmtFecha(x.created_at.slice(0, 10))} · <span className="capitalize">{x.estado}</span></span>
                  <Link href={`/propuestas/${x.id}`} className="text-xs underline text-muted">Abrir</Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No hay propuestas para este cliente.</p>}
          {ficha.monto_previsto ? <p className="mt-2 text-xs text-muted">Monto previsto: {fmtMonto(ficha.monto_previsto, ficha.moneda ?? "USD")}</p> : null}
          {p && <p className="mt-1 text-xs text-muted">La propuesta nueva arranca con perfil {p.riesgo}, objetivo {p.objetivo} y plazo hasta {fmtNum(p.plazoMaxAnios, 0)} años.</p>}
        </Panel>
      </div>
    </div>
  );
}
