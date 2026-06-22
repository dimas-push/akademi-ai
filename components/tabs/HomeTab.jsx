import { useState, useEffect } from "react";
import { fmtDate, fmtFull, daysUntil, cx, STUDENT_NAME, DAYS_SHORT } from "../../lib/helpers";

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function Countdown({ deadline }) {
  const now    = useNow();
  const secLeft = Math.max(0, Math.floor((new Date(deadline.date) - now) / 1000));
  const h = Math.floor(secLeft / 3600);
  const m = Math.floor((secLeft % 3600) / 60);
  const s = secLeft % 60;
  const pad = n => String(n).padStart(2, '0');
  const urgent = secLeft < 3600;

  return (
    <div className="countdown-card">
      <div className="countdown-label">⏱ Deadline terdekat</div>
      <div className="countdown-name">{deadline.name}</div>
      <div className="countdown-course">{deadline.course}</div>
      <div className={cx("countdown-timer", urgent && "countdown-urgent")}>
        <span className="ct-block"><span className="ct-val">{pad(h)}</span><span className="ct-lbl">jam</span></span>
        <span className="ct-sep">:</span>
        <span className="ct-block"><span className="ct-val">{pad(m)}</span><span className="ct-lbl">menit</span></span>
        <span className="ct-sep">:</span>
        <span className="ct-block"><span className="ct-val">{pad(s)}</span><span className="ct-lbl">detik</span></span>
      </div>
    </div>
  );
}

export default function HomeTab({ courses, deadlines, urgent, overdue, assignments, quizzes, notifications, announcements, unread, attRate, grades }) {
  const today    = new Date();
  const startDow = today.getDay();
  const heatmap  = Array.from({ length: 28 }, (_, i) => {
    const d  = new Date(today); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    const count = deadlines.filter(dl => dl.date && new Date(dl.date).toISOString().split("T")[0] === ds).length;
    return { date: ds, count, label: d.getDate() };
  });

  // Deadline dalam 24 jam untuk countdown
  const now = new Date();
  const within24h = deadlines.find(d => {
    if (!d.date) return false;
    const diff = new Date(d.date) - now;
    return diff > 0 && diff < 24 * 3600 * 1000;
  });

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Selamat datang, {STUDENT_NAME.split(" ")[0]}! 👋</h1>
        <p className="view-sub">UBP Karawang • {courses.length} Mata Kuliah • {fmtFull(new Date())}</p>
      </div>

      {(urgent.length > 0 || overdue.length > 0) && (
        <div className="alert-box">
          ⚠️ {overdue.length > 0 && <strong style={{ color: "#ef4444" }}>{overdue.length} deadline terlambat!</strong>}
          {overdue.length > 0 && urgent.length > 0 && " • "}
          {urgent.length > 0 && <strong style={{ color: "#f59e0b" }}>{urgent.length} deadline ≤3 hari</strong>}
        </div>
      )}

      {/* Countdown jika ada deadline dalam 24 jam */}
      {within24h && <Countdown deadline={within24h} />}

      <div className="stats-grid">
        {[
          { i: "📝", v: assignments.length, l: "Tugas", bg: "#1e3a5f" },
          { i: "✅", v: attRate + "%", l: "Kehadiran", bg: "#065f46" },
          { i: "📊", v: Object.keys(grades).length, l: "Matkul Dinilai", bg: "#3b1f6e" },
          { i: "🔔", v: unread, l: "Notif Baru", bg: "#78350f" },
        ].map((s, idx) => (
          <div key={idx} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}>{s.i}</div>
            <div className="stat-val">{s.v}</div>
            <div className="stat-lbl">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="card-title">📅 Deadline Heatmap (28 Hari)</h3>
        <div className="heatmap-wrap">
          <div className="heatmap-days">{DAYS_SHORT.map(d => <div key={d} className="hm-day-label">{d}</div>)}</div>
          <div className="heatmap">
            {Array.from({ length: startDow }).map((_, i) => <div key={"pad-" + i} className="hm-cell hm-pad" />)}
            {heatmap.map((h, i) => (
              <div key={i} className={cx("hm-cell", "hm-" + Math.min(h.count, 3))} title={`${fmtFull(h.date)}: ${h.count} deadline`}>
                <span>{h.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hm-legend">
          <span><span className="hm-dot hm-0" />0</span>
          <span><span className="hm-dot hm-1" />1</span>
          <span><span className="hm-dot hm-2" />2</span>
          <span><span className="hm-dot hm-3" />3+</span>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3 className="card-title">⚡ Deadline Terdekat</h3>
          {deadlines.slice(0, 6).map(d => (
            <div key={d.id} className="list-item">
              <div className={cx("dl-type", d.type === "assign" && "t-assign", d.type === "quiz" && "t-quiz")}>
                {d.type === "assign" ? "📝" : d.type === "quiz" ? "📋" : "📅"}
              </div>
              <div className="list-body">
                <div className="list-title">{d.name}</div>
                <div className="list-sub">{d.course} • {fmtFull(d.date)}</div>
              </div>
              <div className={cx("days-tag", daysUntil(d.date) < 0 && "dt-late", daysUntil(d.date) <= 3 && daysUntil(d.date) >= 0 && "dt-urgent")}>
                {daysUntil(d.date) < 0 ? "Terlambat" : daysUntil(d.date) === 0 ? "Hari ini!" : daysUntil(d.date) + "h"}
              </div>
            </div>
          ))}
          {deadlines.length === 0 && <p className="empty">Tidak ada deadline mendatang 🎉</p>}
        </div>
        <div className="card">
          <h3 className="card-title">📢 Pengumuman Terbaru</h3>
          {announcements.slice(0, 5).map(a => (
            <div key={a.id} className="list-item">
              <div className="ann-icon">📌</div>
              <div className="list-body">
                <div className="list-title">{a.name}</div>
                <div className="list-sub">{a.author} • {fmtDate(a.created)}</div>
              </div>
            </div>
          ))}
          {announcements.length === 0 && <p className="empty">Belum ada pengumuman</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">📚 Mata Kuliah Aktif ({courses.length})</h3>
        <div className="course-grid">
          {courses.map(c => (
            <div key={c.id} className="course-card">
              {c.courseimage && !c.courseimage.startsWith("data:image/svg") && (
                <div className="course-img" style={{ backgroundImage: `url(${c.courseimage})` }} />
              )}
              <div className="course-info">
                <div className="course-name">{c.shortname || c.fullname}</div>
                <div className="course-fullname">{c.fullname}</div>
                {c.hasprogress && (
                  <>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: c.progress + "%" }} /></div>
                    <div className="course-prog">{Math.round(c.progress)}% selesai</div>
                  </>
                )}
                {c.coursecategory && <div className="course-cat">{c.coursecategory}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
