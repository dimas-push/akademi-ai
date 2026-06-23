// ═══════════════════════════════════════════════════════════════
//  AkademiAI Service Worker
//  Berjalan di background 24/7 — tanpa app terbuka
//
//  Fitur:
//  - Notifikasi tugas baru
//  - Notifikasi deadline countdown (7h, 3h, 1h, hari ini)
//  - Notifikasi nilai berubah
//  - Morning briefing jam 7 pagi (Sen-Jum)
//  - Auto-absen di jam kuliah
// ═══════════════════════════════════════════════════════════════

const DB_NAME    = 'akademi-ai-sw';
const DB_VER     = 1;
const ICON       = '/icon.svg';
const CACHE_NAME = 'akademi-shell-v1';
const SHELL      = ['/', '/manifest.json', '/icon.svg'];

// ─── Install & Activate: cache shell ─────────────────────────

self.addEventListener('install',  e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); });

// ─── Fetch: offline fallback untuk navigasi ──────────────────

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/').then(r => r || new Response('<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#07101f;color:#e8f0f8"><h2>📡 Offline</h2><p>Buka AkademiAI saat ada koneksi internet.</p></body></html>', { headers: { 'Content-Type': 'text/html' } }))
    )
  );
});

// ─── IndexedDB helpers ────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('seen')) db.createObjectStore('seen');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbGet(db, key) {
  return new Promise(resolve => {
    const req = db.transaction('seen', 'readonly').objectStore('seen').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => resolve(null);
  });
}

function dbSet(db, key, val) {
  return new Promise(resolve => {
    const tx = db.transaction('seen', 'readwrite');
    tx.objectStore('seen').put(val, key);
    tx.oncomplete = resolve;
    tx.onerror    = resolve;
  });
}

// ─── Helpers ─────────────────────────────────────────────────

function isClassHour() {
  const now = new Date();
  return now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 8;
}

function isAttendanceEvent(e) {
  const n = (e.name || '').toLowerCase();
  return e.modulename === 'attendance' || n.includes('presensi') || n.includes('attendance') || n.includes('kehadiran');
}

function notify(title, body, tag, opts = {}) {
  return self.registration.showNotification(title, {
    body, icon: ICON, tag, renotify: true,
    requireInteraction: opts.sticky ?? false,
    ...opts,
  });
}

// ─── 1. Cek tugas baru ────────────────────────────────────────

async function checkNewAssignments(db, pending) {
  try {
    const res  = await fetch('/api/moodle/assignments');
    const data = await res.json();
    if (!data?.courses) return;

    const current = data.courses.flatMap(c =>
      (c.assignments || []).map(a => ({ id: a.id, name: a.name, course: c.shortname || c.fullname }))
    );
    const seenIds = await dbGet(db, 'asg-ids') || [];
    if (seenIds.length > 0) {
      for (const item of current.filter(a => !seenIds.includes(a.id)).slice(0, 3)) {
        pending.push({ title: '📝 Tugas Baru!', body: `${item.name} — ${item.course}`, tag: `asg-${item.id}` });
      }
    }
    await dbSet(db, 'asg-ids', current.map(a => a.id));
  } catch (e) { console.warn('[SW] checkNewAssignments:', e.message); }
}

// ─── 2. Cek absensi baru ─────────────────────────────────────

async function checkNewAttendance(db, pending) {
  try {
    const res  = await fetch('/api/moodle/deadlines?limitnum=50');
    const data = await res.json();
    if (!data?.events) return;

    const attEvents = data.events.filter(isAttendanceEvent);
    const seenIds   = await dbGet(db, 'att-ids') || [];
    if (seenIds.length > 0) {
      for (const item of attEvents.filter(e => !seenIds.includes(e.id)).slice(0, 3)) {
        pending.push({ title: '✅ Absensi Tersedia!', body: `${item.name} — ${item.course?.shortname || ''}`, tag: `att-${item.id}` });
      }
    }
    await dbSet(db, 'att-ids', attEvents.map(e => e.id));
  } catch (e) { console.warn('[SW] checkNewAttendance:', e.message); }
}

// ─── 3. Deadline countdown (7h → 3h → 1h → hari ini) ────────
// Kirim notifikasi saat deadline semakin dekat, tidak spam.

async function checkDeadlineAlerts(db, pending) {
  try {
    const res  = await fetch('/api/moodle/deadlines?limitnum=100');
    const data = await res.json();
    if (!data?.events) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const alerts = await dbGet(db, 'dl-alerts') || {};
    let dirty = false;

    // Level: 0=hari ini, 1=besok, 2=3 hari, 3=7 hari (makin kecil = makin urgent)
    const levelFor = (days) => {
      if (days < 0)  return null; // sudah lewat
      if (days === 0) return 0;
      if (days <= 1)  return 1;
      if (days <= 3)  return 2;
      if (days <= 7)  return 3;
      return null; // terlalu jauh
    };

    for (const e of data.events) {
      if (!e.timesort || isAttendanceEvent(e)) continue;
      const days  = Math.ceil((e.timesort - nowSec) / 86400);
      const level = levelFor(days);
      if (level === null) continue;

      const prevLevel = alerts[e.id] ?? 99; // 99 = belum pernah notif
      if (level < prevLevel) {
        const emoji = ['🔴', '🟠', '🟡', '🔵'][level];
        const when  = level === 0 ? 'HARI INI!' : level === 1 ? 'besok' : `${days} hari lagi`;
        const course = e.course?.shortname || e.course?.fullname || '';
        pending.push({
          title: `${emoji} Deadline ${when}`,
          body: `${e.name}${course ? ' — ' + course : ''}`,
          tag: `dl-${e.id}-${level}`,
          sticky: level <= 1, // hari ini & besok require interaction
        });
        alerts[e.id] = level;
        dirty = true;
      }
    }

    if (dirty) await dbSet(db, 'dl-alerts', alerts);
  } catch (e) { console.warn('[SW] checkDeadlineAlerts:', e.message); }
}

// ─── 4. Nilai berubah ─────────────────────────────────────────

async function checkGradeChanges(db, pending) {
  try {
    const res  = await fetch('/api/moodle/grades-overview');
    const data = await res.json();
    // Response: array of { courseid, coursefullname, grade, ... }
    const grades = Array.isArray(data) ? data : (data?.grades || []);
    if (!grades.length) return;

    const stored = await dbGet(db, 'grade-overview') || {};
    const updated = {};

    for (const g of grades) {
      const key = String(g.courseid);
      updated[key] = g.grade;
      if (stored[key] != null && stored[key] !== g.grade && g.grade && g.grade !== '-') {
        pending.push({
          title: '📊 Nilai Diperbarui!',
          body: `${g.coursefullname || g.courseshortname}: ${stored[key]} → ${g.grade}`,
          tag: `grade-${g.courseid}`,
        });
      }
    }

    await dbSet(db, 'grade-overview', updated);
  } catch (e) { console.warn('[SW] checkGradeChanges:', e.message); }
}

// ─── 5. Morning briefing jam 7-9 (Sen-Jum) ───────────────────

async function checkMorningBriefing(db, pending) {
  try {
    const now = new Date();
    const day  = now.getDay();
    const hour = now.getHours();

    // Hanya Sen-Jum, jam 7-9
    if (day === 0 || day === 6 || hour < 7 || hour >= 9) return;

    const today       = now.toISOString().split('T')[0];
    const lastBriefing = await dbGet(db, 'last-briefing');
    if (lastBriefing === today) return; // sudah kirim hari ini

    const nowSec  = Math.floor(Date.now() / 1000);
    const weekSec = nowSec + 7 * 86400;

    const [dlRes, asgRes] = await Promise.all([
      fetch('/api/moodle/deadlines?limitnum=50'),
      fetch('/api/moodle/assignments'),
    ]);
    const dlData  = await dlRes.json();
    const asgData = await asgRes.json();

    const weekDeadlines = (dlData?.events || []).filter(e => e.timesort > nowSec && e.timesort <= weekSec && !isAttendanceEvent(e)).length;
    const todayDeadlines = (dlData?.events || []).filter(e => {
      const days = Math.ceil((e.timesort - nowSec) / 86400);
      return days === 0 && !isAttendanceEvent(e);
    }).length;

    let pendingTasks = 0;
    for (const c of asgData?.courses || [])
      for (const a of c.assignments || [])
        if (a.duedate > nowSec) pendingTasks++;

    const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    let body = '';
    if (todayDeadlines > 0) {
      body = `⚠️ ${todayDeadlines} deadline HARI INI! `;
    }
    if (weekDeadlines > 0 || pendingTasks > 0) {
      const parts = [];
      if (weekDeadlines > 0) parts.push(`${weekDeadlines} deadline minggu ini`);
      if (pendingTasks > 0)  parts.push(`${pendingTasks} tugas aktif`);
      body += parts.join(', ') + '.';
    } else {
      body = 'Tidak ada deadline minggu ini. Semangat! 💪';
    }

    pending.push({
      title: `☀️ Selamat pagi! Hari ${DAYS[day]}`,
      body,
      tag: `briefing-${today}`,
      sticky: todayDeadlines > 0,
    });

    await dbSet(db, 'last-briefing', today);
  } catch (e) { console.warn('[SW] checkMorningBriefing:', e.message); }
}

// ─── Orkestrasi semua cek ────────────────────────────────────

async function checkAndNotify() {
  let db;
  try { db = await openDB(); } catch (e) {
    console.warn('[SW] openDB failed:', e);
    return 0;
  }

  const pending = [];

  await Promise.all([
    checkNewAssignments(db, pending),
    checkNewAttendance(db, pending),
    checkDeadlineAlerts(db, pending),
    checkGradeChanges(db, pending),
    checkMorningBriefing(db, pending),
  ]);

  for (const n of pending) {
    const { title, body, tag, sticky, ...rest } = n;
    notify(title, body, tag, { sticky, ...rest });
  }

  return pending.length;
}

// ─── Auto-absen ───────────────────────────────────────────────

async function runAutoAttend() {
  if (!isClassHour()) return 0;
  try {
    const res  = await fetch('/api/moodle/auto-attend', { method: 'POST' });
    const data = await res.json();
    if (data.attended?.length > 0) {
      for (const a of data.attended) {
        notify('✅ Auto-Absen Berhasil!', `${a.name} — ${a.course}`, `auto-att-${a.name}`, { sticky: false });
      }
      const allClients = await clients.matchAll({ type: 'window' });
      for (const c of allClients) c.postMessage({ type: 'AUTO_ATTENDED', attended: data.attended });
    }
    return data.attended?.length ?? 0;
  } catch (e) {
    console.warn('[SW] runAutoAttend:', e.message);
    return 0;
  }
}

// ─── Periodic Background Sync ─────────────────────────────────

self.addEventListener('periodicsync', event => {
  if (event.tag === 'akademi-sync')   event.waitUntil(checkAndNotify());
  if (event.tag === 'akademi-attend') event.waitUntil(runAutoAttend());
});

// ─── Pesan dari main thread ───────────────────────────────────

self.addEventListener('message', event => {
  const port = event.ports?.[0];

  if (event.data?.type === 'CHECK_NEW') {
    checkAndNotify().then(count => port?.postMessage({ type: 'CHECK_RESULT', count }));
  }

  if (event.data?.type === 'AUTO_ATTEND') {
    runAutoAttend().then(count => port?.postMessage({ type: 'AUTO_ATTEND_RESULT', count }));
  }

  if (event.data?.type === 'SEED_IDS') {
    openDB().then(db => {
      const { assignments, attendance } = event.data;
      if (assignments?.length) dbSet(db, 'asg-ids', assignments);
      if (attendance?.length)  dbSet(db, 'att-ids',  attendance);
    }).catch(e => console.warn('[SW] SEED_IDS:', e.message));
  }
});

// ─── Klik notifikasi → buka/fokus app ────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
