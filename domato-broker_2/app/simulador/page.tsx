"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bond } from "@/lib/types";
import { computePortfolio, formatMoney, formatPct } from "@/lib/calculations";
import {
  simulateSellToday,
  simulateHoldToMaturity,
  simulateReinvestCoupons,
  simulateRateChange,
  simulatePriceChange,
  simulateFxChange,
} from "@/lib/simulator";
import { Panel } from "@/components/Card";

export default function SimuladorPage() {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [reinvestRate, setReinvestRate] = useState(6);
  const [rateDeltaBp, setRateDeltaBp] = useState(100);
  const [priceDeltaPct, setPriceDeltaPct] = useState(-5);
  const [fxDeltaPct, setFxDeltaPct] = useState(5);

  useEffect(() => {
    supabase
      .from("bonds")
      .select("*")
      .eq("estado", "activo")
      .then(({ data }) => {
        const list = (data as Bond[]) ?? [];
        setBonds(list);
        if (list.length > 0) setSelectedId(list[0].id);
      });
  }, []);

  const computed = computePortfolio(bonds);
  const bond = useMemo(() => computed.find((b) => b.id === selectedId), [computed, selectedId]);

  if (bonds.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="font-display text-3xl text-paper">Simulador de escenarios</h1>
        <p className="text-sm text-muted mt-3">
          Cargá al menos un bono en Cartera para poder simular escenarios sobre él.
        </p>
      </div>
    );
  }

  const sell = bond ? simulateSellToday(bond) : null;
  const hold = bond ? simulateHoldToMaturity(bond) : null;
  const reinvest = bond ? simulateReinvestCoupons(bond, reinvestRate) : null;
  const rate = bond ? simulateRateChange(bond, rateDeltaBp) : null;
  const price = bond ? simulatePriceChange(bond, priceDeltaPct) : null;
  const fx = bond ? simulateFxChange(bond, fxDeltaPct) : null;

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-paper">Simulador de escenarios</h1>
        <p className="text-sm text-muted mt-1">
          Proyecciones para pensar decisiones, no una recomendación de inversión: se basan en supuestos simplificados
          (redención a la par, cupón anualizado, duration por defecto de 5 años si falta cargarla).
        </p>
      </div>

      <Panel title="Bono a simular">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded border border-ink-border bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold w-full md:w-96"
        >
          {bonds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre} · {b.moneda}
            </option>
          ))}
        </select>
      </Panel>

      {bond && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Si vendo hoy">
            <p className="text-xs text-muted mb-3">Realiza la ganancia o pérdida actual a precio de mercado.</p>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Valor de mercado</span>
              <span className="font-mono">{formatMoney(sell!.valorFinal, bond.moneda === "UYU" ? "UYU" : "USD")}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Ganancia / pérdida</span>
              <span className={`font-mono ${sell!.ganancia >= 0 ? "text-gain" : "text-loss"}`}>
                {formatMoney(sell!.ganancia, bond.moneda === "UYU" ? "UYU" : "USD")}
              </span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad</span>
              <span className={`font-mono ${sell!.rentabilidadPct >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(sell!.rentabilidadPct)}
              </span>
            </div>
          </Panel>

          <Panel title="Si mantengo hasta el vencimiento">
            <p className="text-xs text-muted mb-3">
              Redención a la par + cupones proyectados durante {hold!.years.toFixed(1)} años.
            </p>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Valor final proyectado</span>
              <span className="font-mono">{formatMoney(hold!.valorFinal, bond.moneda === "UYU" ? "UYU" : "USD")}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad total</span>
              <span className={`font-mono ${hold!.rentabilidadPct >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(hold!.rentabilidadPct)}
              </span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad anualizada</span>
              <span className={`font-mono ${hold!.rentabilidadAnualizada >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(hold!.rentabilidadAnualizada)}
              </span>
            </div>
          </Panel>

          <Panel
            title="Si reinvierto los cupones"
            action={
              <div className="flex items-center gap-2 text-xs text-muted">
                Tasa
                <input
                  type="number"
                  value={reinvestRate}
                  onChange={(e) => setReinvestRate(Number(e.target.value))}
                  className="w-16 rounded border border-ink-border bg-ink px-2 py-1 text-paper text-xs"
                />
                %
              </div>
            }
          >
            <p className="text-xs text-muted mb-3">
              Cupones reinvertidos anualmente a la tasa indicada hasta el vencimiento.
            </p>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Valor final proyectado</span>
              <span className="font-mono">{formatMoney(reinvest!.valorFinal, bond.moneda === "UYU" ? "UYU" : "USD")}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad total</span>
              <span className={`font-mono ${reinvest!.rentabilidadPct >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(reinvest!.rentabilidadPct)}
              </span>
            </div>
          </Panel>

          <Panel
            title="Si cambian las tasas"
            action={
              <div className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={25}
                  value={rateDeltaBp}
                  onChange={(e) => setRateDeltaBp(Number(e.target.value))}
                  className="w-28"
                />
                {rateDeltaBp > 0 ? "+" : ""}
                {rateDeltaBp}pb
              </div>
            }
          >
            <p className="text-xs text-muted mb-3">
              Estimado con duration modificada.
              {rate!.usedDefaultDuration && " No cargaste la duration de este bono: se asumió 5 años."}
            </p>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Nuevo precio estimado</span>
              <span className="font-mono">{rate!.nuevoPrecio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Nuevo valor de mercado</span>
              <span className="font-mono">{formatMoney(rate!.nuevoValorMercado, bond.moneda === "UYU" ? "UYU" : "USD")}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad resultante</span>
              <span className={`font-mono ${rate!.rentabilidadPct >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(rate!.rentabilidadPct)}
              </span>
            </div>
          </Panel>

          <Panel
            title="Si cambia el precio"
            action={
              <div className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={priceDeltaPct}
                  onChange={(e) => setPriceDeltaPct(Number(e.target.value))}
                  className="w-28"
                />
                {priceDeltaPct > 0 ? "+" : ""}
                {priceDeltaPct}%
              </div>
            }
          >
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Nuevo precio</span>
              <span className="font-mono">{price!.nuevoPrecio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Rentabilidad resultante</span>
              <span className={`font-mono ${price!.rentabilidadPct >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPct(price!.rentabilidadPct)}
              </span>
            </div>
          </Panel>

          <Panel
            title="Si cambia el dólar"
            action={
              <div className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={1}
                  value={fxDeltaPct}
                  onChange={(e) => setFxDeltaPct(Number(e.target.value))}
                  className="w-28"
                />
                {fxDeltaPct > 0 ? "+" : ""}
                {fxDeltaPct}%
              </div>
            }
          >
            {fx!.aplica ? (
              <>
                <p className="text-xs text-muted mb-3">Bono en {bond.moneda}: se recalcula su valor en USD.</p>
                <div className="flex justify-between text-sm py-1">
                  <span className="text-muted">Nuevo valor en USD</span>
                  <span className="font-mono">{formatMoney(fx!.nuevoValorMercadoUsd)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">Este bono ya está en USD: no hay efecto de tipo de cambio.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
