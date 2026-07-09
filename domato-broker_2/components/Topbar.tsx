"use client";

import { Search, Bell, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Topbar({ userEmail }: { userEmail?: string }) {
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "MP";

  return (
    <header className="h-16 shrink-0 border-b border-ink-border bg-ink-panel px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-muted max-w-sm w-full">
        <Search size={16} />
        <input
          type="text"
          placeholder="Buscar bono, ISIN, emisor…"
          className="w-full bg-transparent text-sm placeholder:text-muted focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          aria-label="Notificaciones"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-ink-border text-muted hover:text-paper hover:border-gold/30 transition-colors"
        >
          <Bell size={16} />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-loss" />
        </button>
        <div className="flex items-center gap-2.5 pl-3 border-l border-ink-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-white font-display font-semibold text-xs">
            {initials}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium text-paper truncate max-w-[140px]">
              {userEmail ?? "Administrador"}
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-[11px] text-muted hover:text-loss transition-colors flex items-center gap-1"
            >
              <LogOut size={10} /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
