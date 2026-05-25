import { useState } from "react";
import { fmtFull, daysUntil, cx } from "../../lib/helpers";

export default function DeadlinesTab({ deadlines }) {
  const [filter, setFilter] = useState("all");
  let items = [...deadlines];
  if (filter === "overdue") items = items.filter(d => d.overdue || daysUntil(d.date) < 0);
  if (filter === "week")    items = items.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 7);
  if (filter === "month")   items = items.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 30);

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Semua Deadline ⏰</h1>
        <p className="view-sub">{deadlines.length} deadline dari elearning</p>
      </div>
      <div className="filters">
        {[["all", "Semua"], ["overdue", "Terlambat"], ["week", "7 Hari"], ["month", "30 Hari"]].map(([k, l]) => (
          <button key={k} className={cx("fbtn", filter === k && "active")} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="list-cards">
        {items.map(d => (
          <a key={d.id} href={d.url || "#"} target="_blank" rel="noopener" className="task-card">
            <div className={cx("dl-type", d.type === "assign" && "t-assign", d.type === "quiz" && "t-quiz")}>
              {d.type === "assign" ? "📝" : d.type === "quiz" ? "📋" : "📅"}
            </div>
            <div className="tc-body">
              <div className="tc-title">{d.name}</div>
              <div className="tc-meta">
                <span className="badge">{d.course}</span>
                <span className="badge b-type">{d.type}</span>
                <span>📅 {fmtFull(d.date)}</span>
              </div>
              {d.desc && <div className="tc-desc">{d.desc}</div>}
            </div>
            <div className={cx("days-tag", daysUntil(d.date) < 0 && "dt-late", daysUntil(d.date) <= 3 && daysUntil(d.date) >= 0 && "dt-urgent")}>
              {daysUntil(d.date) < 0 ? Math.abs(daysUntil(d.date)) + "h late" : daysUntil(d.date) === 0 ? "Hari ini!" : daysUntil(d.date) + " hari"}
            </div>
          </a>
        ))}
        {items.length === 0 && <p className="empty">Tidak ada deadline di filter ini</p>}
      </div>
    </div>
  );
}
