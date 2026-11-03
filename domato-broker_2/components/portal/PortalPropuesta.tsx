"use client";

import { useState } from "react";
import { fmtFecha, fmtMonto, fmtNum } from "@/components/BondAnalysis";
import type { ItemPropuesta, MetricasGuardadas, PerfilCliente } from "@/lib/propuesta";

export type PropuestaPortal = {
  id: string;
  cliente: string | null;
  asesor: string | null;
  perfil: PerfilCliente;
  items: ItemPropuesta[];
  analisis: string | null;
  metricas: MetricasGuardadas | null;
  estado: string;
  aceptacion: { nombre: string; fecha: string } | null;
  created_at: string;
  fecha_presentada: string | null;
};

/** Vista de la propuesta para el cliente, con aceptación online. */
export default function PortalPropuesta({ token, propuesta }: { token: string; propuesta: PropuestaPortal }) {
  const p = propuesta;
  const [aceptacion, setAceptacion] = useState(p.aceptacion);
  const [nombre, setNombre] = useState(p.cliente ?? "");
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = p.metricas;
  const moneda = p.perfil?.moneda ?? "USD";
  const fecha = (p.fecha_presentada ?? p.created_at).slice(0, 10);

  async function aceptar() {
    setEnviando(true); setError(null);
    const r = await fetch(`/api/portal/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, acepto }) });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || j.error) { setError(j.error ?? "No se pudo registrar."); return; }
    setAceptacion(j.aceptacion);
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Propuesta de inversión</p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">{p.cliente ?? "Propuesta"}</h1>
        <p className="mt-1 text-xs text-muted">Preparada el {fmtFecha(fecha)}{p.asesor ? ` por ${p.asesor}` : ""} · ejecución a través de BCE&M.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Monto a invertir" valor={fmtMonto(p.perfil?.monto ?? 0, moneda)} />
        <Kpi label="Rendimiento anual" valor={fmtNum(m?.tirNeta ?? null, 2, "%")} sub="TIR neta de costos e IRPF" />
        <Kpi label="Intereses por año" valor={m?.interesAnual != null ? fmtMonto(m.interesAnual, moneda) : "—"} sub="aproximado" />
        <Kpi label="Plazo promedio" valor={m?.duration != null ? `${fmtNum(m.duration, 1)} años` : "—"} sub="duration" />
      </div>

      <section className="rounded-2xl border border-ink-border bg-ink-panel p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Composición</p>
        <div className="flex flex-col divide-y divide-ink-border/60">
          {p.items.map((it) => (
            <div key={it.isin} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-paper">{it.nombre}</p>
                <p className="text-[11px] text-muted">{it.moneda}{it.cupon != null ? ` · cupón ${fmtNum(it.cupon, 3, "%")}` : ""}{it.vencimiento ? ` · vence ${fmtFecha(it.vencimiento)}` : ""}</p>
                {it.motivo && <p className="mt-0.5 text-[11px] text-muted">{it.motivo}</p>}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="text-sm font-semibold text-paper">{fmtNum(it.peso, 1, "%")}</p>
                <p className="text-[11px] text-muted">≈ {fmtMonto(((p.perfil?.monto ?? 0) * it.peso) / 100, moneda)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {p.analisis && (
        <section className="rounded-2xl border border-ink-border bg-ink-panel p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Por qué esta cartera</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-paper">{p.analisis.replace(/[#*_`]/g, "")}</p>
        </section>
      )}

      <section className="rounded-2xl border-2 border-gold/40 bg-ink-panel p-4">
        {aceptacion ? (
          <div>
            <p className="text-base font-semibold text-gain">✓ Propuesta aceptada</p>
            <p className="mt-1 text-sm text-paper">Aceptada por {aceptacion.nombre} el {new Date(aceptacion.fecha).toLocaleString("es-UY", { dateStyle: "long", timeStyle: "short" })}.</p>
            <p className="mt-1 text-xs text-muted">Tu asesor ya recibió el aviso y se va a comunicar para coordinar la compra.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-paper">¿Estás de acuerdo con esta propuesta?</p>
            <label className="text-xs text-muted">Tu nombre completo
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1 block w-full rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper" />
            </label>
            <label className="flex items-start gap-2 text-xs text-paper">
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Leí la propuesta y estoy de acuerdo con que mi asesor coordine la compra de estos títulos por el monto indicado, a los precios de mercado del día de la operación y con los costos del corredor.</span>
            </label>
            {error && <p className="text-xs text-loss">{error}</p>}
            <button type="button" onClick={aceptar} disabled={enviando || !acepto || nombre.trim().length < 3} className="self-start rounded bg-gold px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{enviando ? "Registrando…" : "Acepto la propuesta"}</button>
          </div>
        )}
      </section>

      <p className="pb-6 text-center text-[10px] text-muted">
        Simulación con precios del vector BCU a la fecha de la propuesta; los precios y rendimientos finales dependen del mercado el día de la compra.
        Rendimientos pasados o estimados no garantizan resultados futuros. Este link es personal: no lo compartas.
      </p>
    </main>
  );
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-paper">{valor}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
