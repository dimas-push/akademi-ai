import Head from "next/head";
import { useState, useEffect, useCallback, useRef } from "react";
import { API, STUDENT_NAME, STUDENT_NIM, strip, safeFetch, fmtFull, daysUntil } from "../lib/helpers";
import HomeTab         from "../components/tabs/HomeTab";
import DeadlinesTab    from "../components/tabs/DeadlinesTab";
import TasksTab        from "../components/tabs/TasksTab";
import QuizzesTab      from "../components/tabs/QuizzesTab";
import GradesTab       from "../components/tabs/GradesTab";
import AttendanceTab   from "../components/tabs/AttendanceTab";
import AnnouncementsTab from "../components/tabs/AnnouncementsTab";
import NotifTab        from "../components/tabs/NotifTab";
import ChatTab         from "../components/tabs/ChatTab";

const cx = (...c) => c.filter(Boolean).join(" ");

export default function AkademiAI() {
  const [tab, setTab]                 = useState("home");
  const [courses, setCourses]         = useState([]);
  const [deadlines, setDeadlines]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes]         = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades]           = useState({});
  const [syncing, setSyncing]         = useState(true);
  const [lastSync, setLastSync]       = useState(null);
  const [syncProgress, setSyncProgress] = useState("");
  const [errors, setErrors]           = useState([]);
  const [nav, setNav]                 = useState(false);
  const [chatMsgs, setChatMsgs]       = useState([]);
  const [chatIn, setChatIn]           = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [attendance, setAttendance]   = useState([]);
  const [mounted, setMounted]         = useState(false);
  const chatEnd = useRef(null);

  // Restore persisted data
  useEffect(() => {
    setMounted(true);
    try { const s = localStorage.getItem("akademi-att");  if (s) setAttendance(JSON.parse(s)); } catch {}
    try { const c = localStorage.getItem("akademi-chat"); if (c) setChatMsgs(JSON.parse(c));   } catch {}
  }, []);
  useEffect(() => { if (mounted) try { localStorage.setItem("akademi-att",  JSON.stringify(attendance));         } catch {} }, [attendance, mounted]);
  useEffect(() => { if (mounted) try { localStorage.setItem("akademi-chat", JSON.stringify(chatMsgs.slice(-50))); } catch {} }, [chatMsgs, mounted]);

  // ─── SEQUENTIAL SYNC ─────────────────────────────────────────
  const syncAll = useCallback(async () => {
    setSyncing(true); setErrors([]);
    const errs = [];

    setSyncProgress("Mengambil mata kuliah...");
    const crsData = await safeFetch(`${API}/courses?classification=inprogress`);
    if (crsData?.courses) setCourses(crsData.courses); else errs.push("courses");
    await new Promise(r => setTimeout(r, 500));

    setSyncProgress("Mengambil deadline...");
    const dlData = await safeFetch(`${API}/deadlines?limitnum=30`);
    if (dlData?.events) {
      setDeadlines(dlData.events.map(e => ({
        id: e.id, name: e.name, desc: strip(e.description),
        type: e.modulename || e.eventtype,
        course: e.course?.shortname || e.course?.fullname || "",
        courseId: e.course?.id,
        date: e.timestart ? new Date(e.timestart * 1000).toISOString() : null,
        url: e.url, action: e.action?.name, overdue: e.overdue,
      })));
    } else errs.push("deadlines");
    await new Promise(r => setTimeout(r, 500));

    setSyncProgress("Mengambil notifikasi...");
    const notifData = await safeFetch(`${API}/notifications?limit=20`);
    if (notifData?.notifications) {
      setNotifications(notifData.notifications.map(n => ({
        id: n.id, subject: n.subject,
        text: n.smallmessage || strip(n.fullmessage),
        type: n.component, read: n.read,
        time: new Date(n.timecreated * 1000).toISOString(), url: n.contexturl,
      })));
    } else errs.push("notifications");
    await new Promise(r => setTimeout(r, 500));

    setSyncProgress("Mengambil tugas...");
    const asgData = await safeFetch(`${API}/assignments`);
    if (asgData?.courses) {
      const all = [];
      for (const c of asgData.courses)
        for (const a of c.assignments || [])
          all.push({ id: a.id, name: a.name, intro: strip(a.intro), course: c.shortname || c.fullname, courseId: c.id, duedate: a.duedate ? new Date(a.duedate * 1000).toISOString() : null });
      setAssignments(all.sort((a, b) => new Date(a.duedate || "2099") - new Date(b.duedate || "2099")));
    } else errs.push("assignments");
    await new Promise(r => setTimeout(r, 500));

    setSyncProgress("Mengambil quiz...");
    const qzData = await safeFetch(`${API}/quizzes`);
    if (qzData?.quizzes) {
      setQuizzes(qzData.quizzes.map(q => ({
        id: q.id, name: q.name, course: q.course,
        timeopen: q.timeopen ? new Date(q.timeopen * 1000).toISOString() : null,
        timeclose: q.timeclose ? new Date(q.timeclose * 1000).toISOString() : null,
        timelimit: q.timelimit, maxgrade: q.grade,
      })));
    } else errs.push("quizzes");
    await new Promise(r => setTimeout(r, 500));

    setSyncProgress("Mengambil pengumuman...");
    try {
      const forums = await safeFetch(`${API}/forums`);
      if (forums) {
        const newsForums = (Array.isArray(forums) ? forums : []).filter(f => f.type === "news");
        const anns = [];
        for (const f of newsForums.slice(0, 5)) {
          await new Promise(r => setTimeout(r, 400));
          const disc = await safeFetch(`${API}/forum-discussions?forumid=${f.id}&perpage=3`);
          if (disc?.discussions) {
            for (const d of disc.discussions)
              anns.push({ id: d.discussion || d.id, name: d.name, msg: strip(d.message), author: d.userfullname, created: new Date(d.created * 1000).toISOString(), courseId: f.course, forum: f.name });
          }
        }
        setAnnouncements(anns.sort((a, b) => new Date(b.created) - new Date(a.created)));
      }
    } catch { errs.push("announcements"); }

    if (crsData?.courses && errs.length < 3) {
      setSyncProgress("Mengambil nilai...");
      const gradeMap = {};
      for (const c of (crsData.courses || []).slice(0, 8)) {
        await new Promise(r => setTimeout(r, 400));
        const g = await safeFetch(`${API}/grades?courseid=${c.id}`);
        if (g?.usergrades?.[0]) {
          gradeMap[c.id] = {
            name: c.shortname || c.fullname,
            items: (g.usergrades[0].gradeitems || []).map(gi => ({
              id: gi.id, name: gi.itemname || "Total", type: gi.itemtype, module: gi.itemmodule,
              grade: gi.gradeformatted, raw: gi.graderaw, max: gi.grademax, pct: gi.percentageformatted,
            })),
          };
        }
      }
      setGrades(gradeMap);
    }

    setSyncProgress(""); setErrors(errs); setLastSync(new Date()); setSyncing(false);
  }, []);

  useEffect(() => { syncAll(); }, [syncAll]);

  // Auto-refresh deadlines every 15 minutes
  useEffect(() => {
    const i = setInterval(async () => {
      const dl = await safeFetch(`${API}/deadlines?limitnum=30`);
      if (dl?.events) setDeadlines(dl.events.map(e => ({
        id: e.id, name: e.name, desc: strip(e.description), type: e.modulename || e.eventtype,
        course: e.course?.shortname || "", courseId: e.course?.id,
        date: e.timestart ? new Date(e.timestart * 1000).toISOString() : null,
        url: e.url, action: e.action?.name, overdue: e.overdue,
      })));
    }, 15 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  // ─── AI CHAT ─────────────────────────────────────────────────
  const sendChat = async (msg) => {
    if (!msg.trim()) return;
    setChatMsgs(p => [...p, { role: "user", content: msg, time: new Date().toISOString() }]);
    setChatIn(""); setChatLoading(true);
    try {
      const ctx = `PROFIL: ${STUDENT_NAME}, UBP Karawang\nMATKUL (${courses.length}): ${courses.map(c => c.shortname || c.fullname).join(", ")}\nDEADLINE:\n${deadlines.slice(0, 10).map(d => "- " + d.name + " (" + d.course + ") " + fmtFull(d.date) + " | " + (d.overdue ? "TERLAMBAT" : daysUntil(d.date) + "h lagi")).join("\n")}\nTUGAS: ${assignments.length} total\nQUIZ: ${quizzes.length}\nNOTIF BELUM DIBACA: ${notifications.filter(n => !n.read).length}`;
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: ctx, messages: [...chatMsgs.slice(-8).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })), { role: "user", content: msg }] }),
      });
      const data = await res.json();
      setChatMsgs(p => [...p, { role: "assistant", content: data.reply || data.error || "Gagal merespon.", time: new Date().toISOString() }]);
    } catch {
      setChatMsgs(p => [...p, { role: "assistant", content: "⚠️ Gagal terhubung ke AI. Pastikan ANTHROPIC_API_KEY sudah diset.", time: new Date().toISOString() }]);
    }
    setChatLoading(false);
  };

  // ─── COMPUTED ────────────────────────────────────────────────
  const urgentDl  = deadlines.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 3);
  const overdueDl = deadlines.filter(d => d.overdue || daysUntil(d.date) < 0);
  const unread    = notifications.filter(n => !n.read).length;
  const attRate   = attendance.length > 0 ? (attendance.filter(a => a.present).length / attendance.length * 100).toFixed(0) : 0;

  const tabs = [
    { id: "home",          label: "Dashboard",   icon: "🏠" },
    { id: "deadlines",     label: "Deadline",    icon: "⏰", badge: urgentDl.length || null },
    { id: "tasks",         label: "Tugas",       icon: "📝" },
    { id: "quizzes",       label: "Quiz",        icon: "📋" },
    { id: "grades",        label: "Nilai",       icon: "📊" },
    { id: "attendance",    label: "Absensi",     icon: "✅" },
    { id: "announcements", label: "Pengumuman",  icon: "📢" },
    { id: "notif",         label: "Notifikasi",  icon: "🔔", badge: unread || null },
    { id: "chat",          label: "AI Chat",     icon: "🤖" },
  ];

  return (
    <>
      <Head>
        <title>AkademiAI — UBP Karawang</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎓</text></svg>" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=optional" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* Mobile header */}
        <div className="mob-hdr">
          <div className="mob-left"><span>🎓</span><span className="logo-txt">AkademiAI</span></div>
          <button className="mob-menu" onClick={() => setNav(!nav)}>☰</button>
        </div>

        {/* Sidebar */}
        <nav className={cx("sidebar", nav && "open")}>
          <div className="sb-head"><span>🎓</span><span className="logo-txt">AkademiAI</span></div>
          <div className="sb-user">
            <div className="sb-name">{STUDENT_NAME}</div>
            {STUDENT_NIM && <div className="sb-nim">NIM: {STUDENT_NIM}</div>}
          </div>
          <div className="sb-nav">
            {tabs.map(t => (
              <button key={t.id} className={cx("sb-item", tab === t.id && "active")} onClick={() => { setTab(t.id); setNav(false); }}>
                <span className="sb-icon">{t.icon}</span><span>{t.label}</span>
                {t.badge && <span className="sb-badge">{t.badge}</span>}
              </button>
            ))}
          </div>
          <div className="sb-sync">
            <button className="sync-btn" onClick={syncAll} disabled={syncing}>
              {syncing ? "⟳ Syncing..." : "🔄 Sync Elearning"}
            </button>
            {syncProgress && <div className="sync-time">{syncProgress}</div>}
            {lastSync && !syncing && <div className="sync-time">✅ Terakhir: {lastSync.toLocaleTimeString("id-ID")}</div>}
            {errors.length > 0 && <div className="sync-time" style={{ color: "#f59e0b" }}>⚠️ {errors.length} endpoint gagal</div>}
          </div>
        </nav>
        {nav && <div className="overlay" onClick={() => setNav(false)} />}

        {/* Main content */}
        <main className="main-content">
          {syncing && !lastSync && (
            <div className="loading-screen">
              <div className="spinner" />
              <p>{syncProgress || "Menghubungkan ke elearning UBP Karawang..."}</p>
            </div>
          )}

          {(lastSync || !syncing) && (
            <>
              {errors.length > 0 && (
                <div className="warn-bar">
                  ⚠️ Beberapa data gagal dimuat ({errors.join(", ")}). <button onClick={syncAll}>Coba lagi</button>
                </div>
              )}
              {tab === "home"          && <HomeTab courses={courses} deadlines={deadlines} urgent={urgentDl} overdue={overdueDl} assignments={assignments} quizzes={quizzes} notifications={notifications} announcements={announcements} unread={unread} attRate={attRate} grades={grades} />}
              {tab === "deadlines"     && <DeadlinesTab deadlines={deadlines} />}
              {tab === "tasks"         && <TasksTab assignments={assignments} />}
              {tab === "quizzes"       && <QuizzesTab quizzes={quizzes} />}
              {tab === "grades"        && <GradesTab grades={grades} />}
              {tab === "attendance"    && <AttendanceTab courses={courses} attendance={attendance} setAttendance={setAttendance} />}
              {tab === "announcements" && <AnnouncementsTab announcements={announcements} />}
              {tab === "notif"         && <NotifTab notifications={notifications} />}
              {tab === "chat"          && <ChatTab msgs={chatMsgs} input={chatIn} setInput={setChatIn} send={sendChat} loading={chatLoading} endRef={chatEnd} />}
            </>
          )}
        </main>
      </div>
    </>
  );
}
