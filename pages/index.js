import { useEffect, useState } from "react";

async function fetchWithRetry(url, retries = 2) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch error");
    return await res.json();
  } catch (err) {
    if (retries > 0) return fetchWithRetry(url, retries - 1);
    return [];
  }
}

// ⏰ Countdown helper
function getCountdown(timestamp) {
  if (!timestamp) return "-";

  const now = Date.now();
  const diff = timestamp * 1000 - now;

  if (diff <= 0) return "⛔ Sudah lewat";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  return `${days} hari ${hours} jam lagi`;
}

export default function Home() {
  const [courses, setCourses] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // buat refresh countdown

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const c = await fetchWithRetry("/api/moodle/courses");
      setCourses(c);

      const d = await fetchWithRetry("/api/moodle/deadlines");
      setDeadlines(d);

      const n = await fetchWithRetry("/api/moodle/notifications");
      setNotifications(n);

      setLoading(false);
    }

    loadData();

    // refresh countdown tiap 1 menit
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>🎓 Akademi AI Dashboard</h1>

      {loading && <p>Loading data...</p>}

      {!loading && (
        <>
          {/* 📚 COURSES */}
          <h2>📚 Courses</h2>
          {courses.length === 0 ? (
            <p>Tidak ada data</p>
          ) : (
            courses.map((c, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 15,
                  padding: 10,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              >
                <strong>{c.fullname || c.name}</strong>

                {/* 📊 Progress Bar */}
                <div
                  style={{
                    height: 10,
                    background: "#eee",
                    borderRadius: 5,
                    marginTop: 5,
                  }}
                >
                  <div
                    style={{
                      width: `${c.progress || 0}%`,
                      height: "100%",
                      background: "#4caf50",
                      borderRadius: 5,
                    }}
                  />
                </div>

                <small>{c.progress || 0}% selesai</small>
              </div>
            ))
          )}

          {/* ⏰ DEADLINES */}
          <h2>⏰ Deadlines</h2>
          {deadlines.length === 0 ? (
            <p>Tidak ada deadline</p>
          ) : (
            deadlines.map((d, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 15,
                  padding: 10,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              >
                <strong>{d.name}</strong>
                <br />

                📅{" "}
                {d.duedate
                  ? new Date(d.duedate * 1000).toLocaleString("id-ID")
                  : "-"}

                <br />

                ⏳ <b>{getCountdown(d.duedate)}</b>
              </div>
            ))
          )}

          {/* 🔔 NOTIFICATIONS */}
          <h2>🔔 Notifications</h2>
          {notifications.length === 0 ? (
            <p>Tidak ada notifikasi</p>
          ) : (
            notifications.slice(0, 5).map((n, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              >
                {n.subject || n.smallmessage || "No title"}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}