import { fmtFull, cx } from "../../lib/helpers";

export default function NotifTab({ notifications }) {
  return (
    <div className="view">
      <div className="view-hdr">
        <h1 className="view-title">Notifikasi 🔔</h1>
        <p className="view-sub">{notifications.length} notifikasi dari elearning</p>
      </div>
      <div className="list-cards">
        {notifications.map(n => (
          <a key={n.id} href={n.url || "#"} target="_blank" rel="noopener" className={cx("task-card", !n.read && "unread")}>
            <div className="notif-dot-wrap">{!n.read && <div className="notif-dot" />}</div>
            <div className="tc-body">
              <div className="tc-title">{n.subject}</div>
              <div className="tc-meta">
                <span>{fmtFull(n.time)}</span>
                <span className="badge b-type">{(n.type || "").replace("mod_", "")}</span>
              </div>
              {n.text && <div className="tc-desc">{n.text}</div>}
            </div>
          </a>
        ))}
        {notifications.length === 0 && <p className="empty">Tidak ada notifikasi</p>}
      </div>
    </div>
  );
}
