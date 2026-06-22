import { useState, useMemo } from "react";
import { fmtFull, daysUntil, cx } from "../../lib/helpers";

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const DAY_LABELS  = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

function CalendarView({ deadlines }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(null);

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const firstDow     = new Date(year, month, 1).getDay();

  // Map deadline ke hari dalam bulan ini
  const byDay = useMemo(() => {
    const map = {};
    for (const d of deadlines) {
      if (!d.date) continue;
      const dt = new Date(d.date);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const day = dt.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(d);
      }
    }
    return map;
  }, [deadlines, year, month]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); setSelected(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); setSelected(null); };

  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selDeadlines = selected ? (byDay[selected] || []) : [];

  return (
    <div className="cal-wrap">
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth}>‹</button>
        <span className="cal-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="cal-nav" onClick={nextMonth}>›</button>
      </div>

      <div className="cal-grid">
        {DAY_LABELS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
        {Array.from({ length: firstDow }).map((_, i) => <div key={"p"+i} className="cal-cell cal-pad" />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const isToday   = `${year}-${month}-${day}` === todayStr;
          const hasDl     = byDay[day]?.length > 0;
          const isSelected = selected === day;
          const hasUrgent = byDay[day]?.some(d => daysUntil(d.date) <= 3 && daysUntil(d.date) >= 0);
          const hasLate   = byDay[day]?.some(d => daysUntil(d.date) < 0);
          return (
            <div
              key={day}
              className={cx("cal-cell", isToday && "cal-today", isSelected && "cal-selected", hasDl && "cal-has-dl")}
              onClick={() => setSelected(selected === day ? null : day)}
            >
              <span className="cal-day-num">{day}</span>
              {hasDl && (
                <span className={cx("cal-dot", hasLate ? "cal-dot-late" : hasUrgent ? "cal-dot-urgent" : "cal-dot-ok")}>
                  {byDay[day].length > 1 ? byDay[day].length : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="cal-detail">
          <div className="cal-detail-title">{selected} {MONTH_NAMES[month]}</div>
          {selDeadlines.length === 0 ? (
            <p className="cal-detail-empty">Tidak ada deadline</p>
          ) : (
            selDeadlines.map(d => (
              <a key={d.id} href={d.url || "#"} target="_blank" rel="noopener" className="cal-detail-item">
                <span className={cx("cal-detail-dot", daysUntil(d.date) < 0 ? "cal-dot-late" : daysUntil(d.date) <= 3 ? "cal-dot-urgent" : "cal-dot-ok")} />
                <div>
                  <div className="cal-detail-name">{d.name}</div>
                  <div className="cal-detail-course">{d.course} • {fmtFull(d.date)}</div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function DeadlinesTab({ deadlines }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView]     = useState("list"); // 'list' | 'calendar'

  const items = useMemo(() => {
    let list = [...deadlines];
    if (filter === "overdue") list = list.filter(d => d.overdue || daysUntil(d.date) < 0);
    if (filter === "week")    list = list.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 7);
    if (filter === "month")   list = list.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 30);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name?.toLowerCase().includes(q) || d.course?.toLowerCase().includes(q));
    }
    return list;
  }, [deadlines, filter, search]);

  return (
    <div className="view">
      <div className="view-hdr">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 className="view-title">Semua Deadline ⏰</h1>
            <p className="view-sub">{deadlines.length} deadline dari elearning</p>
          </div>
          <div className="view-toggle">
            <button className={cx("vtbtn", view === "list" && "active")} onClick={() => setView("list")}>☰ List</button>
            <button className={cx("vtbtn", view === "calendar" && "active")} onClick={() => setView("calendar")}>📅 Kalender</button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <>
          <input
            className="search-input"
            type="search"
            placeholder="Cari deadline atau mata kuliah..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
            {items.length === 0 && (
              <p className="empty">{search ? `Tidak ada deadline cocok "${search}"` : "Tidak ada deadline di filter ini"}</p>
            )}
          </div>
        </>
      ) : (
        <CalendarView deadlines={deadlines} />
      )}
    </div>
  );
}
