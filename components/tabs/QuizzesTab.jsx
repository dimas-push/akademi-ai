import { fmtFull, daysUntil, cx } from "../../lib/helpers";

export default function QuizzesTab({ quizzes }) {
  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Quiz & Ujian 📋</h1>
        <p className="view-sub">{quizzes.length} quiz terdaftar</p>
      </div>
      <div className="list-cards">
        {quizzes.map(q => (
          <div key={q.id} className="task-card">
            <div className="dl-type t-quiz">📋</div>
            <div className="tc-body">
              <div className="tc-title">{q.name}</div>
              <div className="tc-meta">
                {q.timeopen  && <span>🟢 Buka: {fmtFull(q.timeopen)}</span>}
                {q.timeclose && <span>🔴 Tutup: {fmtFull(q.timeclose)}</span>}
                {q.timelimit > 0 && <span>⏱ {Math.round(q.timelimit / 60)} menit</span>}
              </div>
            </div>
            {q.timeclose && (
              <div className={cx("days-tag", daysUntil(q.timeclose) < 0 && "dt-late")}>
                {daysUntil(q.timeclose) < 0 ? "Selesai" : daysUntil(q.timeclose) + "h"}
              </div>
            )}
          </div>
        ))}
        {quizzes.length === 0 && <p className="empty">Tidak ada quiz</p>}
      </div>
    </div>
  );
}
