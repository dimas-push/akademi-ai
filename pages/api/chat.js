import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple rate limiter: 20 req/min per IP
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= 20;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";
  if (!checkRate(ip)) {
    return res.status(429).json({ error: "Terlalu banyak permintaan, coba lagi dalam 1 menit" });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages harus berupa array" });
  }

  // Build academic context system prompt
  let system = `Kamu adalah asisten akademik AI untuk mahasiswa UBP Karawang. \
Bantu mahasiswa dengan pertanyaan seputar kuliah, tugas, nilai, dan deadline. \
Jawab dalam Bahasa Indonesia dengan singkat, ramah, dan jelas. \
Jika data akademik tersedia, gunakan untuk menjawab lebih spesifik.`;

  if (context) {
    const parts = [];

    if (context.courses?.length) {
      parts.push(`\nMata Kuliah Aktif (${context.courses.length}):\n` +
        context.courses.slice(0, 10).map(c => `- ${c.fullname || c.shortname}`).join("\n"));
    }

    if (context.deadlines?.length) {
      const now = Math.floor(Date.now() / 1000);
      const upcoming = context.deadlines
        .filter(d => d.timesort > now)
        .slice(0, 8);
      if (upcoming.length) {
        parts.push(`\nDeadline Mendatang:\n` +
          upcoming.map(d => {
            const date = new Date(d.timesort * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            return `- ${d.name} [${d.modulename}] → ${date}`;
          }).join("\n"));
      }
    }

    if (context.assignments?.length) {
      const pending = context.assignments.filter(a => a.laststatus !== "submitted").slice(0, 5);
      if (pending.length) {
        parts.push(`\nTugas Belum Dikumpulkan:\n` +
          pending.map(a => `- ${a.name}`).join("\n"));
      }
    }

    if (parts.length) system += "\n\nData akademik mahasiswa:" + parts.join("");
  }

  // Stream SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system,
      messages: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[Chat API]", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Gagal menghubungi AI" });
    }
    res.write(`data: ${JSON.stringify({ error: "Koneksi AI terputus" })}\n\n`);
    res.end();
  }
}
