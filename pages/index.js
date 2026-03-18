import { useEffect, useState } from "react";

async function fetchWithRetry(url, retries = 2) {
  try {
    const res = await fetch(url);

    if (!res.ok) throw new Error("Fetch error");

    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.log("Retrying:", url);
      return fetchWithRetry(url, retries - 1);
    }
    console.error("Failed:", url);
    return [];
  }
}

export default function Home() {
  const [courses, setCourses] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // 🔥 SEQUENTIAL (anti timeout Vercel)
      const coursesData = await fetchWithRetry("/api/moodle/courses");
      setCourses(coursesData);

      const deadlinesData = await fetchWithRetry("/api/moodle/deadlines");
      setDeadlines(deadlinesData);

      const notificationsData = await fetchWithRetry("/api/moodle/notifications");
      setNotifications(notificationsData);

      setLoading(false);
    }

    loadData();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>🎓 Akademi AI Dashboard</h1>

      {loading && <p>Loading data...</p>}

      {!loading && (
        <>
          {/* COURSES */}
          <h2>📚 Courses</h2>
          {courses.length === 0 ? (
            <p>Tidak ada data</p>
          ) : (
            <ul>
              {courses.map((c, i) => (
                <li key={i}>
                  {c.fullname || c.name}{" "}
                  {c.progress !== undefined && `(${c.progress}%)`}
                </li>
              ))}
            </ul>
          )}

          {/* DEADLINES */}
          <h2>⏰ Deadlines</h2>
          {deadlines.length === 0 ? (
            <p>Tidak ada deadline</p>
          ) : (
            <ul>
              {deadlines.map((d, i) => (
                <li key={i}>
                  {d.name} —{" "}
                  {d.duedate
                    ? new Date(d.duedate * 1000).toLocaleString("id-ID")
                    : "-"}
                </li>
              ))}
            </ul>
          )}

          {/* NOTIFICATIONS */}
          <h2>🔔 Notifications</h2>
          {notifications.length === 0 ? (
            <p>Tidak ada notifikasi</p>
          ) : (
            <ul>
              {notifications.map((n, i) => (
                <li key={i}>
                  {n.subject || n.smallmessage || "No title"}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}