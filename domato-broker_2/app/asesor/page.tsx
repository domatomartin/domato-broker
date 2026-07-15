"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGERENCIAS = [
  "¿Cómo está mi cartera hoy?",
  "¿Cuáles son mis bonos con mayor rendimiento?",
  "¿Qué posición me conviene reducir?",
  "Resumí mi exposición en dólares",
];

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "• $1")
    .replace(/\n/g, "<br/>");
}

function MessageBubble({ msg, streaming }: { msg: Message; streaming?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-gold text-ink rounded-br-sm"
            : "bg-ink-bg text-paper rounded-bl-sm border border-ink-border"
        }`}
      >
        {isUser ? (
          <span>{msg.content}</span>
        ) : (
          <span
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
        )}
        {streaming && (
          <span className="inline-block w-2 h-4 bg-gold ml-1 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

export default function AsesorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...nextMessages, assistantMsg]);

    try {
      const res = await fetch("/api/asesor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) throw new Error("No response body");

      setLoading(false);
      setStreaming(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Strip optional SSE "data: " prefix — Anthropic SDK omits it
          const jsonStr = trimmedLine.startsWith("data: ")
            ? trimmedLine.slice(6).trim()
            : trimmedLine;

          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (
              parsed.type === "content_block_delta" &&
              parsed.delta?.type === "text_delta"
            ) {
              accumulated += parsed.delta.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                };
                return updated;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      console.error("[asesor] stream error:", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Hubo un error al procesar tu consulta. Intentá de nuevo.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-ink text-paper">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-ink-border">
        <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-ink font-bold text-sm">
          D
        </div>
        <span className="text-gold font-semibold text-base">Asesor Domato</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <p className="text-muted text-sm">¿En qué puedo ayudarte hoy?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-ink-border bg-ink-bg text-paper hover:border-gold transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                streaming={
                  streaming && i === messages.length - 1 && msg.role === "assistant"
                }
              />
            ))}
            {loading && !streaming && (
              <div className="flex justify-start mb-4">
                <div className="bg-ink-bg border border-ink-border rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 bg-muted rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-2 border-t border-ink-border">
        <div className="flex items-end gap-3 bg-ink-bg border border-ink-border rounded-2xl px-4 py-3 focus-within:border-gold transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí tu consulta..."
            rows={1}
            className="flex-1 bg-transparent text-paper text-sm resize-none outline-none placeholder:text-muted max-h-32"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="text-ink bg-gold rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            Enviar
          </button>
        </div>
        <p className="text-center text-xs text-muted mt-2">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}
