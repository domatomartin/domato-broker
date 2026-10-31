"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/Card";
import CostosEditor from "@/components/CostosEditor";
import TextoIA from "@/components/TextoIA";
import MezclaEditor from "@/components/propuesta/MezclaEditor";
import ResumenCartera from "@/components/propuesta/ResumenCartera";
import InformePropuesta from "@/components/propuesta/InformePropuesta";
import EjecutarCompra from "@/components/propuesta/EjecutarCompra";
import Seguimiento from "@/components/propuesta/Seguimiento";
import { leer, guardar as guardarLocal } from "@/components/InformeBono";
import type { FotoMercado } from "@/lib/mercado";
import { efectivo } from "@/lib/bvm";
import { useCostos } from "@/lib/useCostos";
import type { Instrumento } from "@/lib/bvm";
import {
  ESTADOS, OBJETIVOS, PERFIL_DEFECTO, RIESGOS,
  calcularCartera, candidatosPara, itemDesdeInstrumento, metricasParaGuardar, monedasDelPerfil, tiposParaPerfil, MONEDAS_PROPUESTA, NOMBRE_MONEDA, type Cotizaciones,
  type EjecucionItem, type ItemPropuesta, type PerfilCliente, type Propuesta,
} from "@/lib/propuesta";
import { fmtFecha, fmtNum } from "@/components/BondAnalysis";

const input = "rounded border border-ink-border bg-ink px-2.5 py-1.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold";

export default function PropuestaPage() {
  const { id } = useParams<{ id: string }>();
  const { costos, guardar: guardarCostos } = useCostos();

  const [prop, setProp] = useState<Propuesta | null>(null);
  const [catalogo, setCatalogo] = useState<Instrumento[]>([]);
  const [cliente, setCliente] = useState("");
  const [asesor, setAsesor] = useState("");
  const [perfil, setPerfil] = useState<PerfilCliente>(PERFIL_DEFECTO);
  const [items, setItems] = useState<ItemPropuesta[]>([]);
  const [analisis, setAnalisis] = useState("");
  const [estrategia, setEstrategia] = useState("");
  const [estrategiaMercado, setEstrategiaMercado] = useState<FotoMercado | null>(null);
  const [estrategiaFecha, setEstrategiaFecha] = useState<string | null>(null);
  const [revision, setRevision] = useState("");
  const [revisionFecha, setRevisionFecha] = useState<string | null>(null);
  const [editandoEstrategia, setEditandoEstrategia] = useState(false);
  const [editandoTexto, setEditandoTexto] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [iaCargando, setIaCargando] = useState<null | "sugerir" | "analizar" | "estrategia" | "revisar">(null);
  const [informe, setInforme] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [tasas, setTasas] = useState<Cotizaciones | null>(null);

  useEffect(() => {
    fetch("/api/cotizaciones").then((r) => r.json()).then(setTasas).catch(() => setTasas(null));
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: p, error }, { data: inst }] = await Promise.all([
        supabase.from("propuestas").select("*").eq("id", id).single(),
        supabase.from("instrumentos").select("*"),
      ]);
      if (error) setMsg({ tipo: "error", texto: error.message });
      if (p) {
        const pr = p as Propuesta;
        setProp(pr);
        setCliente(pr.cliente ?? "");
        setAsesor(pr.asesor ?? leer("informe.asesor"));
        setPerfil({ ...PERFIL_DEFECTO, ...(pr.perfil ?? {}) });
        setItems(pr.items ?? []);
        setAnalisis(pr.analisis ?? "");
        setEstrategia(pr.estrategia ?? "");
        setEstrategiaMercado(pr.estrategia_mercado ?? null);
        setEstrategiaFecha(pr.estrategia_fecha ?? null);
        setRevision(pr.revision ?? "");
        setRevisionFecha(pr.revision_fecha ?? null);
      }
      setCatalogo((inst as Instrumento[]) ?? []);
      setCargando(false);
    })();
  }, [id]);

  const mapa = useMemo(() => new Map(catalogo.map((i) => [i.isin, i])), [catalogo]);
  const fxs = useMemo(() => tiposParaPerfil(perfil.moneda, tasas), [perfil.moneda, tasas]);
  const metricas = useMemo(() => calcularCartera(items, perfil.monto, costos, undefined, fxs), [items, perfil.monto, costos, fxs]);
  const ejecutada = prop?.estado === "ejecutada";
  const monedaRef = metricas.monedas.length === 1 ? metricas.monedas[0] : perfil.moneda;

  function cambiar<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setSucio(true); };
  }
  const setItemsS = cambiar(setItems);
  const setPerfilS = (p: Partial<PerfilCliente>) => { setPerfil((x) => ({ ...x, ...p })); setSucio(true); };

  async function guardar(extra: Partial<Propuesta> = {}, silencioso = false) {
    setGuardando(true);
    if (!silencioso) setMsg(null);
    const fila = {
      cliente,
      asesor,
      perfil,
      items,
      analisis,
      estrategia: estrategia || null,
      estrategia_mercado: estrategiaMercado,
      estrategia_fecha: estrategiaFecha,
      revision: revision || null,
      revision_fecha: revisionFecha,
      metricas: metricas.lineas.length ? metricasParaGuardar(metricas, perfil.monto) : null,
      updated_at: new Date().toISOString(),
      ...extra,
    };
    const { data, error } = await supabase.from("propuestas").update(fila).eq("id", id).select("*").single();
    setGuardando(false);
    if (error) { setMsg({ tipo: "error", texto: `No se pudo guardar: ${error.message}` }); return false; }
    setProp(data as Propuesta);
    setSucio(false);
    guardarLocal("informe.asesor", asesor);
    if (!silencioso) setMsg({ tipo: "ok", texto: "Guardado." });
    return true;
  }

  // Guardado automático: cualquier cambio (mezcla, perfil, análisis de la IA) se guarda solo
  // a los 1,5 s, así no se pierde al cerrar el informe, imprimir o recargar en el celular.
  useEffect(() => {
    if (!sucio || cargando || guardando || ejecutada) return;
    const t = setTimeout(() => { guardar({}, true); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucio, cliente, asesor, perfil, items, analisis, estrategia, revision, cargando, guardando, ejecutada]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function sugerirIA() {
    setMsg(null);
    const candidatos = candidatosPara(perfil, catalogo, costos, fxs);
    if (!candidatos.length) {
      setMsg({ tipo: "error", texto: `No hay bonos con datos completos en ${monedasDelPerfil(perfil, fxs).join("/")} con plazo de hasta ${perfil.plazoMaxAnios} años. Ampliá el plazo o completá datos en Opciones de inversión.` });
      return;
    }
    setIaCargando("sugerir");
    try {
      const r = await fetch("/api/propuestas/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ modo: "sugerir", perfil, cliente, candidatos }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      const nuevos: ItemPropuesta[] = (j.items as { isin: string; peso: number; motivo?: string }[])
        .map((x) => { const ins = mapa.get(x.isin); return ins ? itemDesdeInstrumento(ins, x.peso, x.motivo) : null; })
        .filter((x): x is ItemPropuesta => !!x);
      setItemsS(nuevos);
      if (j.analisis) { setAnalisis(j.analisis); setSucio(true); }
      setMsg({ tipo: "ok", texto: `La IA propuso ${nuevos.length} bonos. Ya quedó guardada; revisá la mezcla.` });
    } catch (e) {
      setMsg({ tipo: "error", texto: `No se pudo consultar la IA: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setIaCargando(null);
    }
  }

  async function redactarIA() {
    setMsg(null);
    setIaCargando("analizar");
    try {
      const r = await fetch("/api/propuestas/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          modo: "analizar",
          perfil,
          cliente,
          items: metricas.lineas.map((l) => ({
            isin: l.item.isin, nombre: l.item.nombre, peso: l.item.peso, moneda: l.item.moneda, tipo: l.grupo,
            tir_neta: l.neto?.tirNeta != null ? Number(l.neto.tirNeta.toFixed(2)) : null,
            plazo_anios: l.a.aniosAlVencimiento != null ? Number(l.a.aniosAlVencimiento.toFixed(1)) : null,
          })),
          metricas: {
            tir_neta: metricas.tirNeta, tir_bruta: metricas.tirBruta, duration: metricas.duration, plazo_promedio: metricas.plazoPromedio,
            inversion_total: metricas.inversionTotal, cobro_anual: metricas.interesAnual, total_a_cobrar_neto: metricas.totalACobrarNeto,
            costos_totales: metricas.costosTotales, por_tipo: metricas.porGrupo, por_plazo: metricas.porPlazo,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      setAnalisis(j.analisis);
      setSucio(true);
      setMsg({ tipo: "ok", texto: "Análisis actualizado y guardado. Revisalo antes de presentarlo." });
    } catch (e) {
      setMsg({ tipo: "error", texto: `No se pudo consultar la IA: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setIaCargando(null);
    }
  }

  function resumenCartera() {
    return {
      items: metricas.lineas.map((l) => {
        const ins = mapa.get(l.item.isin);
        const compra = prop?.ejecucion?.find((x) => x.isin === l.item.isin);
        return {
          isin: l.item.isin, nombre: l.item.nombre, peso: l.item.peso, moneda: l.item.moneda, tipo: l.grupo,
          tir_neta: l.neto?.tirNeta != null ? Number(l.neto.tirNeta.toFixed(2)) : null,
          plazo_anios: l.a.aniosAlVencimiento != null ? Number(l.a.aniosAlVencimiento.toFixed(1)) : null,
          precio_propuesta: l.item.precio,
          precio_compra: compra?.precio_compra ?? null,
          precio_hoy: ins ? efectivo(ins).precio ?? null : null,
        };
      }),
      metricas: {
        tir_neta: metricas.tirNeta, tir_bruta: metricas.tirBruta, duration: metricas.duration, plazo_promedio: metricas.plazoPromedio,
        inversion_total: metricas.inversionTotal, cobro_anual: metricas.interesAnual, por_moneda: metricas.porMoneda,
        por_tipo: metricas.porGrupo, por_plazo: metricas.porPlazo, moneda_cliente: perfil.moneda,
      },
    };
  }

  async function estrategiaIA(modo: "estrategia" | "revisar") {
    setMsg(null);
    setIaCargando(modo);
    try {
      const r = await fetch("/api/propuestas/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          modo, perfil, cliente, ...resumenCartera(),
          estrategia, estrategia_fecha: estrategiaFecha, estrategia_mercado: estrategiaMercado, ejecutada,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      const ahora = new Date().toISOString();
      if (modo === "estrategia") {
        setEstrategia(j.estrategia); setEstrategiaMercado(j.mercado ?? null); setEstrategiaFecha(ahora);
        setMsg({ tipo: "ok", texto: "Estrategia a 6 y 12 meses lista y guardada, con la foto del mercado de hoy." });
      } else {
        setRevision(j.revision); setRevisionFecha(ahora);
        setMsg({ tipo: "ok", texto: "Revisión contra el mercado de hoy lista y guardada." });
      }
      setSucio(true);
    } catch (e) {
      setMsg({ tipo: "error", texto: `No se pudo consultar la IA: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setIaCargando(null);
    }
  }

  async function registrarEjecucion(ejecucion: EjecucionItem[], cuenta: string, fecha: string) {
    const ok = await guardar({ estado: "ejecutada", ejecucion, cuenta, fecha_ejecucion: fecha });
    if (ok) {
      setEjecutando(false);
      setMsg({ tipo: "ok", texto: `Compra registrada en la cartera “${cuenta}”. Abajo tenés el seguimiento.` });
    }
  }

  if (cargando) return <div className="p-8 text-sm text-muted">Cargando…</div>;
  if (!prop) return <div className="p-8 text-sm text-loss">No se encontró la propuesta. <Link href="/propuestas" className="underline">Volver</Link></div>;

  const pesoOk = Math.abs(metricas.pesoTotal - 100) < 0.05;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/propuestas" className="text-xs text-muted hover:text-paper">← Propuestas</Link>
          <h1 className="font-display text-3xl text-paper">{cliente || "Nueva propuesta"}</h1>
          <p className="text-sm text-muted mt-1">
            {ESTADOS[prop.estado]}
            {prop.fecha_presentada && ` · presentada el ${fmtFecha(prop.fecha_presentada.slice(0, 10))}`}
            {prop.fecha_ejecucion && ` · ejecutada el ${fmtFecha(prop.fecha_ejecucion)}`}
            {guardando ? " · guardando…" : sucio ? " · cambios sin guardar" : " · guardado"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CostosEditor costos={costos} onGuardar={guardarCostos} />
          <button type="button" onClick={() => guardar()} disabled={guardando} className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={async () => { if (sucio && !ejecutada) await guardar({}, true); setInforme(true); }} disabled={!metricas.lineas.length} className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold disabled:opacity-50">
            Generar informe
          </button>
          {!ejecutada && prop.estado !== "presentada" && (
            <button type="button" onClick={() => guardar({ estado: "presentada", fecha_presentada: new Date().toISOString() })} disabled={!metricas.lineas.length || !pesoOk} className="rounded border border-ink-border px-4 py-2 text-sm text-paper hover:border-gold disabled:opacity-50">
              Marcar presentada
            </button>
          )}
          {!ejecutada && prop.estado !== "descartada" && (
            <button type="button" onClick={() => guardar({ estado: "descartada" })} className="rounded px-3 py-2 text-sm text-muted hover:text-loss">
              Descartar
            </button>
          )}
          {!ejecutada && (
            <button type="button" onClick={async () => { if (sucio && !(await guardar())) return; setEjecutando(true); }} disabled={!metricas.lineas.length || !pesoOk} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel hover:bg-gold-bright disabled:opacity-50">
              Ejecutar compra
            </button>
          )}
        </div>
      </div>

      {msg && <p className={clsx("rounded px-3 py-2 text-sm", msg.tipo === "ok" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss")}>{msg.texto}</p>}

      {ejecutada && (
        <Panel title="Seguimiento: real contra propuesta">
          <Seguimiento propuesta={prop} costos={costos} catalogo={mapa} fxs={fxs} />
        </Panel>
      )}

      <Panel title="1 · Perfil del cliente">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">Cliente
            <input className={input} value={cliente} onChange={(e) => { setCliente(e.target.value); setSucio(true); }} placeholder="Nombre y apellido" disabled={ejecutada} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Monto a invertir
            <input className={input} value={String(perfil.monto)} onChange={(e) => setPerfilS({ monto: Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0 })} inputMode="decimal" disabled={ejecutada} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Moneda
            <select className={input} value={perfil.moneda} onChange={(e) => setPerfilS({ moneda: e.target.value as PerfilCliente["moneda"] })} disabled={ejecutada}>
              <option value="USD">Dólares (USD)</option>
              <option value="UYU">Pesos (UYU / UI)</option>
              <option value="UI">Unidades indexadas (UI)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Plazo máximo (años)
            <input className={input} value={String(perfil.plazoMaxAnios)} onChange={(e) => setPerfilS({ plazoMaxAnios: Number(e.target.value) || 0 })} inputMode="numeric" disabled={ejecutada} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Asesor
            <input className={input} value={asesor} onChange={(e) => { setAsesor(e.target.value); setSucio(true); }} placeholder="Tu nombre" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Perfil de riesgo
            <select className={input} value={perfil.riesgo} onChange={(e) => setPerfilS({ riesgo: e.target.value as PerfilCliente["riesgo"] })} disabled={ejecutada}>
              {Object.entries(RIESGOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Objetivo
            <select className={input} value={perfil.objetivo} onChange={(e) => setPerfilS({ objetivo: e.target.value as PerfilCliente["objetivo"] })} disabled={ejecutada}>
              {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-3 lg:col-span-4">Notas o restricciones (las tiene en cuenta la IA)
            <input className={input} value={perfil.notas} onChange={(e) => setPerfilS({ notas: e.target.value })} placeholder="Ej.: necesita renta semestral; no quiere fideicomisos; parte del dinero lo usa en 2029" disabled={ejecutada} />
          </label>
        </div>
        <SelectorMonedas perfil={perfil} fxs={fxs} onChange={setPerfilS} bloqueado={ejecutada} />
        {!ejecutada && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={sugerirIA} disabled={!!iaCargando} className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink-panel hover:bg-gold-bright disabled:opacity-50">
              {iaCargando === "sugerir" ? "La IA está armando la propuesta…" : items.length ? "✦ Volver a sugerir con IA" : "✦ Sugerir cartera con IA"}
            </button>
            <span className="text-xs text-muted">
              Elige entre los bonos del catálogo con datos completos ({candidatosPara(perfil, catalogo, costos, fxs).length} candidatos para este perfil) y propone pesos. Después podés ajustar todo.
            </span>
          </div>
        )}
      </Panel>

      <Panel title="2 · Bonos de la propuesta">
        <MezclaEditor items={items} onChange={setItemsS} metricas={metricas} catalogo={catalogo} moneda={monedaRef} bloqueado={ejecutada} />
      </Panel>

      <Panel title="3 · Resultado esperado de la cartera">
        <ResumenCartera m={metricas} moneda={monedaRef} />
      </Panel>

      <Panel
        title="4 · Análisis para el informe"
        action={
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditandoTexto((v) => !v)} className="text-xs text-muted underline hover:text-paper">{editandoTexto ? "Ver como queda" : "Editar texto"}</button>
            {!ejecutada && (
              <button type="button" onClick={redactarIA} disabled={!!iaCargando || !metricas.lineas.length} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold disabled:opacity-50">
                {iaCargando === "analizar" ? "Redactando…" : "✦ Redactar con IA"}
              </button>
            )}
          </div>
        }
      >
        {editandoTexto ? (
          <textarea
            className={clsx(input, "min-h-[260px] font-mono text-xs")}
            value={analisis}
            onChange={(e) => { setAnalisis(e.target.value); setSucio(true); }}
            placeholder={"## Estrategia\n- …\n## Por qué estos bonos\n- …\n## Riesgos a considerar\n- …\n## Seguimiento sugerido\n- …"}
          />
        ) : analisis.trim() ? (
          <TextoIA texto={analisis} />
        ) : (
          <p className="text-sm text-muted">Todavía no hay análisis. Pedile a la IA que lo redacte o escribilo con “Editar texto”.</p>
        )}
        <p className="text-[11px] text-muted">Revisá siempre el texto de la IA antes de presentarlo: es un borrador para tu criterio profesional.</p>
      </Panel>

      <Panel
        title="5 · Estrategia de seguimiento a 6 y 12 meses"
        action={
          <div className="flex flex-wrap items-center gap-3">
            {estrategia && (
              <button type="button" onClick={() => setEditandoEstrategia((v) => !v)} className="text-xs text-muted underline hover:text-paper">
                {editandoEstrategia ? "Ver como queda" : "Editar texto"}
              </button>
            )}
            <button type="button" onClick={() => estrategiaIA("estrategia")} disabled={!!iaCargando || !metricas.lineas.length} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold disabled:opacity-50">
              {iaCargando === "estrategia" ? "Armando la estrategia…" : estrategia ? "✦ Rehacer estrategia" : "✦ Armar estrategia con IA"}
            </button>
            {estrategia && (
              <button type="button" onClick={() => estrategiaIA("revisar")} disabled={!!iaCargando} className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-bright disabled:opacity-50">
                {iaCargando === "revisar" ? "Revisando…" : "↻ Revisar con el mercado de hoy"}
              </button>
            )}
          </div>
        }
      >
        {!estrategia ? (
          <p className="text-sm text-muted">
            La IA arma un plan de seguimiento a 6 y 12 meses con la foto del mercado de hoy (tasas de EE.UU., dólar, monedas, volatilidad):
            qué revisar, cuándo, y señales concretas para actuar (vender parte vía el corredor, rebalancear monedas, acortar plazo, reinvertir).
            Después podés tocar “Revisar con el mercado de hoy” para ver si alguna señal se activó.
          </p>
        ) : editandoEstrategia ? (
          <textarea className={clsx(input, "min-h-[260px] font-mono text-xs")} value={estrategia} onChange={(e) => { setEstrategia(e.target.value); setSucio(true); }} />
        ) : (
          <>
            <p className="text-[11px] text-muted">
              Definida el {estrategiaFecha ? new Date(estrategiaFecha).toLocaleDateString("es-UY") : "—"}
              {estrategiaMercado?.datos?.length ? " · mercado de ese día: " + estrategiaMercado.datos.filter((d) => d.valor != null).slice(0, 6).map((d) => `${d.nombre.replace("Tasa ", "")} ${d.valor}${d.unidad === "%" ? "%" : ""}`).join(" · ") : ""}
            </p>
            <TextoIA texto={estrategia} />
          </>
        )}
        {revision && (
          <div className="mt-2 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">
              Última revisión · {revisionFecha ? new Date(revisionFecha).toLocaleDateString("es-UY") : ""}
            </p>
            <TextoIA texto={revision} />
          </div>
        )}
        <p className="text-[11px] text-muted">Es un plan orientativo para tu criterio profesional, no una predicción del mercado.</p>
      </Panel>

      {informe && (
        <InformePropuesta cliente={cliente} asesor={asesor} perfil={perfil} metricas={metricas} analisis={analisis} estrategia={estrategia} costos={costos} onClose={() => setInforme(false)} />
      )}
      {ejecutando && (
        <EjecutarCompra
          propuestaId={id}
          cliente={cliente}
          metricas={metricas}
          catalogo={mapa}
          onCancel={() => setEjecutando(false)}
          onDone={registrarEjecucion}
        />
      )}
      {!pesoOk && metricas.lineas.length > 0 && !ejecutada && (
        <p className="text-xs text-loss">Los pesos suman {fmtNum(metricas.pesoTotal, 1, "%")}: ajustalos a 100% para presentar o ejecutar.</p>
      )}
    </div>
  );
}

/** Diversificación por moneda: activar y, si se quiere, fijar la mezcla objetivo. */
function SelectorMonedas({
  perfil, fxs, onChange, bloqueado,
}: { perfil: PerfilCliente; fxs: Record<string, number>; onChange: (p: Partial<PerfilCliente>) => void; bloqueado: boolean }) {
  const disponibles = MONEDAS_PROPUESTA.filter((m) => m === perfil.moneda || fxs[m] != null);
  const mezcla = perfil.mezclaMonedas ?? {};
  const suma = Object.values(mezcla).reduce((s, v) => s + (Number(v) || 0), 0);
  const setPct = (m: string, v: string) => {
    const n = Number(v.replace(",", "."));
    const nueva = { ...mezcla };
    if (!v.trim() || !(n > 0)) delete nueva[m]; else nueva[m] = n;
    onChange({ mezclaMonedas: nueva });
  };
  const sugerida = () => {
    // Punto de partida razonable según el perfil; el asesor lo ajusta.
    const base: Record<string, Record<string, number>> = {
      conservador: { USD: 60, UI: 30, UYU: 10 },
      moderado: { USD: 50, UI: 30, UYU: 20 },
      agresivo: { USD: 40, UI: 25, UYU: 25, EUR: 10 },
    };
    const b = base[perfil.riesgo] ?? base.moderado;
    onChange({ mezclaMonedas: Object.fromEntries(Object.entries(b).filter(([m]) => disponibles.includes(m as never))) });
  };
  return (
    <div className="rounded-xl border border-ink-border bg-ink/40 px-4 py-3">
      <label className="flex items-center gap-2 text-sm text-paper">
        <input
          type="checkbox"
          checked={!!perfil.multimoneda}
          disabled={bloqueado}
          onChange={(e) => onChange({ multimoneda: e.target.checked })}
          className="h-4 w-4 accent-[#171A21]"
        />
        Diversificar en varias monedas
        <span className="text-xs text-muted">(dólares, pesos, UI, euros, reales)</span>
      </label>
      {perfil.multimoneda && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted">
            Mezcla objetivo por moneda, en % del monto. Dejá vacío para que la IA la proponga según el perfil.
            Los importes se muestran en {perfil.moneda} al tipo de cambio de hoy.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {disponibles.map((m) => (
              <label key={m} className="flex flex-col gap-1 text-[11px] text-muted">
                {NOMBRE_MONEDA[m] ?? m} ({m})
                <div className="flex items-center gap-1">
                  <input
                    value={mezcla[m] != null ? String(mezcla[m]) : ""}
                    onChange={(e) => setPct(m, e.target.value)}
                    disabled={bloqueado}
                    inputMode="decimal"
                    placeholder="—"
                    className="w-16 rounded border border-ink-border bg-ink-panel px-2 py-1 text-right text-sm text-paper"
                  />
                  <span>%</span>
                </div>
              </label>
            ))}
            {!bloqueado && (
              <button type="button" onClick={sugerida} className="rounded border border-ink-border px-3 py-1.5 text-xs text-paper hover:border-gold">
                Sugerir según perfil
              </button>
            )}
          </div>
          {suma > 0 && Math.abs(suma - 100) > 0.5 && (
            <p className="text-xs text-warn">La mezcla suma {suma}%: la IA la toma como proporción y la ajusta a 100%.</p>
          )}
          <p className="text-[11px] text-muted">
            Ojo: las tasas en pesos son nominales (incluyen inflación y devaluación esperadas), las de UI son reales y las de dólares o euros
            van en esa divisa. Combinar monedas reduce la dependencia de una sola, pero suma riesgo cambiario.
          </p>
        </div>
      )}
    </div>
  );
}
