// Dipanggil oleh GitHub Actions cron setiap 15 menit.
// Cek jam kuliah (WIB), lalu jalankan auto-attend.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth     = req.headers['authorization'];
  const secret   = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Cek jadwal WIB (UTC+7): Sen–Jum 08:00–00:00 (tengah malam)
  const now     = new Date();
  const wibMs   = now.getTime() + 7 * 60 * 60 * 1000;
  const wib     = new Date(wibMs);
  const wibDay  = wib.getUTCDay();   // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const wibHour = wib.getUTCHours();
  if (wibDay === 0 || wibDay === 6 || wibHour < 8) {
    return res.status(200).json({ skip: true, reason: 'Di luar jadwal (Sen–Jum 08:00–00:00 WIB)' });
  }

  // Panggil endpoint auto-attend
  const base   = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const result = await fetch(`${base}/api/moodle/auto-attend`, { method: 'POST' });
  const data   = await result.json();

  return res.status(200).json({ ok: true, ...data });
}
