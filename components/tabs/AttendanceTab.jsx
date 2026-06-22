import { useState, useEffect } from "react";
import { uid, cx } from "../../lib/helpers";

export default function AttendanceTab({ courses, attendance, setAttendance, autoAttendLog, lastAttendCheck }) {
  const [testing, setTesting]   = useState(false);
  const [testResult, setResult] = useState(null);
  const [now, setNow]           = useState(new Date());
  const today = new Date().toISOString().split("T")[0];

  // Tick setiap detik untuk countdown
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours(), d = now.getDay();
  const isClassHour = d >= 1 && d <= 6 && h >= 6 && h < 22;

  // Hitung detik sejak terakhir check & detik sampai check berikutnya
  const secSinceLast = lastAttendCheck ? Math.floor((now - lastAttendCheck) / 1000) : null;
  const secUntilNext = lastAttendCheck ? Math.max(0, 60 - secSinceLast) : null;

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

  const courseSummary = courses.map(c => {
    const name = c.shortname || c.fullname;
    const recs = attendance.filter(a => a.course === name);
    const p    = recs.filter(a => a.present).length;
    const t    = recs.length;
    return { ...c, name, present: p, total: t, rate: t > 0 ? Math.round(p / t * 100) : 0 };
  });

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Absensi ✅</h1>
        <p className="view-sub">Auto-absen dicek tiap 1 menit saat jam kuliah</p>
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
                  ? "Absensi otomatis dicek tiap 1 menit"
                  : "Akan aktif kembali Sen–Sab pukul 06:00"}
              </div>
            </div>
          </div>
          <button
            className={cx("att-manual-btn", testing && "disabled")}
            onClick={runManual}
            disabled={testing}
            title="Jalankan pemeriksaan sekarang (tidak perlu diklik)"
          >
            {testing ? "⟳" : "▶"}
          </button>
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
          <p className="att-empty-note">
            Belum ada absensi otomatis — sedang memantau sesi yang tersedia
          </p>
        )}

        {/* Hasil manual test (debug) */}
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

      {/* ── Ringkasan ──────────────────────────────────────── */}
      <div className="card">
        <h3 className="card-title">📊 Ringkasan per Matkul</h3>
        {courseSummary.length === 0 && <p className="empty">Belum ada data absensi manual</p>}
        {courseSummary.map(c => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "var(--t1)", fontSize: 13 }}>{c.name}</span>
              <span style={{ color: c.rate >= 80 ? "#22c55e" : c.rate >= 60 ? "#f59e0b" : "#ef4444", fontWeight: 700, fontSize: 13 }}>
                {c.total > 0 ? `${c.rate}% (${c.present}/${c.total})` : "—"}
              </span>
            </div>
            {c.total > 0 && (
              <>
                <div className="prog-bar">
                  <div className="prog-fill" style={{ width: c.rate + "%", background: c.rate >= 80 ? "#22c55e" : c.rate >= 60 ? "#f59e0b" : "#ef4444" }} />
                </div>
                {c.rate < 75 && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>⚠️ Di bawah batas minimum 75%!</div>}
              </>
            )}
          </div>
        ))}
      </div>

      <style jsx>{`
        .att-auto-card { padding: 18px 20px; }
        .att-auto-header { display: flex; align-items: center; justify-content: space-between; }
        .att-auto-status { display: flex; align-items: center; gap: 12px; }
        .att-pulse { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .att-pulse-on  { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.2); animation: pulse 2s infinite; }
        .att-pulse-off { background: var(--t3); }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(16,185,129,.2); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,.05); } }
        .att-auto-label { font-size: 14px; font-weight: 600; color: var(--t1); }
        .att-auto-sub   { font-size: 11px; color: var(--t3); margin-top: 2px; }
        .att-manual-btn {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1px solid var(--bd); background: var(--bg3);
          color: var(--t3); font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .att-manual-btn:hover { color: var(--t1); border-color: var(--accent); }
        .att-manual-btn.disabled { opacity: .5; cursor: not-allowed; }
        .att-countdown-row {
          display: flex; align-items: stretch; gap: 0;
          margin-top: 16px; border: 1px solid var(--bd); border-radius: 10px; overflow: hidden;
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
      `}</style>
    </div>
  );
}
