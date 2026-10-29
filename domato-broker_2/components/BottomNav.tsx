"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Briefcase, Calendar, MessageCircle, Landmark } from "lucide-react";

const TABS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/cartera", label: "Cartera", icon: Briefcase },
  { href: "/opciones", label: "Opciones", icon: Landmark },
  { href: "/calendario", label: "Calendario", icon: Calendar },
  { href: "/asesor", label: "Asesor", icon: MessageCircle },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 block md:hidden print:hidden bg-sidebar border-t border-sidebar-hover">
      <div className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                active ? "text-sidebar-text bg-sidebar-active" : "text-sidebar-muted hover:text-sidebar-text"
              }`}
            >
              <Icon size={20} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
