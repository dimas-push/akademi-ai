import { useState } from "react";

export default function GradesTab({ grades }) {
  const [openSet, setOpenSet] = useState(new Set());

  const toggle = (cid) => {
    setOpenSet(prev => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Nilai Akademik 📊</h1>
        <p className="view-sub">Data langsung dari elearning</p>
      </div>
      {Object.entries(grades).map(([cid, g]) => (
        <div key={cid} className="card clickable" onClick={() => toggle(cid)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="card-title" style={{ margin: 0 }}>{g.name}</h3>
            <span>{openSet.has(cid) ? "▲" : "▼"}</span>
          </div>
          {openSet.has(cid) && (
            <div style={{ marginTop: 12 }}>
              {g.items.filter(i => i.grade && i.grade !== "-").map(i => (
                <div key={i.id} className="list-item">
                  <div className="list-body">
                    <div className="list-title">{i.name}</div>
                    <div className="list-sub">{i.module || i.type}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#e2e8f0" }}>{i.grade}</div>
                    {i.pct && <div style={{ fontSize: 11, color: "#94a3b8" }}>{i.pct}</div>}
                  </div>
                </div>
              ))}
              {g.items.filter(i => i.grade && i.grade !== "-").length === 0 && (
                <p className="empty">Belum ada nilai</p>
              )}
            </div>
          )}
        </div>
      ))}
      {Object.keys(grades).length === 0 && <p className="empty">Belum ada data nilai</p>}
    </div>
  );
}
