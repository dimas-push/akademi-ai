// ═══════════════════════════════════════════════════════════════
//  /api/moodle/auto-attend.js
//  Auto-absensi Moodle:
//    1. Login web Moodle → dapat session cookie + sesskey
//    2. Ambil semua modul attendance via WS API
//    3. Untuk tiap modul: cek view.php → cari link sessid
//    4. Kunjungi attendance.php?sessid=X → dapat opsi status
//    5. POST submit → hadir
//
//  GET  /api/moodle/auto-attend?debug=1  → detail log tiap langkah
//  POST /api/moodle/auto-attend           → jalankan + return hasil
// ═══════════════════════════════════════════════════════════════

const BASE   = process.env.MOODLE_BASE_URL || 'https://elearning.ubpkarawang.ac.id';
const TOKEN  = process.env.MOODLE_TOKEN;
const UNAME  = process.env.MOODLE_USERNAME;
const UPASS  = process.env.MOODLE_PASSWORD;
const WS_API = `${BASE}/webservice/rest/server.php`;

// Header agar tidak diblok sebagai bot
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const BROWSER = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

// ─── Cookie helpers ───────────────────────────────────────────

function parseCookies(res) {
  const out = {};
  const lines = typeof res.headers?.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [(res.headers.get('set-cookie') || '')];
  for (const line of lines) {
    const part = line.split(';')[0].trim();
    const eq   = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ─── Extractor helpers ────────────────────────────────────────

function extractSesskey(html) {
  // Coba berbagai pola Moodle (berbeda versi & tema)
  const patterns = [
    /"sesskey"\s*:\s*"([a-zA-Z0-9]+)"/,
    /sesskey\s*=\s*"([a-zA-Z0-9]+)"/,
    /sesskey\s*=\s*'([a-zA-Z0-9]+)'/,
    /name="sesskey"[^>]+value="([a-zA-Z0-9]+)"/,
    /value="([a-zA-Z0-9]+)"[^>]+name="sesskey"/,
    /\bsesskey\b['":\s]+([a-zA-Z0-9]{10,})/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractSessid(html) {
  // Sessid muncul di link ke attendance.php
  const patterns = [
    /attendance\.php[^"'<>\s]*[?&]sessid=(\d+)/,
    /[?&]sessid=(\d+)/,
    /name="sessid"[^>]+value="(\d+)"/,
    /value="(\d+)"[^>]+name="sessid"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractHadirStatus(html) {
  // Kumpulkan semua <input> tag, filter yang type=radio AND name=status
  // (order-agnostic — urutan atribut bisa berbeda tiap tema/versi Moodle)
  const radios = [];
  for (const m of html.matchAll(/<input[^>]+>/gi)) {
    const tag = m[0];
    if (!/type=["']?radio["']?/i.test(tag))  continue;
    if (!/name=["']?status["']?/i.test(tag))  continue;
    const val = tag.match(/value=["']?(\d+)["']?/i)?.[1];
    if (val) radios.push({ index: m.index, value: val });
  }

  if (!radios.length) return null;

  // Cari yang label terdekatnya mengandung "Hadir" / "Present"
  for (const r of radios) {
    const ctx = html.slice(r.index, r.index + 500);
    if (/\bhadir\b|\bpresent\b/i.test(ctx)) return r.value;
  }

  // Fallback: radio pertama (di UBP biasanya urutan: Hadir → Sakit → Ijin → Alpa)
  return radios[0].value;
}

// ─── Login Moodle web ─────────────────────────────────────────

async function moodleLogin(log) {
  log.push('→ Ambil halaman login...');

  const loginPageRes = await fetch(`${BASE}/login/index.php`, {
    headers: BROWSER,
  });
  const jar      = parseCookies(loginPageRes);
  const loginHtml = await loginPageRes.text();

  const ltMatch    = loginHtml.match(/name="logintoken"\s+value="([^"]+)"/);
  const logintoken = ltMatch?.[1] || '';
  log.push(`  logintoken: ${logintoken ? '✓' : '✗ tidak ditemukan'}`);

  // POST login
  const loginBody = new URLSearchParams({ username: UNAME, password: UPASS, logintoken, anchor: '' });
  const loginRes  = await fetch(`${BASE}/login/index.php`, {
    method: 'POST',
    headers: { ...BROWSER, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: loginBody.toString(),
    redirect: 'manual',
  });
  Object.assign(jar, parseCookies(loginRes));

  // Follow redirects (Moodle biasanya redirect 2-3 kali setelah login)
  let sesskey = null;
  let redirectUrl = loginRes.headers.get('location');
  let hops = 0;

  while (redirectUrl && !sesskey && hops < 5) {
    hops++;
    const url = redirectUrl.startsWith('http') ? redirectUrl : `${BASE}${redirectUrl}`;
    log.push(`  Redirect ke: ${url.replace(BASE, '')}`);

    const r = await fetch(url, {
      headers: { ...BROWSER, Cookie: cookieHeader(jar) },
      redirect: 'manual',
    });
    Object.assign(jar, parseCookies(r));
    redirectUrl = r.headers.get('location');

    const ct = r.headers.get('content-type') || '';
    if (ct.includes('html')) {
      const html = await r.text();
      sesskey = extractSesskey(html);
      if (sesskey) { log.push(`  sesskey ditemukan ✓`); break; }
    }
  }

  // Fallback: ambil dari halaman /my/
  if (!sesskey) {
    log.push('  Fallback: ambil sesskey dari /my/');
    const myRes  = await fetch(`${BASE}/my/`, { headers: { ...BROWSER, Cookie: cookieHeader(jar) } });
    Object.assign(jar, parseCookies(myRes));
    const myHtml = await myRes.text();
    sesskey      = extractSesskey(myHtml);
  }

  log.push(`Login: ${sesskey ? 'BERHASIL ✓' : 'GAGAL ✗ — cek username/password'}`);
  return { jar, sesskey };
}

// ─── Ambil semua attendance module dari semua matkul ──────────

async function getAllAttendanceCmids(log) {
  const crsRes  = await fetch(`${WS_API}?wstoken=${TOKEN}&wsfunction=core_course_get_enrolled_courses_by_timeline_classification&classification=inprogress&moodlewsrestformat=json`);
  const crsData = await crsRes.json();
  const courses  = crsData?.courses || [];
  log.push(`Matkul aktif: ${courses.length}`);

  const cmids = [];
  await Promise.all(courses.map(async (c) => {
    try {
      const r        = await fetch(`${WS_API}?wstoken=${TOKEN}&wsfunction=core_course_get_contents&courseid=${c.id}&moodlewsrestformat=json`);
      const sections = await r.json();
      if (!Array.isArray(sections)) return;
      for (const sec of sections)
        for (const mod of sec.modules || [])
          if (mod.modname === 'attendance')
            cmids.push({ cmid: mod.id, name: mod.name, course: c.shortname || c.fullname, courseId: c.id });
    } catch {}
  }));

  log.push(`Modul attendance ditemukan: ${cmids.length}`);
  return cmids;
}

// ─── Cek & submit satu modul ─────────────────────────────────

async function processModule(jar, _loginSesskey, mod, log) {
  // Step 1: view.php → cari link ke sessid
  const viewRes  = await fetch(`${BASE}/mod/attendance/view.php?id=${mod.cmid}`, {
    headers: { ...BROWSER, Cookie: cookieHeader(jar) },
  });
  const viewHtml = await viewRes.text();

  const sessid = extractSessid(viewHtml);
  if (!sessid) {
    log.push(`  [${mod.course}] tidak ada sesi terbuka`);
    return { ...mod, status: 'closed' };
  }

  log.push(`  [${mod.course}] sessid=${sessid}, buka form...`);

  // Step 2: attendance.php?sessid=X → form dengan semua hidden field
  const formUrl = `${BASE}/mod/attendance/attendance.php?sessid=${sessid}`;
  const formRes = await fetch(formUrl, {
    headers: { ...BROWSER, Cookie: cookieHeader(jar) },
  });
  const formHtml = await formRes.text();

  // Sudah absen sebelumnya?
  if (/already.{0,40}saved|sudah.{0,20}diisi|telah.{0,20}hadir|you have already/i.test(formHtml)) {
    log.push(`  [${mod.course}] sudah absen ✓`);
    return { ...mod, status: 'already' };
  }

  // Tidak ada form submit (sesi sudah tutup / read-only)?
  if (!/<form[^>]+action[^>]*attendance/i.test(formHtml)) {
    log.push(`  [${mod.course}] form submit tidak ditemukan`);
    return { ...mod, status: 'closed' };
  }

  // Extract SEMUA hidden input dari form (sesskey, sessid, _qf__, dll)
  const hidden = {};
  for (const m of formHtml.matchAll(/<input[^>]+>/gi)) {
    const tag = m[0];
    if (!/type=["']?hidden["']?/i.test(tag)) continue;
    const name  = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    if (name) hidden[name] = value;
  }

  // Sesskey dari form jauh lebih reliable daripada dari login page
  const sesskey = hidden['sesskey'] || extractSesskey(formHtml) || _loginSesskey;
  log.push(`  [${mod.course}] hidden fields: [${Object.keys(hidden).join(', ')}]`);
  log.push(`  [${mod.course}] sesskey: ${sesskey ? sesskey.slice(0,8) + '...' : '✗ tidak ada'}`);

  // Radio button status "Hadir"
  const statusId = extractHadirStatus(formHtml);
  if (!statusId) {
    log.push(`  [${mod.course}] ✗ radio status tidak ditemukan`);
    return { ...mod, status: 'no_status' };
  }
  log.push(`  [${mod.course}] statusId=${statusId}, submit...`);

  // Form action URL (pakai action dari HTML jika ada)
  const rawAction = formHtml.match(/action="([^"]*attendance[^"]*)"/i)?.[1] || '/mod/attendance/attendance.php';
  const formAction = rawAction.startsWith('http') ? rawAction : `${BASE}${rawAction}`;

  // POST: semua hidden fields + status + submit button
  const body = new URLSearchParams({
    ...hidden,
    sessid,
    sesskey,
    status:       statusId,
    submitbutton: 'Save changes',
  });

  const submitRes = await fetch(formAction, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer':       formUrl,
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
    redirect: 'manual',
  });

  // 302/303 = redirect ke view.php = sukses
  if (submitRes.status === 302 || submitRes.status === 303) {
    log.push(`  [${mod.course}] HADIR ✓ (redirect ${submitRes.status})`);
    return { ...mod, status: 'attended' };
  }

  // HTTP 200 — cek body untuk konfirmasi atau pesan error
  const resText = await submitRes.text().catch(() => '');
  const snippet = resText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const confirmed = /attendance.{0,30}saved|absensi.{0,30}simpan|berhasil|success|saved/i.test(resText);

  log.push(`  [${mod.course}] HTTP ${submitRes.status} — ${confirmed ? 'HADIR ✓' : 'GAGAL'}`);
  log.push(`  Response: ${snippet}`);
  return { ...mod, status: confirmed ? 'attended' : 'failed' };
}

// ─── Handler ─────────────────────────────────────────────────

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).end();

  const isDebug = req.query?.debug === '1' || req.query?.debug === 'true';

  if (!UNAME || !UPASS) {
    return res.status(500).json({
      error: 'MOODLE_USERNAME / MOODLE_PASSWORD belum diset di .env.local',
      hint: 'Salin .env.example ke .env.local lalu isi kredensial Moodle kamu',
    });
  }
  if (!TOKEN) {
    return res.status(500).json({ error: 'MOODLE_TOKEN belum diset di .env.local' });
  }

  const log = [];
  const started = Date.now();

  try {
    // 1. Login
    const { jar, sesskey } = await moodleLogin(log);
    if (!sesskey) {
      return res.status(401).json({ error: 'Login Moodle gagal', log });
    }

    // 2. Ambil modul attendance
    const modules = await getAllAttendanceCmids(log);
    if (!modules.length) {
      return res.status(200).json({ checked: 0, attended: [], failed: [], log, ms: Date.now() - started });
    }

    // 3. Proses paralel (batch 5 agar tidak flood)
    const results = [];
    const BATCH   = 5;
    for (let i = 0; i < modules.length; i += BATCH) {
      const batch   = modules.slice(i, i + BATCH);
      const checked = await Promise.all(batch.map(mod => processModule(jar, sesskey, mod, log).catch(err => {
        log.push(`  [${mod.course}] ERROR: ${err.message}`);
        return { ...mod, status: 'error', message: err.message };
      })));
      results.push(...checked);
    }

    const attended = results.filter(r => r.status === 'attended');
    const failed   = results.filter(r => ['failed', 'error', 'no_status'].includes(r.status));

    return res.status(200).json({
      checked:  results.length,
      attended: attended.map(r => ({ name: r.name, course: r.course })),
      failed:   failed.map(r => ({ name: r.name, course: r.course, reason: r.status, message: r.message })),
      skipped:  results.filter(r => r.status === 'closed').length,
      alreadyDone: results.filter(r => r.status === 'already').length,
      ms: Date.now() - started,
      ...(isDebug ? { log, details: results } : {}),
    });
  } catch (err) {
    console.error('[AutoAttend]', err);
    log.push(`FATAL: ${err.message}`);
    return res.status(500).json({ error: err.message, log });
  }
}
