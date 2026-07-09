"use client";

import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) setError("Email o contraseña incorrectos.");
  }

  if (session === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="text-sm text-muted">Cargando…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-4">
        <div className="card-shadow rounded-2xl bg-ink-panel px-8 py-9 w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <img
              src="/logo.jpg"
              alt="Domato Broker"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <div className="leading-tight">
              <p className="font-display font-bold text-paper text-sm">Domato</p>
              <p className="text-[10px] tracking-[0.14em] text-muted uppercase">
                Gestión patrimonial
              </p>
            </div>
          </div>

          <h1 className="font-display text-xl text-paper mb-1">Iniciar sesión</h1>
          <p className="text-sm text-muted mb-6">Acceso restringido al administrador.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-ink-border bg-ink px-3 py-2.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <input
              type="password"
              required
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-ink-border bg-ink px-3 py-2.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold"
            />
            {error && <p className="text-xs text-loss">{error}</p>}
            <button
              type="submit"
              disabled={signingIn}
              className="mt-1 rounded bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-bright transition-colors disabled:opacity-50"
            >
              {signingIn ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar userEmail={session.user.email ?? undefined} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
