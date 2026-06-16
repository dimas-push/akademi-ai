import { useState, useMemo } from "react";
import { cx } from "../../lib/helpers";

function gradeColor(pct) {
  if (pct >= 80) return "#10b981";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

function courseAverage(items) {
  const graded = items.filter(i => i.grade && i.grade !== "-" && !isNaN(parseFloat(i.grade)));
  if (!graded.length) return null;
  const sum = graded.reduce((acc, i) => acc + parseFloat(i.grade), 0);
  return Math.round(sum / graded.length);
}

export default function GradesTab({ grades }) {
  const [openSet, setOpenSet]   = useState(new Set());
  const [search, setSearch]     = useState("");

  const toggle = (cid) => {
    setOpenSet(prev => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  const entries = useMemo(() => {
    const all = Object.entries(grades);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all
      .map(([cid, g]) => {
        const nameMatch = g.name?.toLowerCase().includes(q);
        const matchedItems = g.items.filter(i => i.name?.toLowerCase().includes(q));
        if (nameMatch) return [cid, g];
        if (matchedItems.length) return [cid, { ...g, items: matchedItems }];
        return null;
      })
      .filter(Boolean);
  }, [grades, search]);

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Nilai Akademik 📊</h1>
        <p className="view-sub">Data langsung dari elearning</p>
      </div>

      <input
        className="search-input"
        type="search"
        placeholder="Cari mata kuliah atau komponen nilai..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {entries.map(([cid, g]) => {
        const isOpen  = openSet.has(cid);
        const avg     = courseAverage(g.items);
        const hasItems = g.items.filter(i => i.grade && i.grade !== "-").length > 0;

        return (
          <div key={cid} className="card clickable" onClick={() => toggle(cid)}>
            <div className="grade-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="card-title" style={{ margin: "0 0 6px" }}>{g.name}</h3>
                {avg !== null && (
                  <div className="grade-bar-wrap">
                    <div className="grade-bar-track">
                      <div
                        className="grade-bar-fill"
                        style={{ width: `${Math.min(avg, 100)}%`, background: gradeColor(avg) }}
                      />
                    </div>
                    <span className="grade-bar-label" style={{ color: gradeColor(avg) }}>
                      {avg}
                    </span>
                  </div>
                )}
                {avg === null && <div className="grade-bar-empty">Belum ada nilai</div>}
              </div>
              <span className={cx("grade-chevron", isOpen && "open")}>▼</span>
            </div>

            {isOpen && (
              <div className="grade-items">
                {g.items.filter(i => i.grade && i.grade !== "-").map(i => {
                  const numGrade = parseFloat(i.grade);
                  const pct      = !isNaN(numGrade) ? numGrade : null;
                  return (
                    <div key={i.id} className="grade-item">
                      <div className="grade-name">
                        <div className="list-title">{i.name}</div>
                        <div className="list-sub">{i.module || i.type}</div>
                      </div>
                      <div className="grade-score">
                        <div className="grade-val" style={pct !== null ? { color: gradeColor(pct) } : {}}>
                          {i.grade}
                        </div>
                        {i.pct && <div className="grade-pct">{i.pct}</div>}
                      </div>
                    </div>
                  );
                })}
                {!hasItems && <p className="empty">Belum ada nilai</p>}
              </div>
            )}
          </div>
        );
      })}

      {entries.length === 0 && (
        <p className="empty">
          {search ? `Tidak ada hasil untuk "${search}"` : "Belum ada data nilai"}
        </p>
      )}

    </div>
  );
}
