// lib/whatsapp.js
// Kirim pesan WhatsApp via Fonnte API — server-side only

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const WA_TARGET    = process.env.WA_TARGET; // nomor tujuan, format: 6281234567890

export async function sendWhatsApp(message, { token, target } = {}) {
  const tok = token  || FONNTE_TOKEN;
  const num = target || WA_TARGET;
  if (!tok || !num) return false;

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': tok,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: num, message, countryCode: '62' }),
    });
    const data = await res.json();
    return data.status === true;
  } catch {
    return false;
  }
}

export const waConfigured = () => !!(FONNTE_TOKEN && WA_TARGET);
