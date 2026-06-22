// /api/notify/telegram.js
// Kirim pesan ke Telegram — endpoint untuk test dari browser

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, token, chatId } = req.body || {};

  const tok  = BOT_TOKEN || token;
  const chat = CHAT_ID   || chatId;

  // Status check (GET-like via POST with no message)
  if (!message) {
    return res.status(200).json({
      configured: !!(BOT_TOKEN && CHAT_ID),
      hasToken:   !!tok,
      hasChatId:  !!chat,
    });
  }

  if (!tok || !chat) {
    return res.status(400).json({
      error: 'Telegram belum dikonfigurasi',
      hint: 'Set TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Vercel environment variables',
      configured: false,
    });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: 'HTML' }),
    });

    const data = await tgRes.json();
    if (!data.ok) {
      return res.status(502).json({ error: data.description, code: data.error_code });
    }

    return res.status(200).json({ ok: true, messageId: data.result?.message_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
