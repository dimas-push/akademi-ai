// /api/notify/whatsapp.js
// Kirim pesan WhatsApp via Fonnte — untuk test dari browser

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const WA_TARGET    = process.env.WA_TARGET;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, token, target } = req.body || {};

  const tok = FONNTE_TOKEN || token;
  const num = WA_TARGET    || target;

  // Status check (POST tanpa message)
  if (!message) {
    return res.status(200).json({
      configured: !!(FONNTE_TOKEN && WA_TARGET),
      hasToken:   !!tok,
      hasTarget:  !!num,
    });
  }

  if (!tok || !num) {
    return res.status(400).json({
      error: 'WhatsApp belum dikonfigurasi',
      hint: 'Set FONNTE_TOKEN dan WA_TARGET di Vercel environment variables',
      configured: false,
    });
  }

  try {
    const fRes = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: num, message, countryCode: '62' }),
    });

    const data = await fRes.json();
    if (!data.status) {
      return res.status(502).json({ error: data.reason || 'Fonnte error', detail: data });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
