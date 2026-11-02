"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app se pueda instalar en el celular. */
export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
