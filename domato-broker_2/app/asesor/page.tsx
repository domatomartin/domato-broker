"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Anthropic message format for history
interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGERENCIAS = [
  "¿Cuál es la distribución de mi cartera por moneda?",
  "¿Qué bonos vencen en los próximos 12 meses?",
  "¿Cómo está el rendimiento de los Globales ROU?",
  "¿Cuánto cobro en cupones este trimestre?",
];

function MessageBubble({
  msg,
  isStreaming,
}: {
  msg: Message;
  isStreaming: boolean;
}) {
  const isUser = msg.role === "user";

  // Render markdown-lite: bold (**text**) and line breaks
  function renderContent(text: string) {
    if (!text && isStreaming) {
      return (
        <span className="inline-flex gap-1 items-center">
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      );
    }

    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    const nodes = parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-paper">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part.split("\n").map((line, j) => (
        <span key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </span>
      ));
    });

    return (
      <>
        {nodes}
        {isStreaming && (
          <span className="inline-block w-0.5 h-[1em] bg-gold animate-pulse ml-0.5 align-middle" />
        )}
      </>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-gold text-xs font-bold shrink-0 mt-0.5">
          IA
        </div>
      )}
      <div
        className={[
          "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-gold/15 border border-gold/30 text-paper rounded-tr-sm"
            : "bg-ink/40 border border-ink-border text-paper rounded-tl-sm",
        ].join(" ")}
      >
        {renderContent(msg.content)}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-paper/10 border border-ink-border flex items-center justify-center text-muted text-xs font-bold shrink-0 mt-0.5">
          vos
        </div>
      )}
    </div>
  );
}

export default function AsesorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    // Build history from current messages (exclude the pending assistant slot)
    const history: HistoryMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Optimistic update: add user message + empty assistant slot
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStreaming(true);

    try {
      const resp = await fetch("/api/asesor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      if (!resp.ok || !resp.body) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Error al contactar el asesor. Intentá de nuevo.",
          };
          return copy;
        });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: accumulated,
          };
          return copy;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="px-6 py-3 border-b border-ink-border flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-gold text-xs font-bold">
          IA
        </div>
        <div>
          <h1 className="font-display text-base text-paper leading-none">
            Asesor IA
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Análisis de cartera · BCE&amp;M Operadores
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div
            className={[
              "w-2 h-2 rounded-full transition-colors",
              streaming ? "bg-gold animate-pulse" : "bg-gain",
            ].join(" ")}
          />
          <span className="text-xs text-muted">
            {streaming ? "Pensando…" : "Listo"}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center max-w-md mx-auto w-full">
            <div>
              <div className="w-14 h-14 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold text-xl font-bold mx-auto mb-4">
                IA
              </div>
              <p className="text-paper text-lg font-medium">
                ¿En qué te puedo ayudar hoy?
              </p>
              <p className="text-muted text-sm mt-1.5">
                Preguntame sobre tu cartera, rendimientos, vencimientos o
                estrategia.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={streaming}
                  className="text-left text-xs text-muted border border-ink-border rounded-xl px-3.5 py-2.5 hover:border-gold/50 hover:text-paper transition-colors disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-3 border-t border-ink-border shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribí tu pregunta…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-ink/40 border border-ink-border rounded-2xl px-4 py-3 text-sm text-paper placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors overflow-y-auto disabled:opacity-60"
            style={{ minHeight: "44px", maxHeight: "128px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="shrink-0 w-10 h-10 rounded-2xl bg-gold flex items-center justify-center text-ink disabled:opacity-40 hover:bg-gold-bright transition-colors"
            aria-label="Enviar"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="text-xs text-muted mt-1.5 px-1">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}
