// /api/moodle/attendance-summary.js
// Mengambil data kehadiran resmi per matkul dari Moodle WS API

const BASE    = process.env.MOODLE_BASE_URL || 'https://elearning.ubpkarawang.ac.id';
const TOKEN   = process.env.MOODLE_TOKEN;
const USER_ID = process.env.MOODLE_USER_ID || '13592';
const WS_API  = `${BASE}/webservice/rest/server.php`;

async function ws(fn, params = {}) {
  const p = new URLSearchParams({ wstoken: TOKEN, wsfunction: fn, moodlewsrestformat: 'json', ...params });
  const res = await fetch(`${WS_API}?${p}`, { headers: { 'User-Agent': 'AkademiAI/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!TOKEN) return res.status(500).json({ error: 'MOODLE_TOKEN not set' });

  const started = Date.now();

  try {
    // 1. Ambil semua matkul aktif
    const crsData = await ws('core_course_get_enrolled_courses_by_timeline_classification', {
      classification: 'inprogress',
    });
    const courses = crsData?.courses || [];
    if (!courses.length) return res.status(200).json({ summary: [], ms: Date.now() - started });

    // 2. Untuk setiap matkul, cari modul attendance (cmid) dari course contents
    const attModules = [];
    const BATCH_C = 8; // paralel per batch
    for (let i = 0; i < courses.length; i += BATCH_C) {
      const batch = courses.slice(i, i + BATCH_C);
      await Promise.all(batch.map(async (c) => {
        try {
          const sections = await ws('core_course_get_contents', { courseid: c.id });
          if (!Array.isArray(sections)) return;
          for (const sec of sections)
            for (const mod of sec.modules || [])
              if (mod.modname === 'attendance')
                attModules.push({
                  cmid: mod.id,
                  name: mod.name,
                  course: c.shortname || c.fullname,
                  courseId: c.id,
                });
        } catch {}
      }));
    }

    if (!attModules.length) {
      return res.status(200).json({ summary: [], ms: Date.now() - started });
    }

    // 3. Ambil data user per modul attendance (batch 5)
    const BATCH_A = 5;
    const summary = [];
    for (let i = 0; i < attModules.length; i += BATCH_A) {
      const batch = attModules.slice(i, i + BATCH_A);
      const results = await Promise.all(batch.map(async (mod) => {
        try {
          const data = await ws('mod_attendance_get_user_data', {
            userid: USER_ID,
            cmid: mod.cmid,
          });

          if (data.exception) {
            return { courseId: mod.courseId, course: mod.course, activity: mod.name, error: data.message };
          }

          const s          = data.summary   || {};
          const statuses   = data.statuses  || [];
          const sessions   = data.sessionslog || [];

          // Cari status "Hadir"
          const hadirSt = statuses.find(st =>
            st.acronym?.toLowerCase() === 'h' ||
            /hadir|present/i.test(st.description || '')
          );

          const totalSessions = s.allsessions ?? sessions.length;
          const presentCount  = hadirSt
            ? sessions.filter(s => s.statusid === hadirSt.id && s.attendance_taken).length
            : null;

          // Persentase dari summary (lebih akurat, memperhitungkan bobot nilai)
          const pct = s.percentage != null
            ? Math.round(s.percentage * 100)
            : (presentCount != null && totalSessions > 0
              ? Math.round(presentCount / totalSessions * 100)
              : null);

          return {
            courseId: mod.courseId,
            course:   mod.course,
            activity: mod.name,
            totalSessions,
            presentCount: presentCount ?? null,
            maxPoints: s.maxpoints ?? null,
            pointsSum: s.pointssum ?? null,
            percentage: pct,
            label: s.percentageformatted || (pct != null ? `${pct}%` : '—'),
          };
        } catch (e) {
          return { courseId: mod.courseId, course: mod.course, activity: mod.name, error: e.message };
        }
      }));
      summary.push(...results);
    }

    // Urutkan: paling rendah dulu (perlu perhatian), lalu yang belum ada data
    summary.sort((a, b) => {
      if (a.percentage == null && b.percentage == null) return 0;
      if (a.percentage == null) return 1;
      if (b.percentage == null) return -1;
      return a.percentage - b.percentage;
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ summary, ms: Date.now() - started });
  } catch (err) {
    console.error('[AttendanceSummary]', err);
    return res.status(500).json({ error: err.message });
  }
}
