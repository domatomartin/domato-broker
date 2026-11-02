// Test de perfil de inversor: preguntas, puntaje y perfil resultante.
// Basado en los criterios habituales de idoneidad (objetivo, horizonte, experiencia, tolerancia a pérdidas, liquidez).

import type { Objetivo, Riesgo } from "@/lib/propuesta";

export type Pregunta = { id: string; texto: string; opciones: { texto: string; puntos: number }[] };

export const PREGUNTAS: Pregunta[] = [
  {
    id: "objetivo",
    texto: "¿Qué buscás principalmente con esta inversión?",
    opciones: [
      { texto: "Que no pierda valor, aunque gane poco", puntos: 0 },
      { texto: "Cobrar una renta periódica estable", puntos: 1 },
      { texto: "Un equilibrio entre renta y crecimiento", puntos: 2 },
      { texto: "Que crezca lo más posible en el largo plazo", puntos: 3 },
    ],
  },
  {
    id: "horizonte",
    texto: "¿En cuánto tiempo podrías necesitar este dinero?",
    opciones: [
      { texto: "Menos de 1 año", puntos: 0 },
      { texto: "Entre 1 y 3 años", puntos: 1 },
      { texto: "Entre 3 y 7 años", puntos: 2 },
      { texto: "Más de 7 años", puntos: 3 },
    ],
  },
  {
    id: "liquidez",
    texto: "¿Qué parte de tus ahorros representa esta inversión?",
    opciones: [
      { texto: "Casi todos mis ahorros", puntos: 0 },
      { texto: "Más de la mitad", puntos: 1 },
      { texto: "Entre un cuarto y la mitad", puntos: 2 },
      { texto: "Menos de un cuarto", puntos: 3 },
    ],
  },
  {
    id: "experiencia",
    texto: "¿Qué experiencia tenés invirtiendo?",
    opciones: [
      { texto: "Ninguna, solo plazos fijos o caja de ahorro", puntos: 0 },
      { texto: "Algo, en letras o bonos del Estado", puntos: 1 },
      { texto: "Bonos corporativos, fideicomisos o fondos", puntos: 2 },
      { texto: "Acciones, bonos del exterior u otros instrumentos de riesgo", puntos: 3 },
    ],
  },
  {
    id: "caida",
    texto: "Si en un año tu inversión baja 10%, ¿qué hacés?",
    opciones: [
      { texto: "Vendo todo para no perder más", puntos: 0 },
      { texto: "Vendo una parte", puntos: 1 },
      { texto: "Espero a que se recupere", puntos: 2 },
      { texto: "Aprovecho para comprar más", puntos: 3 },
    ],
  },
  {
    id: "perdida",
    texto: "¿Cuánto podrías tolerar perder en un mal año sin cambiar de plan?",
    opciones: [
      { texto: "Nada", puntos: 0 },
      { texto: "Hasta 5%", puntos: 1 },
      { texto: "Hasta 15%", puntos: 2 },
      { texto: "Más de 15%", puntos: 3 },
    ],
  },
  {
    id: "ingresos",
    texto: "¿Cómo son tus ingresos hoy?",
    opciones: [
      { texto: "Inestables o dependo de esta inversión", puntos: 0 },
      { texto: "Estables pero justos", puntos: 1 },
      { texto: "Estables y me sobra para ahorrar", puntos: 2 },
      { texto: "Altos y diversificados", puntos: 3 },
    ],
  },
  {
    id: "moneda",
    texto: "¿Cómo te sentís invirtiendo en otras monedas o fuera de Uruguay?",
    opciones: [
      { texto: "Prefiero solo dólares o pesos en Uruguay", puntos: 0 },
      { texto: "Algo en UI o en el exterior, poco", puntos: 1 },
      { texto: "Una parte importante diversificada", puntos: 2 },
      { texto: "Sin problema, busco diversificar al máximo", puntos: 3 },
    ],
  },
];

export const PUNTAJE_MAX = PREGUNTAS.reduce((s, p) => s + Math.max(...p.opciones.map((o) => o.puntos)), 0);

export type ResultadoPerfil = {
  puntaje: number;
  riesgo: Riesgo;
  objetivo: Objetivo;
  plazoMaxAnios: number;
  descripcion: string;
  alertas: string[];
};

export const DESCRIPCION_RIESGO: Record<Riesgo, string> = {
  conservador: "Prioriza no perder capital. Deuda del Estado uruguayo y emisores de primera línea, plazos cortos o medios, poca volatilidad.",
  moderado: "Acepta algo de variación a cambio de más renta. Mezcla de soberanos, obligaciones y fideicomisos locales, y algo del exterior.",
  agresivo: "Busca más rendimiento y tolera caídas temporales. Plazos largos, más exterior y emisores de mayor riesgo o renta variable.",
};

export function evaluarPerfil(respuestas: Record<string, number>): ResultadoPerfil | null {
  if (PREGUNTAS.some((p) => respuestas[p.id] == null)) return null;
  const pts = (id: string) => PREGUNTAS.find((p) => p.id === id)!.opciones[respuestas[id]]?.puntos ?? 0;
  const puntaje = PREGUNTAS.reduce((s, p) => s + pts(p.id), 0);
  const pct = puntaje / PUNTAJE_MAX;
  let riesgo: Riesgo = pct < 0.4 ? "conservador" : pct < 0.7 ? "moderado" : "agresivo";
  const alertas: string[] = [];
  // Topes de prudencia: plazo corto o mucha dependencia del dinero limitan el perfil.
  if (pts("horizonte") === 0 && riesgo !== "conservador") { riesgo = "conservador"; alertas.push("Necesita el dinero en menos de un año: se limita a perfil conservador."); }
  if ((pts("liquidez") === 0 || pts("ingresos") === 0) && riesgo === "agresivo") { riesgo = "moderado"; alertas.push("Depende mucho de este dinero: se limita a perfil moderado."); }
  if (pts("perdida") === 0 && riesgo === "agresivo") { riesgo = "moderado"; alertas.push("No tolera pérdidas: se limita a perfil moderado."); }
  const objetivo: Objetivo = pts("objetivo") === 0 ? "preservar" : pts("objetivo") === 3 ? "crecimiento" : "renta";
  const plazoMaxAnios = [1, 3, 7, 15][pts("horizonte")];
  return { puntaje, riesgo, objetivo, plazoMaxAnios, descripcion: DESCRIPCION_RIESGO[riesgo], alertas };
}

export type FichaCliente = {
  id: string;
  nombre: string;
  cuenta: string | null;
  email: string | null;
  telefono: string | null;
  monto_previsto: number | null;
  moneda: string | null;
  perfil: (ResultadoPerfil & { respuestas: Record<string, number>; fecha: string }) | null;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
};

export type NotaCliente = { id: string; cliente_id: string; fecha: string; texto: string; created_at?: string };
