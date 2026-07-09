"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond, InvestorProfile } from "@/lib/types";
import { computePortfolio, portfolioTotals, formatMoney } from "@/lib/calculations";
import { Panel } from "@/components/Card";

const RIESGOS = ["conservador", "moderado", "agresivo"];

export default function PerfilPage() {
  const [profile, setProfile] = useState<Partial<InvestorProfile>>({
    riesgo_aceptado: "moderado",
  });
  const [patrimonio, setPatrimonio] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: prof }, { data: bonds }] = await Promise.all([
        supabase.from("investor_profile").select("*").eq("id", 1).maybeSingle(),
        supabase.from("bonds").select("*").eq("estado", "activo"),
      ]);
      if (prof) setProfile(prof as InvestorProfile);
      const totals = portfolioTotals(computePortfolio((bonds as Bond[]) ?? []));
      setPatrimonio(totals.valorTotal);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("investor_profile").upsert({
      id: 1,
      objetivos_financieros: profile.objetivos_financieros ?? null,
      rentabilidad_objetivo: profile.rentabilidad_objetivo ?? null,
      riesgo_aceptado: profile.riesgo_aceptado ?? "moderado",
      horizonte_inversion: profile.horizonte_inversion ?? null,
      distribucion_objetivo: profile.distribucion_objetivo ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) setSavedAt(new Date().toLocaleTimeString("es-UY"));
  }

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Perfil del inversor</h1>
        <p className="text-sm text-muted mt-1">
          Tus objetivos y tolerancia al riesgo — sirve de referencia para vos, no cambia ningún cálculo automático.
        </p>
      </div>

      <Panel title="Patrimonio actual">
        <p className="font-mono mono-num text-2xl text-paper">{loading ? "…" : formatMoney(patrimonio)}</p>
        <p className="text-xs text-muted mt-1">Calculado a partir de tu cartera activa.</p>
      </Panel>

      <Panel title="Objetivos y tolerancia al riesgo">
        <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-xl">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Objetivos financieros
            <textarea
              value={profile.objetivos_financieros ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, objetivos_financieros: e.target.value }))}
              rows={3}
              placeholder="Ej: preservar capital y generar renta mensual para cubrir gastos."
              className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Rentabilidad objetivo anual (%)
            <input
              type="number"
              step="0.1"
              value={profile.rentabilidad_objetivo ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, rentabilidad_objetivo: Number(e.target.value) }))}
              className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-xs text-muted">
            Riesgo aceptado
            <div className="flex gap-2">
              {RIESGOS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setProfile((p) => ({ ...p, riesgo_aceptado: r }))}
                  className={`rounded-full px-3.5 py-1.5 text-xs border transition-colors capitalize ${
                    profile.riesgo_aceptado === r
                      ? "bg-gold text-white border-gold"
                      : "border-ink-border text-muted hover:text-paper"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Horizonte de inversión
            <input
              type="text"
              value={profile.horizonte_inversion ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, horizonte_inversion: e.target.value }))}
              placeholder="Ej: largo plazo, 10+ años"
              className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Distribución objetivo
            <textarea
              value={profile.distribucion_objetivo ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, distribucion_objetivo: e.target.value }))}
              rows={2}
              placeholder="Ej: 60% USD, 30% UI, 10% UYU"
              className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-bright transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar perfil"}
            </button>
            {savedAt && <span className="text-xs text-gain">Guardado a las {savedAt}.</span>}
          </div>
        </form>
      </Panel>
    </div>
  );
}
