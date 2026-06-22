import Head from "next/head";
import { useState, useEffect, useCallback, useRef } from "react";
import { API, STUDENT_NAME, STUDENT_NIM, strip, safeFetch, fmtFull, daysUntil, cx, timeToISO, isAttendanceEvent } from "../lib/helpers";
import { detectNewItems, seedSWIds } from "../lib/notify";
import { saveState, loadState } from "../lib/cache";
import HomeTab          from "../components/tabs/HomeTab";
import DeadlinesTab     from "../components/tabs/DeadlinesTab";
import TasksTab         from "../components/tabs/TasksTab";
import QuizzesTab       from "../components/tabs/QuizzesTab";
import GradesTab        from "../components/tabs/GradesTab";
import AttendanceTab    from "../components/tabs/AttendanceTab";
import AnnouncementsTab from "../components/tabs/AnnouncementsTab";
import NotifTab         from "../components/tabs/NotifTab";
import ChatTab          from "../components/tabs/ChatTab";

// ─── Deadline mapper (dipakai di dua tempat) ──────────────────
const mapDeadline = (e) => ({
  id: e.id, name: e.name, desc: strip(e.description),
  type: e.modulename || e.eventtype,
  course: e.course?.shortname || e.course?.fullname || "",
  courseId: e.course?.id,
  date: timeToISO(e.timestart),
  url: e.url, action: e.action?.name, overdue: e.overdue,
});

export default function AkademiAI() {
  const [tab, setTab]                     = useState("home");
  const [courses, setCourses]             = useState([]);
  const [deadlines, setDeadlines]         = useState([]);
  const [assignments, setAssignments]     = useState([]);
  const [quizzes, setQuizzes]             = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades]               = useState({});
  const [syncing, setSyncing]             = useState(true);
  const [lastSync, setLastSync]           = useState(null);
  const [syncProgress, setSyncProgress]   = useState("");
  const [errors, setErrors]               = useState([]);
  const [nav, setNav]                     = useState(false);
  const [attendance, setAttendance]       = useState([]);
  const [mounted, setMounted]             = useState(false);
  const [toasts, setToasts]               = useState([]);
  const [autoAttendLog, setAutoAttendLog]     = useState([]);
  const [lastAttendCheck, setLastAttendCheck] = useState(null);
  const [attendInterval, setAttendInterval]   = useState(1); // menit
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [tokenExpired, setTokenExpired]       = useState(false);
  const [chatMsgs, setChatMsgs]           = useState([]);

  const syncingRef = useRef(false); // guard: jangan dobel-sync

  const addToast = useCallback((newToasts) => {
    if (!newToasts.length) return;
    setToasts(prev => [...prev, ...newToasts]);
    newToasts.forEach(t => setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 6000));
  }, []);

  // ─── MOUNT: load cache → tampil instan, lalu sync background ──
  useEffect(() => {
    setMounted(true);
    try { const s = localStorage.getItem("akademi-att");  if (s) setAttendance(JSON.parse(s)); } catch {}
    try { const c = localStorage.getItem("akademi-chat"); if (c) setChatMsgs(JSON.parse(c));   } catch {}
    try { const n = localStorage.getItem("akademi-attend-interval"); if (n) setAttendInterval(Number(n)); } catch {}

    // Minta izin notifikasi setelah 4 detik jika belum pernah
    setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'default') setShowNotifBanner(true);
    }, 4000);

    loadState().then(cached => {
      if (!cached) return;
      if (cached.courses?.length)                          setCourses(cached.courses);
      if (cached.deadlines?.length)                        setDeadlines(cached.deadlines);
      if (cached.assignments?.length)                      setAssignments(cached.assignments);
      if (cached.quizzes?.length)                          setQuizzes(cached.quizzes);
      if (cached.grades && Object.keys(cached.grades).length) setGrades(cached.grades);
      if (cached.notifications?.length)                    setNotifications(cached.notifications);
      if (cached.announcements?.length)                    setAnnouncements(cached.announcements);
      if (cached.lastSync) {
        setLastSync(new Date(cached.lastSync));
        setSyncing(false); // ada cache → sembunyikan loading screen
      }
    });
  }, []);

  // ─── PERSIST ──────────────────────────────────────────────────
  useEffect(() => { if (mounted) try { localStorage.setItem("akademi-att",  JSON.stringify(attendance)); } catch {} }, [attendance, mounted]);
  useEffect(() => { if (mounted) try { localStorage.setItem("akademi-chat", JSON.stringify(chatMsgs.slice(-50))); } catch {} }, [chatMsgs, mounted]);
  useEffect(() => { if (mounted) try { localStorage.setItem("akademi-attend-interval", String(attendInterval)); } catch {} }, [attendInterval, mounted]);

  // ─── AUTO-ABSEN POLLING ───────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;

    const isClassHour = () => { const h = new Date().getHours(), d = new Date().getDay(); return d >= 1 && d <= 6 && h >= 6 && h < 22; };

    const runAttend = async () => {
      if (!isClassHour()) return;
      setLastAttendCheck(new Date());
      try {
        const res  = await fetch("/api/moodle/auto-attend", { method: "POST" });
        const data = await res.json();
        if (data.attended?.length > 0) {
          data.attended.forEach(a => {
            addToast([{ id: `auto-${a.name}-${Date.now()}`, title: "✅ Auto-Absen Berhasil!", body: `${a.name} — ${a.course}`, type: "attendance" }]);
            setAutoAttendLog(p => [{ ...a, time: new Date().toISOString() }, ...p.slice(0, 19)]);
          });
        }
      } catch (e) {
        console.warn("[AkademiAI] Auto-attend error:", e.message);
      }
    };

    runAttend();
    const interval = setInterval(runAttend, attendInterval * 60 * 1000);

    const onSWMsg = (event) => {
      if (event.data?.type === "AUTO_ATTENDED") {
        event.data.attended?.forEach(a => {
          addToast([{ id: `sw-auto-${a.name}-${Date.now()}`, title: "✅ Auto-Absen Berhasil!", body: `${a.name} — ${a.course}`, type: "attendance" }]);
          setAutoAttendLog(p => [{ ...a, time: new Date().toISOString() }, ...p.slice(0, 19)]);
        });
      }
    };
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onSWMsg);
    return () => {
      clearInterval(interval);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onSWMsg);
    };
  }, [mounted, addToast, attendInterval]);

  // ─── SYNC ────────────────────────────────────────────────────
  const syncAll = useCallback(async (silent = false) => {
    if (syncingRef.current) return; // hindari dobel-sync
    syncingRef.current = true;
    if (!silent) setSyncing(true);
    setErrors([]);
    const errs = [];

    if (!silent) setSyncProgress("Sinkronisasi data...");

    const [crsData, dlData, notifData, asgData, qzData, forumsData] = await Promise.all([
      safeFetch(`${API}/courses?classification=inprogress`),
      safeFetch(`${API}/deadlines?limitnum=30`),
      safeFetch(`${API}/notifications?limit=20`),
      safeFetch(`${API}/assignments`),
      safeFetch(`${API}/quizzes`),
      safeFetch(`${API}/forums`),
    ]);

    let localCourses = [];
    // Deteksi token Moodle expired (exception dari API)
    if (crsData?.exception || crsData?.errorcode === 'invalidtoken') { setTokenExpired(true); syncingRef.current = false; setSyncing(false); return; }
    setTokenExpired(false);

    if (crsData?.courses) { localCourses = crsData.courses; setCourses(localCourses); }
    else errs.push("courses");

    let localDeadlines = [];
    if (dlData?.events) { localDeadlines = dlData.events.map(mapDeadline); setDeadlines(localDeadlines); }
    else errs.push("deadlines");

    let localNotifs = [];
    if (notifData?.notifications) {
      localNotifs = notifData.notifications.map(n => ({
        id: n.id, subject: n.subject,
        text: n.smallmessage || strip(n.fullmessage),
        type: n.component, read: n.read,
        time: timeToISO(n.timecreated), url: n.contexturl,
      }));
      setNotifications(localNotifs);
    } else errs.push("notifications");

    let localAssignments = [];
    if (asgData?.courses) {
      const all = [];
      for (const c of asgData.courses)
        for (const a of c.assignments || [])
          all.push({ id: a.id, name: a.name, intro: strip(a.intro), course: c.shortname || c.fullname, courseId: c.id, duedate: timeToISO(a.duedate) });
      localAssignments = all.sort((a, b) => new Date(a.duedate || "2099") - new Date(b.duedate || "2099"));
      setAssignments(localAssignments);
    } else errs.push("assignments");

    let localQuizzes = [];
    if (qzData?.quizzes) {
      localQuizzes = qzData.quizzes.map(q => ({
        id: q.id, name: q.name, course: q.course,
        timeopen: timeToISO(q.timeopen), timeclose: timeToISO(q.timeclose),
        timelimit: q.timelimit, maxgrade: q.grade,
      }));
      setQuizzes(localQuizzes);
    } else errs.push("quizzes");

    // Round 2: nilai + pengumuman — paralel
    if (!silent) setSyncProgress("Mengambil nilai & pengumuman...");

    const gradePromises = localCourses.slice(0, 8).map(c =>
      safeFetch(`${API}/grades?courseid=${c.id}`).then(g => ({ c, g }))
    );
    const newsForums  = forumsData
      ? (Array.isArray(forumsData) ? forumsData : []).filter(f => f.type === "news").slice(0, 5)
      : [];
    const annPromises = newsForums.map(f =>
      safeFetch(`${API}/forum-discussions?forumid=${f.id}&perpage=3`).then(disc => ({ f, disc }))
    );

    const [gradeResults, annResults] = await Promise.all([
      Promise.all(gradePromises),
      Promise.all(annPromises),
    ]);

    let localGrades = {};
    if (localCourses.length > 0) {
      for (const { c, g } of gradeResults) {
        if (g?.usergrades?.[0]) {
          localGrades[c.id] = {
            name: c.shortname || c.fullname,
            items: (g.usergrades[0].gradeitems || []).map(gi => ({
              id: gi.id, name: gi.itemname || "Total", type: gi.itemtype, module: gi.itemmodule,
              grade: gi.gradeformatted, raw: gi.graderaw, max: gi.grademax, pct: gi.percentageformatted,
            })),
          };
        }
      }
      setGrades(localGrades);
    }

    let localAnns = [];
    if (forumsData) {
      for (const { f, disc } of annResults) {
        if (disc?.discussions) {
          for (const d of disc.discussions)
            localAnns.push({ id: d.discussion || d.id, name: d.name, msg: strip(d.message), author: d.userfullname, created: timeToISO(d.created), courseId: f.course, forum: f.name });
        }
      }
      localAnns.sort((a, b) => new Date(b.created) - new Date(a.created));
      setAnnouncements(localAnns);
    } else errs.push("announcements");

    // Deteksi item baru + seed SW
    if (!silent) addToast(detectNewItems(localAssignments, localDeadlines));
    seedSWIds(localAssignments.map(a => a.id), localDeadlines.filter(isAttendanceEvent).map(e => e.id));

    // Simpan ke IndexedDB cache
    const now = new Date();
    await saveState({
      courses: localCourses, deadlines: localDeadlines, assignments: localAssignments,
      quizzes: localQuizzes, grades: localGrades, notifications: localNotifs,
      announcements: localAnns, lastSync: now.toISOString(),
    });

    setSyncProgress(""); setErrors(errs); setLastSync(now); setSyncing(false);
    syncingRef.current = false;
  }, [addToast]);

  // Sync pertama kali setelah mount
  useEffect(() => { syncAll(); }, [syncAll]);

  // Auto-sync saat tab kembali aktif (user balik ke tab/buka app lagi)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const stale = !lastSync || Date.now() - lastSync.getTime() > 3 * 60 * 1000;
      if (stale) syncAll(true); // silent: jangan reset loading screen
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [lastSync, syncAll]);

  // Auto-sync setiap 10 menit selama app terbuka
  useEffect(() => {
    const i = setInterval(() => syncAll(true), 10 * 60 * 1000);
    return () => clearInterval(i);
  }, [syncAll]);

  // ─── COMPUTED ────────────────────────────────────────────────
  const urgentDl  = deadlines.filter(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 3);
  const overdueDl = deadlines.filter(d => d.overdue || daysUntil(d.date) < 0);
  const unread    = notifications.filter(n => !n.read).length;
  const attRate   = attendance.length > 0 ? (attendance.filter(a => a.present).length / attendance.length * 100).toFixed(0) : 0;

  const tabs = [
    { id: "home",          label: "Dashboard",  icon: "🏠" },
    { id: "deadlines",     label: "Deadline",   icon: "⏰", badge: urgentDl.length || null },
    { id: "tasks",         label: "Tugas",      icon: "📝" },
    { id: "quizzes",       label: "Quiz",       icon: "📋" },
    { id: "grades",        label: "Nilai",      icon: "📊" },
    { id: "attendance",    label: "Absensi",    icon: "✅" },
    { id: "announcements", label: "Pengumuman", icon: "📢" },
    { id: "notif",         label: "Notifikasi", icon: "🔔", badge: unread || null },
    { id: "chat",          label: "AI Chat",    icon: "🤖" },
  ];

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const syncAge = lastSync ? Math.floor((Date.now() - lastSync.getTime()) / 60000) : null;

  return (
    <>
      <Head>
        <title>AkademiAI — UBP Karawang</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#07101f" />
        <meta name="description" content="Dashboard akademik mahasiswa UBP Karawang dengan AI" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎓</text></svg>" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=optional" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* Mobile header */}
        <div className="mob-hdr">
          <div className="mob-left">
            <div className="sb-logo-icon">🎓</div>
            <span className="logo-txt">AkademiAI</span>
          </div>
          <button className="mob-menu" onClick={() => setNav(!nav)}>☰</button>
        </div>

        {/* Sidebar */}
        <nav className={cx("sidebar", nav && "open")}>
          <div className="sb-head">
            <div className="sb-logo-icon">🎓</div>
            <span className="logo-txt">AkademiAI</span>
          </div>

          <div className="sb-user">
            <div className="sb-user-row">
              <div className="sb-avatar">
                {STUDENT_NAME.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
              </div>
              <div className="sb-user-info">
                <div className="sb-name">{STUDENT_NAME}</div>
                {STUDENT_NIM && <div className="sb-nim">NIM {STUDENT_NIM}</div>}
              </div>
            </div>
          </div>

          <div className="sb-nav">
            <div className="sb-section-label">Menu</div>
            {tabs.map(t => (
              <button key={t.id} className={cx("sb-item", tab === t.id && "active")} onClick={() => { setTab(t.id); setNav(false); }}>
                <span className="sb-icon">{t.icon}</span>
                <span>{t.label}</span>
                {t.badge ? <span className="sb-badge">{t.badge}</span> : null}
              </button>
            ))}
          </div>

          <div className="sb-sync">
            {/* Tombol refresh manual — auto-sync tetap jalan di background */}
            <button className="sync-btn" onClick={() => syncAll()} disabled={syncing}>
              {syncing ? "⟳ Memperbarui..." : "🔄 Refresh"}
            </button>
            {syncing && syncProgress && <div className="sync-time">{syncProgress}</div>}
            {lastSync && !syncing && (
              <div className="sync-time">
                {syncAge === 0 ? "Baru saja diperbarui" : `Diperbarui ${syncAge} menit lalu`}
              </div>
            )}
            {errors.length > 0 && <div className="sync-time" style={{ color: "var(--warning)" }}>⚠ {errors.length} data gagal dimuat</div>}
            <div className="auto-attend-bar">
              <span className="auto-attend-dot" />
              <span>Auto-sync & absen aktif</span>
            </div>
            {autoAttendLog.length > 0 && (
              <div className="sync-time" style={{ color: "var(--green-l)" }}>
                ✓ {autoAttendLog[0].name?.slice(0, 22)}
              </div>
            )}
            <button className="logout-btn" onClick={handleLogout}>Keluar</button>
          </div>
        </nav>
        {nav && <div className="overlay" onClick={() => setNav(false)} />}

        {/* Toast */}
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <div className="toast-content">
                <span className="toast-title">{t.title}</span>
                <span className="toast-body">{t.body}</span>
              </div>
              <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>✕</button>
            </div>
          ))}
        </div>

        {/* Push notification banner */}
        {showNotifBanner && (
          <div className="notif-banner" style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 200, width: "calc(100% - 32px)", maxWidth: 480 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <span className="notif-banner-text"><strong>Aktifkan notifikasi</strong> untuk dapat peringatan deadline & absensi otomatis</span>
            <button className="notif-allow-btn" onClick={async () => {
              const p = await Notification.requestPermission();
              setShowNotifBanner(false);
              if (p === 'granted' && 'serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                reg.pushManager?.subscribe?.({ userVisibleOnly: true }).catch(() => {});
              }
            }}>Izinkan</button>
            <button className="notif-dismiss-btn" onClick={() => setShowNotifBanner(false)}>✕</button>
          </div>
        )}

        {/* Main content */}
        <main className="main-content">
          {/* Loading screen hanya jika belum ada data sama sekali (tidak ada cache) */}
          {syncing && !lastSync && (
            <div className="loading-screen">
              <div className="spinner" />
              <p>{syncProgress || "Menghubungkan ke elearning UBP Karawang..."}</p>
            </div>
          )}

          {(lastSync || !syncing) && (
            <>
              {/* Refresh indicator — tidak blocking */}
              {syncing && lastSync && (
                <div className="refresh-bar">
                  <span className="refresh-dot" /> Memperbarui data...
                </div>
              )}
              {tokenExpired && (
                <div className="warn-bar" style={{ borderColor: "#ef4444", background: "rgba(239,68,68,.06)" }}>
                  🔑 Token Moodle expired atau tidak valid. <a href="https://elearning.ubpkarawang.ac.id" target="_blank" rel="noopener" style={{ color: "#f87171" }}>Login ulang ke elearning</a> lalu perbarui MOODLE_TOKEN di Vercel.
                </div>
              )}
              {errors.length > 0 && !tokenExpired && (
                <div className="warn-bar">
                  ⚠️ Beberapa data gagal dimuat ({errors.join(", ")}). <button onClick={() => syncAll()}>Coba lagi</button>
                </div>
              )}
              {tab === "home"          && <HomeTab courses={courses} deadlines={deadlines} urgent={urgentDl} overdue={overdueDl} assignments={assignments} quizzes={quizzes} notifications={notifications} announcements={announcements} unread={unread} attRate={attRate} grades={grades} />}
              {tab === "deadlines"     && <DeadlinesTab deadlines={deadlines} />}
              {tab === "tasks"         && <TasksTab assignments={assignments} />}
              {tab === "quizzes"       && <QuizzesTab quizzes={quizzes} />}
              {tab === "grades"        && <GradesTab grades={grades} />}
              {tab === "attendance"    && <AttendanceTab courses={courses} attendance={attendance} setAttendance={setAttendance} autoAttendLog={autoAttendLog} lastAttendCheck={lastAttendCheck} attendInterval={attendInterval} setAttendInterval={setAttendInterval} />}
              {tab === "announcements" && <AnnouncementsTab announcements={announcements} />}
              {tab === "notif"         && <NotifTab notifications={notifications} />}
              {tab === "chat"          && <ChatTab msgs={chatMsgs} setMsgs={setChatMsgs} deadlines={deadlines} assignments={assignments} grades={grades} courses={courses} />}
            </>
          )}
        </main>
      </div>
    </>
  );
}
