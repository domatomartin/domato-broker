"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  BellRing,
  Wallet,
  History,
  ShieldAlert,
  FlaskConical,
  FileBarChart,
  LineChart,
  Newspaper,
  CalendarDays,
  UserCircle,
} from "lucide-react";

const groups: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    label: "Panel",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/alertas", label: "Alertas", icon: BellRing },
    ],
  },
  {
    label: "Cartera",
    items: [
      { href: "/cartera", label: "Cartera", icon: Wallet },
      { href: "/historico", label: "Histórico", icon: History },
      { href: "/riesgo", label: "Riesgo", icon: ShieldAlert },
    ],
  },
  {
    label: "Herramientas",
    items: [
      { href: "/simulador", label: "Simulador", icon: FlaskConical },
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
    ],
  },
  {
    label: "Reportes",
    items: [{ href: "/informes", label: "Informes", icon: FileBarChart }],
  },
  {
    label: "Contexto",
    items: [
      { href: "/mercados", label: "Mercados", icon: LineChart },
      { href: "/noticias", label: "Noticias", icon: Newspaper },
    ],
  },
  {
    label: "Cuenta",
    items: [{ href: "/perfil", label: "Perfil", icon: UserCircle }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-sidebar px-4 py-6 hidden md:flex md:flex-col">
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <img
          src="/logo.jpg"
          alt="Domato Broker"
          className="h-9 w-9 rounded-lg object-cover"
        />
        <div className="leading-tight">
          <p className="font-display font-bold text-sidebar-text text-sm">
            Domato
          </p>
          <p className="text-[10px] tracking-[0.14em] text-sidebar-muted uppercase">
            Gestión patrimonial
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-active text-sidebar-text font-medium"
                        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
                    )}
                  >
                    <Icon size={16} strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 px-3 text-[11px] text-sidebar-muted leading-relaxed border-t border-white/5">
        Actualizado cada 30 min · BVM, FRED, mercados globales
      </div>
    </aside>
  );
}
