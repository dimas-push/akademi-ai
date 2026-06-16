import { useState, useRef, useEffect, useCallback } from "react";

const SUGGESTIONS = [
  "Apa saja deadline tugas minggu ini?",
  "Berapa nilai rata-rata saya saat ini?",
  "Tugas apa yang belum saya kumpulkan?",
  "Mata kuliah apa yang sedang saya ambil?",
];

export default function ChatTab({ msgs, setMsgs, deadlines, assignments, grades, courses }) {
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);
  const abortRef              = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const buildContext = useCallback(() => ({
    courses,
    deadlines,
    assignments: assignments ? Object.values(assignments).flat() : [],
    grades: grades ? Object.values(grades).flatMap(g => g.items || []) : [],
  }), [courses, deadlines, assignments, grades]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg   = { role: "user", content: trimmed };
    const nextMsgs  = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);

    const assistantMsg = { role: "assistant", content: "" };
    setMsgs(prev => [...prev, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs, context: buildContext() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMsgs(prev => {
                const updated = [...prev];
                const last    = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.text };
                }
                return updated;
              });
            }
          } catch (e) {
            if (e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setMsgs(prev => {
        const updated = [...prev];
        const last    = updated[updated.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = { ...last, content: `❌ ${err.message}` };
        }
        return updated;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [msgs, setMsgs, loading, buildContext]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    if (loading) handleStop();
    setMsgs([]);
  };

  return (
    <div className="chat-wrap">
      {/* Header */}
      <div className="view-hdr" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 className="view-title">AI Chat 🤖</h1>
            <p className="view-sub">Tanya seputar kuliah, tugas, dan nilai kamu</p>
          </div>
          {msgs.length > 0 && (
            <button className="chat-clear-btn" onClick={handleClear} title="Hapus percakapan">
              Hapus
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🎓</div>
            <p className="chat-empty-title">Halo! Ada yang bisa saya bantu?</p>
            <p className="chat-empty-sub">
              Saya punya akses ke data kuliah, tugas, deadline, dan nilai kamu.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="chat-suggestion" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`chat-bubble-wrap ${m.role}`}>
            <div className={`chat-bubble ${m.role}`}>
              {m.content
                ? m.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < m.content.split("\n").length - 1 && <br />}
                    </span>
                  ))
                : m.role === "assistant" && loading && i === msgs.length - 1
                  ? <span className="chat-cursor" />
                  : null}
            </div>
          </div>
        ))}

        {loading && msgs[msgs.length - 1]?.role !== "assistant" && (
          <div className="chat-bubble-wrap assistant">
            <div className="chat-bubble assistant">
              <span className="chat-cursor" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ketik pesan..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        {loading ? (
          <button className="chat-send-btn stop" onClick={handleStop} title="Hentikan">
            ■
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            title="Kirim (Enter)"
          >
            ↑
          </button>
        )}
      </div>

    </div>
  );
}
