import { fmtFull } from "../../lib/helpers";

export default function AnnouncementsTab({ announcements }) {
  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Pengumuman 📢</h1>
        <p className="view-sub">{announcements.length} pengumuman dari forum elearning</p>
      </div>
      <div className="list-cards">
        {announcements.map(a => (
          <div key={a.id} className="task-card">
            <div className="ann-icon lg">📌</div>
            <div className="tc-body">
              <div className="tc-title">{a.name}</div>
              <div className="tc-meta">
                <span className="badge">{a.forum}</span>
                <span>👤 {a.author}</span>
                <span>📅 {fmtFull(a.created)}</span>
              </div>
              {a.msg && <div className="tc-desc">{a.msg}</div>}
            </div>
          </div>
        ))}
        {announcements.length === 0 && <p className="empty">Belum ada pengumuman</p>}
      </div>
    </div>
  );
}
