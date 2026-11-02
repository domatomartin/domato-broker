"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarcoImpresion } from "@/components/InformeBono";

/**
 * Hoja A4 imprimible a pantalla completa (estado de cuenta, constancias…).
 * En el celular se achica para entrar entera; al imprimir sale a tamaño real y solo el documento.
 */
export default function DocumentoA4({
  pie, barra, onClose, children,
}: { pie: React.ReactNode; barra?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  const [escala, setEscala] = useState(1);
  const [alto, setAlto] = useState<number | null>(null);
  const hojaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const calc = () => setEscala(Math.min(1, (window.innerWidth - 16) / 794));
    calc();
    window.addEventListener("resize", calc);
    const el = hojaRef.current;
    const ro = el ? new ResizeObserver(() => setAlto(el.offsetHeight)) : null;
    if (el && ro) ro.observe(el);
    return () => { window.removeEventListener("resize", calc); ro?.disconnect(); };
  });

  useEffect(() => {
    setMontado(true);
    document.body.classList.add("informe-abierto");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { document.body.classList.remove("informe-abierto"); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  if (!montado) return null;
  return createPortal(
    <div id="informe-root" className="fixed inset-0 z-[100] overflow-auto bg-ink print:bg-white">
      <div className="print:hidden sticky top-0 z-10 border-b border-ink-border bg-ink-panel/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3">
          {barra}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-bright">Imprimir / Guardar PDF</button>
            <button type="button" onClick={onClose} className="rounded border border-ink-border px-4 py-2 text-sm text-paper">Cerrar</button>
          </div>
        </div>
      </div>
      <div
        className="mx-auto my-2 sm:my-6 overflow-hidden print:my-0 print:!h-auto print:!w-auto print:overflow-visible"
        style={{ width: 794 * escala, height: alto != null ? alto * escala : undefined }}
      >
        <article
          ref={hojaRef}
          style={{ transform: escala < 1 ? `scale(${escala})` : undefined, transformOrigin: "top left" }}
          className="informe w-[794px] bg-white px-[16mm] py-[14mm] shadow-lg print:w-auto print:p-0 print:shadow-none text-paper"
        >
          <MarcoImpresion pie={pie}>
            <div className="space-y-7 text-[11.5px] leading-relaxed">{children}</div>
          </MarcoImpresion>
        </article>
      </div>
    </div>,
    document.body
  );
}

/** Encabezado común de los documentos para clientes. */
export function EncabezadoDoc({ eyebrow, titulo, sub }: { eyebrow: string; titulo: string; sub: string }) {
  return (
    <header className="flex items-end justify-between gap-6 border-b-[3px] border-[#1E3A5F] pb-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Domato" className="h-14 w-14 rounded-lg object-cover" />
        <div className="leading-tight">
          <p className="font-display text-xl">Domato</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted">Gestión patrimonial</p>
        </div>
      </div>
      <div className="text-right leading-tight">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#2563EB]">{eyebrow}</p>
        <p className="font-display text-[22px]">{titulo}</p>
        <p className="mt-0.5 text-[10px] text-muted">{sub}</p>
      </div>
    </header>
  );
}

export function CampoDoc({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold text-paper">{valor}</p>
    </div>
  );
}

export function KpiDoc({ label, valor, sub, acento, tono }: { label: string; valor: string; sub?: string; acento?: boolean; tono?: "gain" | "loss" }) {
  return (
    <div className={`kpi min-w-0 overflow-hidden rounded-lg border px-3 py-3 ${acento ? "border-[#1E3A5F] bg-[#1E3A5F] text-white" : "border-[#E7E9EE] bg-white"}`}>
      <p className={`text-[8.5px] font-semibold uppercase tracking-[0.1em] ${acento ? "text-white/70" : "text-muted"}`}>{label}</p>
      <p className={`mt-1 whitespace-nowrap text-[17px] font-semibold leading-tight tabular-nums print:text-[15px] ${tono === "gain" ? "text-[#15803D]" : tono === "loss" ? "text-[#DC2626]" : ""}`}>{valor}</p>
      {sub && <p className={`mt-0.5 text-[9px] ${acento ? "text-white/70" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}
