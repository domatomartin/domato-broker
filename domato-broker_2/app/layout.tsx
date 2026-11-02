import type { Metadata, Viewport } from "next";
import { Manrope, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import RegistrarSW from "@/components/RegistrarSW";

const display = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "DoMato Broker",
  description: "Inversiones · Análisis · Confianza — centro integral de gestión patrimonial",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Domato", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#000b1f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body`}
      >
        <RegistrarSW />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
