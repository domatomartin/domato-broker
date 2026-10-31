"use client";

/**
 * Campo de tipo de cambio legible: guarda "valor de 1 unidad de <moneda> en <base>",
 * pero lo muestra como lo dice el mercado (1 USD = 40,19 UYU, o 1 EUR = 1,12 USD).
 */
export function invertido(fx: number) {
  return fx < 1; // si 1 unidad vale menos que 1 de la base, se muestra al revés
}

export function textoTc(moneda: string, base: string, fx: number | undefined | null) {
  if (!fx) return "—";
  return invertido(fx)
    ? `1 ${base} = ${(1 / fx).toLocaleString("es-UY", { maximumFractionDigits: 4 })} ${moneda}`
    : `1 ${moneda} = ${fx.toLocaleString("es-UY", { maximumFractionDigits: 4 })} ${base}`;
}

export default function TipoCambioInput({
  moneda, base, fx, onChange, disabled,
}: { moneda: string; base: string; fx: number | undefined; onChange: (fx: number | undefined) => void; disabled?: boolean }) {
  const inv = fx != null ? invertido(fx) : moneda === "UYU" || moneda === "BRL" || moneda === "UI" ? base !== "UYU" : false;
  const mostrado = fx ? (inv ? 1 / fx : fx) : undefined;
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {inv ? `1 ${base} =` : `1 ${moneda} =`}
      <div className="flex items-center gap-1">
        <input
          key={`${moneda}-${inv}`}
          defaultValue={mostrado != null ? String(Number(mostrado.toFixed(4))) : ""}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            onChange(n > 0 ? (inv ? 1 / n : n) : undefined);
          }}
          disabled={disabled}
          inputMode="decimal"
          className="w-24 rounded border border-ink-border bg-ink px-2 py-1 text-right text-sm text-paper"
        />
        <span>{inv ? moneda : base}</span>
      </div>
    </label>
  );
}
