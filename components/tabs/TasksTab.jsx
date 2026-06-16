import { useState, useMemo } from "react";
import { fmtFull, daysUntil, cx } from "../../lib/helpers";

export default function TasksTab({ assignments }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const items = useMemo(() => {
    let list = [...assignments];
    if (filter === "pending")   list = list.filter(a => !a.submitted && a.duedate >= Math.floor(Date.now() / 1000));
    if (filter === "overdue")   list = list.filter(a => !a.submitted && a.duedate && a.duedate < Math.floor(Date.now() / 1000));
    if (filter === "submitted") list = list.filter(a => a.submitted);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.course?.toLowerCase().includes(q));
    }
    return list;
  }, [assignments, search, filter]);

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Semua Tugas 📝</h1>
        <p className="view-sub">{assignments.length} tugas dari elearning</p>
      </div>

      <input
        className="search-input"
        type="search"
        placeholder="Cari tugas atau mata kuliah..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="filters">
        {[["all", "Semua"], ["pending", "Belum"], ["overdue", "Terlambat"], ["submitted", "Dikumpulkan"]].map(([k, l]) => (
          <button key={k} className={cx("fbtn", filter === k && "active")} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="list-cards">
        {items.map(a => (
          <div key={a.id} className="task-card">
            <div className="dl-type t-assign">📝</div>
            <div className="tc-body">
              <div className="tc-title">{a.name}</div>
              <div className="tc-meta">
                <span className="badge">{a.course}</span>
                {a.submitted && <span className="badge" style={{ background: "rgba(16,185,129,.15)", color: "#10b981" }}>✓ Dikumpulkan</span>}
                {a.duedate > 0 && <span>📅 Deadline: {fmtFull(a.duedate)}</span>}
              </div>
              {a.intro && <div className="tc-desc">{a.intro}</div>}
            </div>
            {a.duedate > 0 && (
              <div className={cx("days-tag", daysUntil(a.duedate) < 0 && "dt-late", daysUntil(a.duedate) <= 3 && daysUntil(a.duedate) >= 0 && "dt-urgent")}>
                {daysUntil(a.duedate) < 0 ? "Terlambat" : daysUntil(a.duedate) === 0 ? "Hari ini!" : daysUntil(a.duedate) + "h"}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="empty">{search ? `Tidak ada tugas cocok "${search}"` : "Tidak ada tugas"}</p>
        )}
      </div>
    </div>
  );
}
