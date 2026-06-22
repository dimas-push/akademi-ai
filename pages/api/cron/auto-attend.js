// Dipanggil oleh GitHub Actions cron setiap 15 menit.
// Cek jam kuliah (WIB), lalu jalankan auto-attend.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth     = req.headers['authorization'];
  const secret   = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Cek jam kuliah WIB (UTC+7): Sen–Sab 06:00–22:00
  const now     = new Date();
  const wibMs   = now.getTime() + 7 * 60 * 60 * 1000;
  const wib     = new Date(wibMs);
  const wibDay  = wib.getUTCDay();   // 0=Sun
  const wibHour = wib.getUTCHours();
  if (wibDay === 0 || wibHour < 6 || wibHour >= 22) {
    return res.status(200).json({ skip: true, reason: 'Di luar jam kuliah' });
  }

  // Panggil endpoint auto-attend
  const base   = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const result = await fetch(`${base}/api/moodle/auto-attend`, { method: 'POST' });
  const data   = await result.json();

  return res.status(200).json({ ok: true, ...data });
}
