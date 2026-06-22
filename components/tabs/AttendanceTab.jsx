import { useState, useEffect } from "react";
import { uid, cx } from "../../lib/helpers";

const INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30];

// ─── Attendance card dari Moodle ──────────────────────────────

function MoodleAttendanceCard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch('/api/moodle/attendance-summary')
      .then(r => r.json())
      .then(d => { setData(d.summary || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="card moodle-att-card">
      <h3 className="card-title">📋 Kehadiran Resmi Moodle</h3>
      <div className="moodle-att-loading">
        <span className="moodle-att-spinner" />
        <span>Mengambil data dari Moodle…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="card moodle-att-card">
      <h3 className="card-title">📋 Kehadiran Resmi Moodle</h3>
      <p className="moodle-att-error">⚠️ {error}</p>
    </div>
  );

  if (!data?.length) return (
    <div className="card moodle-att-card">
      <h3 className="card-title">📋 Kehadiran Resmi Moodle</h3>
      <p className="empty">Tidak ada data kehadiran ditemukan</p>
    </div>
  );

  const below75 = data.filter(d => d.percentage != null && d.percentage < 75);

  return (
    <div className="card moodle-att-card">
      <div className="moodle-att-header">
        <h3 className="card-title" style={{ margin: 0 }}>📋 Kehadiran Resmi Moodle</h3>
        {below75.length > 0 && (
          <span className="moodle-att-warn-badge">⚠️ {below75.length} matkul di bawah 75%</span>
        )}
      </div>

      <div className="moodle-att-list">
        {data.map((item, i) => {
          const pct   = item.percentage;
          const color = pct == null ? 'var(--t3)' : pct >= 80 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444';
          return (
            <div key={i} className="moodle-att-row">
              <div className="moodle-att-meta">
                <span className="moodle-att-course">{item.course}</span>
                <span className="moodle-att-activity">{item.activity}</span>
              </div>
              <div className="moodle-att-right">
                <span className="moodle-att-pct" style={{ color }}>
                  {item.label}
                </span>
                {item.totalSessions > 0 && (
                  <span className="moodle-att-sessions">{item.totalSessions} sesi</span>
                )}
              </div>
              {pct != null && (
                <div className="moodle-att-bar-wrap">
                  <div
                    className="moodle-att-bar-fill"
                    style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                  />
                  {pct < 75 && (
                    <div className="moodle-att-threshold" style={{ left: '75%' }} />
                  )}
                </div>
              )}
              {item.error && <div className="moodle-att-err-note">⚠️ {item.error}</div>}
              {pct != null && pct < 75 && (
                <div className="moodle-att-danger">
                  ⛔ Di bawah batas minimum — butuh {Math.ceil((0.75 * (item.totalSessions || 1) - (item.presentCount || 0)))} sesi hadir lagi
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="moodle-att-note">Data diperbarui otomatis dari Moodle. Cache 5 menit.</p>
    </div>
  );
}

// ─── Telegram setup card ──────────────────────────────────────

function TelegramCard() {
  const [status,   setStatus]   = useState(null); // null=loading, {configured}
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState(null);
  const [token,    setToken]    = useState('');
  const [chatId,   setChatId]   = useState('');
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    // Cek apakah env vars sudah dikonfigurasi
    fetch('/api/notify/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => setStatus({ configured: false }));

    // Load dari localStorage (jika user sudah input manual)
    try {
      const t = localStorage.getItem('tg-token');
      const c = localStorage.getItem('tg-chatid');
      if (t) setToken(t);
      if (c) setChatId(c);
    } catch {}
  }, []);

  const saveLocal = () => {
    try {
      localStorage.setItem('tg-token',  token);
      localStorage.setItem('tg-chatid', chatId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const sendTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const body = { message: '🎓 <b>AkademiAI</b> — Test notifikasi berhasil! Auto-absen aktif.' };
      // Tambahkan kredensial dari localStorage jika env vars tidak terkonfigurasi
      if (!status?.configured) {
        const t = localStorage.getItem('tg-token');
        const c = localStorage.getItem('tg-chatid');
        if (t) body.token  = t;
        if (c) body.chatId = c;
      }
      const res  = await fetch('/api/notify/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestMsg(data.ok ? '✅ Pesan terkirim!' : `❌ ${data.error}`);
    } catch (e) {
      setTestMsg(`❌ ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const configured = status?.configured || (token && chatId);

  return (
    <div className="card tg-card">
      <div className="tg-header">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>
            📱 Notifikasi Telegram
          </h3>
          <p className="tg-sub">Dapat notif WhatsApp/Telegram saat berhasil absen</p>
        </div>
        <span className={cx("tg-badge", status?.configured ? "tg-badge-ok" : "tg-badge-off")}>
          {status === null ? '…' : status.configured ? '🟢 Aktif' : '⚫ Belum diatur'}
        </span>
      </div>

      {status?.configured ? (
        // Sudah dikonfigurasi via env vars
        <div className="tg-configured">
          <p className="tg-ok-note">
            Bot Telegram sudah terhubung via environment variables. Notifikasi akan dikirim otomatis setiap kali absen berhasil.
          </p>
          <button className="tg-test-btn" onClick={sendTest} disabled={testing}>
            {testing ? 'Mengirim…' : '📤 Kirim Pesan Test'}
          </button>
          {testMsg && <p className="tg-test-result">{testMsg}</p>}
        </div>
      ) : (
        // Belum dikonfigurasi — tampilkan panduan setup
        <div className="tg-setup">
          <div className="tg-steps">
            <div className="tg-step">
              <span className="tg-step-num">1</span>
              <div>
                <strong>Buat bot Telegram</strong>
                <span className="tg-step-sub">Buka @BotFather di Telegram → /newbot → ikuti langkahnya → salin <code>token</code></span>
              </div>
            </div>
            <div className="tg-step">
              <span className="tg-step-num">2</span>
              <div>
                <strong>Dapatkan Chat ID kamu</strong>
                <span className="tg-step-sub">Kirim pesan ke bot tersebut, lalu buka:<br /><code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code><br />Salin nilai <code>message.chat.id</code></span>
              </div>
            </div>
            <div className="tg-step">
              <span className="tg-step-num">3</span>
              <div>
                <strong>Tambahkan ke Vercel</strong>
                <span className="tg-step-sub">Settings → Environment Variables → tambahkan:<br /><code>TELEGRAM_BOT_TOKEN</code> dan <code>TELEGRAM_CHAT_ID</code></span>
              </div>
            </div>
          </div>

          <div className="tg-divider">atau coba dulu dengan input di bawah:</div>

          <div className="tg-inputs">
            <input
              className="tg-input"
              placeholder="Bot Token (1234567890:ABC...)"
              value={token}
              onChange={e => setToken(e.target.value)}
            />
            <input
              className="tg-input"
              placeholder="Chat ID (misal: 123456789)"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
            />
            <div className="tg-input-btns">
              <button className="tg-save-btn" onClick={saveLocal} disabled={!token || !chatId}>
                {saved ? '✓ Tersimpan' : 'Simpan Lokal'}
              </button>
              <button className="tg-test-btn" onClick={sendTest} disabled={testing || (!token || !chatId)}>
                {testing ? 'Mengirim…' : '📤 Test Kirim'}
              </button>
            </div>
          </div>
          {testMsg && <p className="tg-test-result">{testMsg}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main AttendanceTab ───────────────────────────────────────

export default function AttendanceTab({ courses, attendance, setAttendance, autoAttendLog, lastAttendCheck, attendInterval, setAttendInterval }) {
  const [testing, setTesting]   = useState(false);
  const [testResult, setResult] = useState(null);
  const [now, setNow]           = useState(new Date());
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours(), d = now.getDay();
  const isClassHour = d >= 1 && d <= 6 && h >= 6 && h < 22;

  const secSinceLast = lastAttendCheck ? Math.floor((now - lastAttendCheck) / 1000) : null;
  const secUntilNext = lastAttendCheck ? Math.max(0, (attendInterval * 60) - secSinceLast) : null;

  const fmtCountdown = (sec) => {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const addAtt = (course, present) => {
    const alreadyToday = attendance.some(a => a.course === course && a.date.startsWith(today));
    if (alreadyToday && !confirm(`Sudah ada absensi ${course} hari ini. Tetap tambahkan?`)) return;
    setAttendance(p => [...p, { id: uid(), course, present, date: new Date().toISOString() }]);
  };

  const runManual = async () => {
    setTesting(true); setResult(null);
    try {
      const res  = await fetch('/api/moodle/auto-attend?debug=1', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Absensi ✅</h1>
        <p className="view-sub">Auto-absen dicek tiap {attendInterval} menit saat jam kuliah</p>
      </div>

      {/* ── Status auto-absen ─────────────────────────────────── */}
      <div className="card att-auto-card">
        <div className="att-auto-header">
          <div className="att-auto-status">
            <span className={cx("att-pulse", isClassHour ? "att-pulse-on" : "att-pulse-off")} />
            <div>
              <div className="att-auto-label">
                {isClassHour ? "🤖 Auto-absen Aktif" : "🌙 Di luar jam kuliah"}
              </div>
              <div className="att-auto-sub">
                {isClassHour
                  ? `Absensi otomatis dicek tiap ${attendInterval} menit`
                  : "Akan aktif kembali Sen–Sab pukul 06:00"}
              </div>
            </div>
          </div>
          <button
            className={cx("att-manual-btn", testing && "disabled")}
            onClick={runManual}
            disabled={testing}
            title="Jalankan pemeriksaan sekarang"
          >
            {testing ? "⟳" : "▶"}
          </button>
        </div>

        {/* Pengaturan interval */}
        <div className="att-interval-row">
          <span className="att-interval-label">Interval cek:</span>
          <div className="att-interval-btns">
            {INTERVAL_OPTIONS.map(m => (
              <button
                key={m}
                className={`att-interval-btn${attendInterval === m ? " active" : ""}`}
                onClick={() => setAttendInterval(m)}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        {/* Countdown panel */}
        {isClassHour && (
          <div className="att-countdown-row">
            <div className="att-countdown-cell">
              <span className="att-countdown-val">
                {secSinceLast != null ? fmtCountdown(secSinceLast) + " lalu" : "—"}
              </span>
              <span className="att-countdown-lbl">Terakhir dicek</span>
            </div>
            <div className="att-countdown-sep" />
            <div className="att-countdown-cell">
              <span className="att-countdown-val" style={{ color: secUntilNext === 0 ? "var(--green)" : undefined }}>
                {secUntilNext != null ? fmtCountdown(secUntilNext) : "—"}
              </span>
              <span className="att-countdown-lbl">Cek berikutnya</span>
            </div>
            <div className="att-countdown-sep" />
            <div className="att-countdown-cell">
              <span className="att-countdown-val">{autoAttendLog.length}</span>
              <span className="att-countdown-lbl">Hadir hari ini</span>
            </div>
          </div>
        )}

        {/* Riwayat hadir otomatis */}
        {autoAttendLog.length > 0 && (
          <div className="att-log" style={{ marginTop: 12 }}>
            {autoAttendLog.slice(0, 5).map((a, i) => (
              <div key={i} className="att-log-row">
                <span className="att-log-dot" style={{ background: "#10b981" }} />
                <span className="att-log-text">✓ {a.name} — {a.course}</span>
                <span className="att-log-time">
                  {new Date(a.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}

        {autoAttendLog.length === 0 && isClassHour && (
          <p className="att-empty-note">Belum ada absensi otomatis — sedang memantau sesi yang tersedia</p>
        )}

        {/* Hasil manual test */}
        {testResult && (
          <div className="att-result">
            {testResult.error ? (
              <div className="att-result-err">❌ {testResult.error}</div>
            ) : (
              <>
                <div className="att-result-stats">
                  <span className="att-stat att-stat-ok">✓ Hadir: {testResult.attended?.length ?? 0}</span>
                  <span className="att-stat att-stat-skip">— Tidak ada sesi: {testResult.skipped ?? 0}</span>
                  <span className="att-stat att-stat-done">✓ Sudah: {testResult.alreadyDone ?? 0}</span>
                  {(testResult.failed?.length > 0) && (
                    <span className="att-stat att-stat-fail">✗ Gagal: {testResult.failed.length}</span>
                  )}
                  <span className="att-stat att-stat-time">{testResult.ms}ms</span>
                </div>
                {testResult.attended?.map((a, i) => (
                  <div key={i} className="att-log-row">
                    <span className="att-log-dot" style={{ background: "#10b981" }} />
                    <span className="att-log-text">✓ {a.name} — {a.course}</span>
                  </div>
                ))}
                {testResult.failed?.map((a, i) => (
                  <div key={i} className="att-log-row">
                    <span className="att-log-dot" style={{ background: "#ef4444" }} />
                    <span className="att-log-text">✗ {a.name} — {a.reason}</span>
                  </div>
                ))}
                {testResult.log && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Log detail</summary>
                    <pre className="att-debug-log">{testResult.log.join('\n')}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Data kehadiran resmi Moodle ───────────────────────── */}
      <MoodleAttendanceCard />

      {/* ── Telegram notification setup ──────────────────────── */}
      <TelegramCard />

      {/* ── Input manual ───────────────────────────────────── */}
      {courses.length > 0 && (
        <div className="card">
          <h3 className="card-title">📝 Catat Manual</h3>
          <div className="att-grid">
            {courses.map(c => (
              <div key={c.id} className="att-card">
                <div className="att-name">{c.shortname || c.fullname}</div>
                <div className="att-btns">
                  <button className="att-btn att-yes" onClick={() => addAtt(c.shortname || c.fullname, true)}>✓ Hadir</button>
                  <button className="att-btn att-no"  onClick={() => addAtt(c.shortname || c.fullname, false)}>✗ Absen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        /* ─── Auto absen card ─────────────────────────────── */
        .att-auto-card { padding: 18px 20px; }
        .att-auto-header { display: flex; align-items: center; justify-content: space-between; }
        .att-auto-status { display: flex; align-items: center; gap: 12px; }
        .att-pulse { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .att-pulse-on  { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.2); animation: pulse 2s infinite; }
        .att-pulse-off { background: var(--t3); }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(16,185,129,.2); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,.05); } }
        .att-auto-label { font-size: 14px; font-weight: 600; color: var(--t1); }
        .att-auto-sub   { font-size: 11px; color: var(--t3); margin-top: 2px; }
        .att-interval-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
        .att-interval-label { font-size: 12px; color: var(--t3); white-space: nowrap; }
        .att-interval-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .att-interval-btn {
          padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--bd); background: var(--bg3); color: var(--t2); cursor: pointer;
        }
        .att-interval-btn:hover { border-color: var(--accent); color: var(--t1); }
        .att-interval-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .att-manual-btn {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1px solid var(--bd); background: var(--bg3);
          color: var(--t3); font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .att-manual-btn:hover { color: var(--t1); border-color: var(--accent); }
        .att-manual-btn.disabled { opacity: .5; cursor: not-allowed; }
        .att-countdown-row {
          display: flex; align-items: stretch; margin-top: 16px;
          border: 1px solid var(--bd); border-radius: 10px; overflow: hidden;
        }
        .att-countdown-cell {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          padding: 10px 8px; gap: 3px;
        }
        .att-countdown-sep { width: 1px; background: var(--bd); }
        .att-countdown-val { font-size: 15px; font-weight: 700; color: var(--t1); font-variant-numeric: tabular-nums; }
        .att-countdown-lbl { font-size: 10px; color: var(--t3); text-align: center; }
        .att-empty-note { font-size: 12px; color: var(--t3); margin: 12px 0 0; }
        .att-log { display: flex; flex-direction: column; gap: 6px; }
        .att-log-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
        .att-log-dot  { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .att-log-text { flex: 1; color: var(--t2); }
        .att-log-time { color: var(--t3); white-space: nowrap; }
        .att-result { margin-top: 12px; border-top: 1px solid var(--bd); padding-top: 12px; }
        .att-result-err { color: #fca5a5; font-size: 13px; }
        .att-result-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .att-stat { font-size: 11px; padding: 3px 8px; border-radius: 99px; }
        .att-stat-ok   { background: rgba(16,185,129,.12); color: #10b981; }
        .att-stat-skip { background: rgba(100,116,139,.12); color: var(--t3); }
        .att-stat-done { background: rgba(59,130,246,.12); color: #60a5fa; }
        .att-stat-fail { background: rgba(239,68,68,.12); color: #fca5a5; }
        .att-stat-time { background: var(--bg3); color: var(--t3); }
        .att-debug-log {
          font-size: 10px; color: var(--t3); background: var(--bg1);
          border: 1px solid var(--bd); border-radius: 6px;
          padding: 10px 12px; margin-top: 6px;
          white-space: pre-wrap; word-break: break-all;
          max-height: 240px; overflow-y: auto;
        }

        /* ─── Moodle attendance card ──────────────────────── */
        .moodle-att-card { padding: 18px 20px; }
        .moodle-att-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .moodle-att-warn-badge {
          font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px;
          background: rgba(239,68,68,.12); color: #fca5a5;
        }
        .moodle-att-loading {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; color: var(--t3); padding: 12px 0;
        }
        .moodle-att-spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid var(--bd); border-top-color: var(--accent);
          animation: spin 0.8s linear infinite; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .moodle-att-error { font-size: 13px; color: #fca5a5; }
        .moodle-att-list { display: flex; flex-direction: column; gap: 12px; }
        .moodle-att-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
        .moodle-att-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .moodle-att-course { font-size: 13px; font-weight: 600; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .moodle-att-activity { font-size: 11px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .moodle-att-right { display: flex; align-items: baseline; gap: 6px; flex-shrink: 0; }
        .moodle-att-pct { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .moodle-att-sessions { font-size: 11px; color: var(--t3); }
        .moodle-att-bar-wrap {
          width: 100%; height: 5px; background: var(--bg3); border-radius: 99px;
          position: relative; overflow: hidden;
        }
        .moodle-att-bar-fill { height: 100%; border-radius: 99px; transition: width .4s ease; }
        .moodle-att-threshold {
          position: absolute; top: 0; bottom: 0; width: 2px;
          background: rgba(239,68,68,.5);
        }
        .moodle-att-danger { font-size: 11px; color: #fca5a5; width: 100%; margin-top: 2px; }
        .moodle-att-err-note { font-size: 11px; color: var(--t3); width: 100%; }
        .moodle-att-note { font-size: 11px; color: var(--t3); margin-top: 14px; margin-bottom: 0; }

        /* ─── Telegram card ───────────────────────────────── */
        .tg-card { padding: 18px 20px; }
        .tg-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .tg-sub { font-size: 12px; color: var(--t3); margin: 3px 0 0; }
        .tg-badge {
          font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px;
          white-space: nowrap; flex-shrink: 0;
        }
        .tg-badge-ok  { background: rgba(16,185,129,.12); color: #10b981; }
        .tg-badge-off { background: var(--bg3); color: var(--t3); }
        .tg-configured { display: flex; flex-direction: column; gap: 10px; }
        .tg-ok-note { font-size: 13px; color: var(--t2); margin: 0; }
        .tg-test-btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
          border: 1px solid var(--accent); background: rgba(59,130,246,.08);
          color: var(--accent); cursor: pointer; align-self: flex-start;
        }
        .tg-test-btn:hover { background: rgba(59,130,246,.16); }
        .tg-test-btn:disabled { opacity: .5; cursor: not-allowed; }
        .tg-test-result { font-size: 13px; color: var(--t2); margin: 4px 0 0; }
        .tg-setup { display: flex; flex-direction: column; gap: 12px; }
        .tg-steps { display: flex; flex-direction: column; gap: 10px; }
        .tg-step { display: flex; gap: 12px; align-items: flex-start; }
        .tg-step-num {
          width: 22px; height: 22px; border-radius: 50%; background: var(--accent);
          color: #fff; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .tg-step strong { font-size: 13px; color: var(--t1); display: block; margin-bottom: 2px; }
        .tg-step-sub { font-size: 11px; color: var(--t3); line-height: 1.6; }
        .tg-step-sub code { font-family: monospace; background: var(--bg3); padding: 1px 4px; border-radius: 4px; font-size: 10px; }
        .tg-divider { font-size: 11px; color: var(--t3); text-align: center; position: relative; }
        .tg-divider::before, .tg-divider::after {
          content: ''; position: absolute; top: 50%; width: 38%; height: 1px; background: var(--bd);
        }
        .tg-divider::before { left: 0; }
        .tg-divider::after  { right: 0; }
        .tg-inputs { display: flex; flex-direction: column; gap: 8px; }
        .tg-input {
          width: 100%; padding: 9px 12px; border-radius: 8px;
          border: 1px solid var(--bd); background: var(--bg3);
          color: var(--t1); font-size: 13px; box-sizing: border-box;
          outline: none;
        }
        .tg-input:focus { border-color: var(--accent); }
        .tg-input-btns { display: flex; gap: 8px; }
        .tg-save-btn {
          padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--bd); background: var(--bg3);
          color: var(--t2); cursor: pointer;
        }
        .tg-save-btn:disabled { opacity: .4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
