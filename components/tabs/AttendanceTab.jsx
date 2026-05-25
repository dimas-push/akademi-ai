import { uid } from "../../lib/helpers";

export default function AttendanceTab({ courses, attendance, setAttendance }) {
  const today = new Date().toISOString().split("T")[0];

  const addAtt = (course, present) => {
    const alreadyToday = attendance.some(a => a.course === course && a.date.startsWith(today));
    if (alreadyToday && !confirm(`Kamu sudah input absensi untuk ${course} hari ini. Tetap tambahkan?`)) return;
    setAttendance(p => [...p, { id: uid(), course, present, date: new Date().toISOString() }]);
  };

  const courseSummary = courses.map(c => {
    const name = c.shortname || c.fullname;
    const recs = attendance.filter(a => a.course === name);
    const p = recs.filter(a => a.present).length;
    const t = recs.length;
    return { ...c, name, present: p, total: t, rate: t > 0 ? Math.round(p / t * 100) : 0 };
  });

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Absensi ✅</h1>
        <p className="view-sub">Input manual (plugin absensi tidak tersedia via API)</p>
      </div>
      {courses.length > 0 && (
        <div className="card">
          <h3 className="card-title">⏰ Catat Kehadiran Hari Ini</h3>
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
      <div className="card">
        <h3 className="card-title">📊 Ringkasan per Matkul</h3>
        {courseSummary.map(c => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{c.name}</span>
              <span style={{ color: c.rate >= 80 ? "#22c55e" : c.rate >= 60 ? "#f59e0b" : "#ef4444", fontWeight: 700, fontSize: 13 }}>
                {c.rate}% ({c.present}/{c.total})
              </span>
            </div>
            <div className="prog-bar">
              <div className="prog-fill" style={{ width: c.rate + "%", background: c.rate >= 80 ? "#22c55e" : c.rate >= 60 ? "#f59e0b" : "#ef4444" }} />
            </div>
            {c.rate < 75 && c.total > 0 && (
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>⚠️ Di bawah batas minimum 75%!</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
