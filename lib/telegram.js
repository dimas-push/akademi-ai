// lib/telegram.js
// Helper untuk kirim pesan ke Telegram — dipakai dari API routes (server-side)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(text, { token, chatId } = {}) {
  const tok  = token  || BOT_TOKEN;
  const chat = chatId || CHAT_ID;
  if (!tok || !chat) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

export const telegramConfigured = () => !!(BOT_TOKEN && CHAT_ID);
