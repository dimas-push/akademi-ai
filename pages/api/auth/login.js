import { deriveToken } from '../../../lib/auth-token';

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body || {};
  const secret = process.env.DASHBOARD_PASSWORD;

  if (!secret) {
    return res.status(500).json({ error: "DASHBOARD_PASSWORD belum diset di .env.local" });
  }

  if (password !== secret) {
    return res.status(401).json({ error: "Password salah" });
  }

  // Simpan token (hash dari password), bukan password itu sendiri
  const token = deriveToken(secret);
  res.setHeader("Set-Cookie", `akademi-auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`);
  return res.status(200).json({ ok: true });
}
