// ─── Service Worker Registration ──────────────────────────────

export async function registerSW() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.warn('[AkademiAI] SW register failed:', err.message);
    return null;
  }
}

// ─── Request Notification Permission ──────────────────────────

export async function requestPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── Setup Periodic Background Sync ───────────────────────────
// Hanya Chrome yang support; browser lain akan skip tanpa error

export async function setupPeriodicSync(reg) {
  if (!reg) return;
  try {
    if (!('periodicSync' in reg)) return;
    const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (perm.state !== 'granted') return;
    await reg.periodicSync.register('akademi-sync',   { minInterval: 15 * 60 * 1000 });
    await reg.periodicSync.register('akademi-attend', { minInterval: 5 * 60 * 1000 });
  } catch {}
}

// ─── Trigger auto-attend via SW ───────────────────────────────

export function triggerAutoAttend() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(0);
  return new Promise(resolve => {
    navigator.serviceWorker.ready.then(reg => {
      if (!reg.active) return resolve(0);
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = e => resolve(e.data?.count ?? 0);
      reg.active.postMessage({ type: 'AUTO_ATTEND' }, [port2]);
      setTimeout(() => resolve(0), 15000);
    });
  });
}

// ─── Seed IDs ke SW (setelah sync pertama) ────────────────────

export function seedSWIds(assignments = [], attendance = []) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({
      type: 'SEED_IDS',
      assignments,
      attendance,
    });
  });
}

// ─── Trigger cek manual dari SW ───────────────────────────────
// Mengirim MessageChannel agar SW bisa balas dengan hasilnya

export function triggerSWCheck() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(0);
  return new Promise(resolve => {
    navigator.serviceWorker.ready.then(reg => {
      if (!reg.active) return resolve(0);
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = e => resolve(e.data?.count ?? 0);
      reg.active.postMessage({ type: 'CHECK_NEW' }, [port2]);
      setTimeout(() => resolve(0), 5000); // timeout fallback
    });
  });
}

// ─── Deteksi item baru di main thread (localStorage) ──────────
// Dipakai untuk in-app toast; SW pakai IndexedDB sendiri

const LS_KEY_ASG = 'akademi-seen-asg';
const LS_KEY_ATT = 'akademi-seen-att';

function readSeenIds(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

function writeSeenIds(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch {}
}

export function detectNewItems(assignments = [], deadlines = []) {
  const toasts = [];

  // Tugas baru
  const seenAsg = readSeenIds(LS_KEY_ASG);
  const isFirstRunAsg = seenAsg.length === 0;
  const newAsg = isFirstRunAsg ? [] : assignments.filter(a => !seenAsg.includes(a.id));
  writeSeenIds(LS_KEY_ASG, assignments.map(a => a.id));

  for (const a of newAsg.slice(0, 3)) {
    toasts.push({ id: `asg-${a.id}`, title: '📝 Tugas Baru!', body: `${a.name} — ${a.course}`, type: 'assignment' });
  }

  // Absensi baru
  const attEvents = deadlines.filter(e => {
    const n = (e.name || '').toLowerCase();
    return e.type === 'attendance' || n.includes('presensi') || n.includes('attendance') || n.includes('kehadiran');
  });
  const seenAtt = readSeenIds(LS_KEY_ATT);
  const isFirstRunAtt = seenAtt.length === 0;
  const newAtt = isFirstRunAtt ? [] : attEvents.filter(e => !seenAtt.includes(e.id));
  writeSeenIds(LS_KEY_ATT, attEvents.map(e => e.id));

  for (const e of newAtt.slice(0, 3)) {
    toasts.push({ id: `att-${e.id}`, title: '✅ Absensi Tersedia!', body: `${e.name} — ${e.course}`, type: 'attendance' });
  }

  return toasts;
}
