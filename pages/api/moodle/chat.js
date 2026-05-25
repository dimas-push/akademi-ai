// ═══════════════════════════════════════════════════════════════
//  /api/chat.js — AI Chat proxy for AkademiAI
//  Keeps ANTHROPIC_API_KEY server-side (secure)
// ═══════════════════════════════════════════════════════════════

// In-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi dalam 1 menit.", reply: "⚠️ Terlalu banyak pertanyaan. Tunggu 1 menit ya!" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { context, messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  // Sanitize: limit message count and content length
  const MAX_MESSAGES = 16;
  const MAX_CONTENT_LEN = 4000;
  const sanitized = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content || "").slice(0, MAX_CONTENT_LEN),
  }));

  const sanitizedContext = String(context || "").slice(0, 2000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `Kamu adalah AkademiAI, asisten akademik AI untuk mahasiswa UBP Karawang. Jawab dalam Bahasa Indonesia yang friendly dan supportive. Gunakan emoji secukupnya. Berikan jawaban yang spesifik dan actionable berdasarkan data berikut:\n\n${sanitizedContext || "Tidak ada data tersedia."}`,
        messages: sanitized,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Chat API] Anthropic error:", response.status, err);
      return res.status(response.status).json({
        error: `Anthropic API error: ${response.status}`,
        reply: "⚠️ Gagal menghubungi AI. Coba lagi nanti."
      });
    }

    const data = await response.json();
    const reply = data.content?.find((b) => b.type === "text")?.text || "Maaf, saya tidak bisa merespon saat ini.";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("[Chat API] Error:", error.message);
    return res.status(500).json({
      error: error.message,
      reply: "⚠️ Terjadi kesalahan server. Coba lagi nanti."
    });
  }
}
