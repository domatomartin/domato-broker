"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Briefcase, Landmark, FileSignature, Menu, X } from "lucide-react";
import { groups } from "./Sidebar";

const TABS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/cartera", label: "Cartera", icon: Briefcase },
  { href: "/opciones", label: "Opciones", icon: Landmark },
  { href: "/propuestas", label: "Propuestas", icon: FileSignature },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Cerrar el menú al navegar.
  useEffect(() => { setAbierto(false); }, [pathname]);

  const enTab = TABS.some((t) => pathname?.startsWith(t.href));
  const clase = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
      active ? "text-sidebar-text bg-sidebar-active" : "text-sidebar-muted hover:text-sidebar-text"
    }`;

  return (
    <>
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-[60px] left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-sidebar px-4 pt-4 pb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-sidebar-text">Todas las secciones</p>
              <button type="button" onClick={() => setAbierto(false)} className="text-sidebar-muted" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">{g.label}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname?.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[11px] leading-tight ${
                          active ? "bg-sidebar-active text-sidebar-text" : "bg-sidebar-hover text-sidebar-muted"
                        }`}
                      >
                        <Icon size={20} strokeWidth={1.8} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 block md:hidden print:hidden bg-sidebar border-t border-sidebar-hover">
        <div className="flex">
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clase(!!pathname?.startsWith(href))}>
              <Icon size={20} strokeWidth={2} />
              {label}
            </Link>
          ))}
          <button type="button" onClick={() => setAbierto((v) => !v)} className={clase(abierto || !enTab)}>
            <Menu size={20} strokeWidth={2} />
            Más
          </button>
        </div>
      </nav>
    </>
  );
}
