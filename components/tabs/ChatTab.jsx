import { useEffect } from "react";
import { STUDENT_NAME, cx } from "../../lib/helpers";

const QUICK_PROMPTS = ["Tugas apa yang paling urgent?", "Analisis performa saya", "Beri saran belajar", "Rangkum pengumuman", "Jadwal minggu ini"];

export default function ChatTab({ msgs, input, setInput, send, loading, endRef }) {
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, endRef]);

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">AI Chat 🤖</h1>
        <p className="view-sub">Data real-time dari elearning</p>
      </div>
      <div className="quick-prompts">
        {QUICK_PROMPTS.map((p, i) => (
          <button key={i} className="qp-btn" onClick={() => send(p)}>{p}</button>
        ))}
      </div>
      <div className="chat-box">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
            <p>Halo {STUDENT_NAME.split(" ")[0]}! Saya AkademiAI.</p>
            <p>Terhubung langsung ke elearning UBP Karawang.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx("chat-msg", m.role === "user" ? "msg-user" : "msg-ai")}>
            {m.role === "assistant" && <div className="msg-label">🤖 AkademiAI</div>}
            <div className="msg-text">{m.content}</div>
            <div className="msg-time">{new Date(m.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg msg-ai">
            <div className="typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
          placeholder="Tanya AkademiAI..."
          className="chat-input"
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} className="send-btn">➤</button>
      </div>
    </div>
  );
}
