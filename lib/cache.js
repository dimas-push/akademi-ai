// ─── IndexedDB KV store (main thread only) ────────────────────
// Dipakai untuk cache dashboard agar instant load saat buka app.
// SW punya DB-nya sendiri di public/sw.js.

const DB_NAME = 'akademi-ui';
const DB_VER  = 1;
const STORE   = 'kv';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

// ─── Semua key yang dicache ───────────────────────────────────
const STATE_KEYS = ['courses', 'deadlines', 'assignments', 'quizzes', 'grades', 'notifications', 'announcements', 'lastSync'];

// ─── Simpan seluruh state dashboard dalam satu transaksi ──────
export async function saveState(state) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const str = tx.objectStore(STORE);
      for (const k of STATE_KEYS) {
        if (state[k] !== undefined) str.put(state[k], k);
      }
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[Cache] saveState error:', e.message);
  }
}

// ─── Muat seluruh state dalam satu transaksi ──────────────────
export async function loadState() {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDB();
    const result = {};
    await new Promise((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const str = tx.objectStore(STORE);
      let pending = STATE_KEYS.length;
      const done  = () => { if (--pending === 0) resolve(); };
      for (const k of STATE_KEYS) {
        const req = str.get(k);
        req.onsuccess = () => { result[k] = req.result ?? null; done(); };
        req.onerror   = done;
      }
    });
    return result;
  } catch (e) {
    console.warn('[Cache] loadState error:', e.message);
    return null;
  }
}
