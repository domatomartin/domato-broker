// Enlaces de WhatsApp con el mensaje armado. Sin teléfono abre WhatsApp para elegir el contacto.

/** Normaliza un teléfono uruguayo: 099 123 456 → 59899123456; respeta números con código de país. */
export function normalizarTelefono(t: string | null | undefined): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("598") || d.length > 10) return d;
  if (d.startsWith("0")) return `598${d.slice(1)}`;
  if (d.length === 8 && d.startsWith("9")) return `598${d}`;
  return d;
}

export function linkWhatsApp(telefono: string | null | undefined, texto: string) {
  const n = normalizarTelefono(telefono);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(texto)}`;
}
