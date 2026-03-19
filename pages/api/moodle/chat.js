// ═══════════════════════════════════════════════════════════════
//  /api/chat.js — AI Chat proxy for AkademiAI
//  Keeps ANTHROPIC_API_KEY server-side (secure)
// ═══════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { context, messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `Kamu adalah AkademiAI, asisten akademik AI untuk mahasiswa UBP Karawang. Jawab dalam Bahasa Indonesia yang friendly dan supportive. Gunakan emoji secukupnya. Berikan jawaban yang spesifik dan actionable berdasarkan data berikut:\n\n${context || "Tidak ada data tersedia."}`,
        messages,
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