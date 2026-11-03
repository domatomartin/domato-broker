// Agenda de reuniones con clientes: tipos y enlaces para agregarlas al calendario.

export type Reunion = {
  id: string;
  cliente_id: string;
  fecha: string;          // ISO con hora
  duracion_min: number;
  motivo: string;
  lugar: string | null;
  hecha: boolean;
  creado?: string;
};

const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Link de Google Calendar con el evento ya cargado. */
export function linkGoogle(r: Reunion, cliente: string) {
  const ini = new Date(r.fecha), fin = new Date(ini.getTime() + (r.duracion_min || 60) * 60_000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Reunión con ${cliente}`,
    dates: `${z(ini)}/${z(fin)}`,
    details: `${r.motivo}\n\nFicha: ${typeof window !== "undefined" ? window.location.origin : ""}/clientes/${r.cliente_id}`,
    ...(r.lugar ? { location: r.lugar } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Descarga un .ics (iPhone/Apple Calendar, Outlook y Google lo abren). */
export function descargarIcs(r: Reunion, cliente: string) {
  const ini = new Date(r.fecha), fin = new Date(ini.getTime() + (r.duracion_min || 60) * 60_000);
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Domato//Agenda//ES", "BEGIN:VEVENT",
    `UID:${r.id}@domato`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(ini)}`, `DTEND:${z(fin)}`,
    `SUMMARY:${esc(`Reunión con ${cliente}`)}`, `DESCRIPTION:${esc(r.motivo)}`, ...(r.lugar ? [`LOCATION:${esc(r.lugar)}`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Reunión con ${cliente}`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `reunion-${cliente.replace(/\s+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const fmtFechaHora = (iso: string) => new Date(iso).toLocaleString("es-UY", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
