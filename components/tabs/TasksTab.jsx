import { fmtFull, daysUntil, cx } from "../../lib/helpers";

export default function TasksTab({ assignments }) {
  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Semua Tugas 📝</h1>
        <p className="view-sub">{assignments.length} tugas dari elearning</p>
      </div>
      <div className="list-cards">
        {assignments.map(a => (
          <div key={a.id} className="task-card">
            <div className="dl-type t-assign">📝</div>
            <div className="tc-body">
              <div className="tc-title">{a.name}</div>
              <div className="tc-meta">
                <span className="badge">{a.course}</span>
                <span>📅 Deadline: {fmtFull(a.duedate)}</span>
              </div>
              {a.intro && <div className="tc-desc">{a.intro}</div>}
            </div>
            {a.duedate && (
              <div className={cx("days-tag", daysUntil(a.duedate) < 0 && "dt-late", daysUntil(a.duedate) <= 3 && daysUntil(a.duedate) >= 0 && "dt-urgent")}>
                {daysUntil(a.duedate) < 0 ? "Terlambat" : daysUntil(a.duedate) === 0 ? "Hari ini!" : daysUntil(a.duedate) + "h"}
              </div>
            )}
          </div>
        ))}
        {assignments.length === 0 && <p className="empty">Tidak ada tugas</p>}
      </div>
    </div>
  );
}
