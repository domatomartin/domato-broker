"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";

function timeSince(dateStr: string | null | undefined): { label: string; color: string } {
  if (!dateStr) return { label: "Sin datos", color: "text-muted" };
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 1) return { label: "hace menos de 1h", color: "text-gain" };
  if (hours < 24) return { label: `hace ${hours}h`, color: "text-gain" };
  if (days <= 3) return { label: `hace ${days}d`, color: "text-gold" };
  if (days <= 7) return { label: `hace ${days}d`, color: "text-gold" };
  return { label: `hace ${days}d`, color: "text-loss" };
}

function TipoBadge({ bond }: { bond: Bond & { asset_type?: string } }) {
  if (bond.asset_type === "accion") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/20 text-gold">
        Accion
      </span>
    );
  }
  const moneda = bond.moneda ?? "USD";
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-ink-bg text-muted border border-ink-border">
      Bono {moneda}
    </span>
  );
}

function PriceCell({
  bond,
  onSaved,
}: {
  bond: Bond & { precio_updated_at?: string };
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(bond.precio_mercado ?? ""));
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const num = parseFloat(val);
    if (isNaN(num)) {
      setFlash("err");
      setTimeout(() => setFlash(null), 1500);
      setEditing(false);
      return;
    }
    const { error } = await supabase
      .from("bonds")
      .update({
        precio_mercado: num,
        precio_updated_at: new Date().toISOString(),
      })
      .eq("id", bond.id);
    setFlash(error ? "err" : "ok");
    setTimeout(() => {
      setFlash(null);
      onSaved();
    }, 1000);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-28 rounded border border-gold bg-ink px-2 py-0.5 text-sm text-paper focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-sm font-mono tabular-nums px-2 py-0.5 rounded transition-colors hover:bg-gold/10 hover:text-gold ${
        flash === "ok"
          ? "text-gain"
          : flash === "err"
          ? "text-loss"
          : "text-paper"
      }`}
    >
      {bond.precio_mercado != null
        ? Number(bond.precio_mercado).toFixed(2)
        : "-"}
    </button>
  );
}

function NotasCell({
  bond,
  onSaved,
}: {
  bond: Bond & { notas?: string };
  onSaved: () => void;
}) {
  const [val, setVal] = useState(bond.notas ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (val === (bond.notas ?? "")) return;
    setSaving(true);
    await supabase.from("bonds").update({ notas: val }).eq("id", bond.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onSaved();
    }, 1500);
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        placeholder="Novedades, dividendos, noticias..."
        rows={2}
        className="w-full resize-none rounded border border-ink-border bg-ink px-2 py-1.5 text-xs text-paper placeholder:text-muted focus:outline-none focus:border-gold transition-colors"
      />
      {saving && <span className="text-[10px] text-muted">Guardando...</span>}
      {saved && <span className="text-[10px] text-gain">Guardado</span>}
    </div>
  );
}

type ExtBond = Bond & {
  asset_type?: string;
  precio_updated_at?: string;
  notas?: string;
  dividendo?: number;
};

function InstrumentTable({
  instruments,
  showDividendo,
  onReload,
}: {
  instruments: ExtBond[];
  showDividendo: boolean;
  onReload: () => void;
}) {
  return (
    <div className="rounded-xl border border-ink-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-border bg-ink-bg">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">
              Instrumento
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">
              Tipo
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">
              Precio
            </th>
            {showDividendo && (
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">
                Dividendo
              </th>
            )}
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">
              Actualizado
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted min-w-[220px]">
              Novedades
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-border/50">
          {instruments.map((bond) => {
            const ts = timeSince(bond.precio_updated_at ?? (bond as any).updated_at);
            return (
              <tr
                key={bond.id}
                className="hover:bg-ink-bg/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="text-paper font-medium">{bond.nombre}</p>
                  {bond.ticker && (
                    <p className="text-muted text-xs">{bond.ticker}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <TipoBadge bond={bond} />
                </td>
                <td className="px-4 py-3 text-right">
                  <PriceCell bond={bond} onSaved={onReload} />
                </td>
                {showDividendo && (
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-mono text-muted">
                      {bond.dividendo != null
                        ? Number(bond.dividendo).toFixed(4)
                        : "-"}
                    </span>
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className={`text-xs ${ts.color}`}>{ts.label}</span>
                </td>
                <td className="px-4 py-3">
                  <NotasCell bond={bond} onSaved={onReload} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PreciosPage() {
  const [bonds, setBonds] = useState<ExtBond[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo")
      .order("nombre");
    setBonds((data as ExtBond[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const acciones = bonds.filter((b) => b.asset_type === "accion");
  const bonos = bonds.filter((b) => b.asset_type !== "accion");

  return (
    <div className="p-6 md:p-8 flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-paper">
          Precios y Novedades
        </h1>
        <p className="text-sm text-muted mt-1">
          Actualizá precios manualmente y anotá novedades por instrumento.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Cargando...</p>
      ) : bonds.length === 0 ? (
        <p className="text-sm text-muted">No hay instrumentos activos.</p>
      ) : (
        <>
          {bonos.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
                Bonos
              </h2>
              <InstrumentTable
                instruments={bonos}
                showDividendo={false}
                onReload={load}
              />
            </section>
          )}

          {acciones.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
                Acciones
              </h2>
              <InstrumentTable
                instruments={acciones}
                showDividendo={true}
                onReload={load}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
