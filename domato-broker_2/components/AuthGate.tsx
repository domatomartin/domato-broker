"use client";

import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bot } from "lucide-react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import BottomNav from "./BottomNav";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const [nueva, setNueva] = useState("");
  const [nueva2, setNueva2] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      // Al entrar desde el link del mail de recuperación, pedimos la contraseña nueva.
      if (event === "PASSWORD_RECOVERY") setRecuperando(true);
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

  async function olvideContrasena() {
    setError(null); setAviso(null);
    if (!email) { setError("Escribí tu email arriba y volvé a tocar “Olvidé mi contraseña”."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setError(`No se pudo enviar el mail: ${error.message}`);
    else setAviso("Te mandamos un mail con un link para crear una contraseña nueva. Abrilo en este mismo dispositivo.");
  }

  async function guardarNueva(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) { setError("Usá al menos 8 caracteres."); return; }
    if (nueva !== nueva2) { setError("Las dos contraseñas no coinciden."); return; }
    setSigningIn(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setSigningIn(false);
    if (error) { setError(`No se pudo cambiar: ${error.message}`); return; }
    setRecuperando(false); setNueva(""); setNueva2("");
    if (pathname === "/cuenta/clave") window.location.href = "/dashboard";
  }

  const cambiando = recuperando || pathname === "/cuenta/clave";
  if (session && session !== "loading" && cambiando) {
    const campo = "rounded border border-ink-border bg-ink px-3 py-2.5 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-gold";
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-4">
        <div className="card-shadow rounded-2xl bg-ink-panel px-8 py-9 w-full max-w-sm">
          <h1 className="font-display text-xl text-paper mb-1">Contraseña nueva</h1>
          <p className="text-sm text-muted mb-6">{session.user.email}</p>
          <form onSubmit={guardarNueva} className="flex flex-col gap-3">
            <input type="password" required autoComplete="new-password" placeholder="Contraseña nueva" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} />
            <input type="password" required autoComplete="new-password" placeholder="Repetila" value={nueva2} onChange={(e) => setNueva2(e.target.value)} className={campo} />
            {error && <p className="text-xs text-loss">{error}</p>}
            <button type="submit" disabled={signingIn} className="mt-1 rounded bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-bright transition-colors disabled:opacity-50">
              {signingIn ? "Guardando…" : "Guardar y entrar"}
            </button>
          </form>
        </div>
      </div>
    );
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
            {aviso && <p className="text-xs text-gain">{aviso}</p>}
            <button
              type="submit"
              disabled={signingIn}
              className="mt-1 rounded bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-bright transition-colors disabled:opacity-50"
            >
              {signingIn ? "Ingresando…" : "Ingresar"}
            </button>
            <button type="button" onClick={olvideContrasena} className="text-xs text-muted underline hover:text-paper">
              Olvidé mi contraseña
            </button>
          </form>
        </div>
      </div>
    );
  }

  const showFAB = !pathname?.startsWith("/asesor");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar userEmail={session.user.email ?? undefined} />
        <main className="flex-1 min-w-0 pb-16 md:pb-0 print:pb-0">{children}</main>
      </div>
      <BottomNav />

      {showFAB && (
        <Link
          href="/asesor"
          title="Asesor Domato"
          className="print:hidden fixed bottom-20 md:bottom-6 right-6 z-50 rounded-full bg-gold text-ink shadow-lg flex items-center justify-center hover:bg-gold-bright transition-colors"
          style={{ width: 52, height: 52 }}
        >
          <Bot size={22} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
