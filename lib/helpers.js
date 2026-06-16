// ─── CONSTANTS ────────────────────────────────────────────────
export const API          = "/api/moodle";
export const MONTHS       = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
export const DAYS_SHORT   = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
export const STUDENT_NAME = process.env.NEXT_PUBLIC_STUDENT_NAME || "Mahasiswa";
export const STUDENT_NIM  = process.env.NEXT_PUBLIC_STUDENT_NIM  || "";

// ─── DATE HELPERS ─────────────────────────────────────────────
export const fmtDate  = (d) => { if (!d) return "-"; const dt = new Date(d); return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`; };
export const fmtFull  = (d) => { if (!d) return "-"; const dt = new Date(d); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; };
export const daysUntil = (d) => { if (!d) return 999; return Math.ceil((new Date(d) - new Date()) / 864e5); };
export const timeToISO = (ts) => ts ? new Date(ts * 1000).toISOString() : null;

// ─── STRING HELPERS ───────────────────────────────────────────
export const strip = (html) => (html || "").replace(/<[^>]*>/g, "").substring(0, 250);
export const uid   = () => Math.random().toString(36).slice(2, 9);
export const cx    = (...c) => c.filter(Boolean).join(" ");

// ─── DOMAIN HELPERS ───────────────────────────────────────────
export const isAttendanceEvent = (e) => {
  const n = (e.name || "").toLowerCase();
  return e.modulename === "attendance" || e.type === "attendance"
    || n.includes("presensi") || n.includes("attendance") || n.includes("kehadiran");
};

// ─── FETCH WITH RETRY ─────────────────────────────────────────
export async function safeFetch(url, retries = 2, delay = 1500) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries) {
        console.warn(`[AkademiAI] Failed after ${retries + 1} attempts: ${url}`, e.message);
        return null;
      }
      await new Promise((res) => setTimeout(res, delay * (i + 1)));
    }
  }
  return null;
}
