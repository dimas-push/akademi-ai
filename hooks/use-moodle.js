// ═══════════════════════════════════════════════════════════════
//  React Hooks for Moodle Data — useMoodle()
//  Works with /api/moodle/[action] proxy routes
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api/moodle";

/**
 * Generic hook for fetching Moodle data via proxy
 */
export function useMoodleQuery(action, params = {}, options = {}) {
  const { enabled = true, refetchInterval = 0, onSuccess, onError } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const query = new URLSearchParams(params).toString();
      const url = `${API_BASE}/${action}${query ? `?${query}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.message || json.error || "API error");
      }

      setData(json);
      setError(null);
      onSuccess?.(json);
    } catch (e) {
      setError(e.message);
      onError?.(e);
    } finally {
      setLoading(false);
    }
  }, [action, JSON.stringify(params), enabled]);

  useEffect(() => {
    fetchData();
    if (refetchInterval > 0) {
      intervalRef.current = setInterval(fetchData, refetchInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [fetchData, refetchInterval]);

  return { data, loading, error, refetch: fetchData };
}

// ─── Specialized Hooks ───────────────────────────────────────

/**
 * Get enrolled courses
 */
export function useCourses(classification = "inprogress") {
  const { data, ...rest } = useMoodleQuery("courses", { classification });
  return {
    courses: data?.courses?.map((c) => ({
      id: c.id,
      shortname: c.shortname,
      fullname: c.fullname,
      progress: c.progress,
      startdate: c.startdate ? new Date(c.startdate * 1000) : null,
      enddate: c.enddate ? new Date(c.enddate * 1000) : null,
      courseimage: c.courseimage,
    })) || [],
    ...rest,
  };
}

/**
 * Get all assignments with deadlines
 */
export function useAssignments() {
  const { data, ...rest } = useMoodleQuery("assignments");
  const assignments = [];
  if (data?.courses) {
    for (const course of data.courses) {
      for (const a of course.assignments || []) {
        assignments.push({
          id: a.id,
          cmid: a.cmid,
          courseId: course.id,
          courseName: course.shortname || course.fullname,
          name: a.name,
          intro: a.intro?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
          duedate: a.duedate ? new Date(a.duedate * 1000) : null,
          cutoffdate: a.cutoffdate ? new Date(a.cutoffdate * 1000) : null,
          nosubmissions: a.nosubmissions,
        });
      }
    }
    assignments.sort((a, b) => (a.duedate || Infinity) - (b.duedate || Infinity));
  }
  return { assignments, ...rest };
}

/**
 * Get upcoming deadlines from calendar — MOST USEFUL HOOK
 */
export function useDeadlines(limit = 50) {
  const { data, ...rest } = useMoodleQuery("deadlines", { limitnum: limit }, {
    refetchInterval: 15 * 60 * 1000, // Auto-refresh every 15 min
  });
  return {
    deadlines: (data?.events || []).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
      type: e.modulename || e.eventtype,
      courseName: e.course?.shortname || e.course?.fullname || "",
      courseId: e.course?.id,
      date: e.timestart ? new Date(e.timestart * 1000) : null,
      url: e.url,
      action: e.action?.name || null,
      actionable: e.action?.actionable || false,
      overdue: e.overdue || false,
    })),
    ...rest,
  };
}

/**
 * Get grades for a specific course
 */
export function useCourseGrades(courseId) {
  const { data, ...rest } = useMoodleQuery("grades", { courseid: courseId }, {
    enabled: !!courseId,
  });
  return {
    gradeItems: data?.usergrades?.[0]?.gradeitems?.map((g) => ({
      id: g.id,
      name: g.itemname || "Course Total",
      type: g.itemtype,
      module: g.itemmodule,
      grade: g.gradeformatted,
      gradeRaw: g.graderaw,
      gradeMax: g.grademax,
      percentage: g.percentageformatted,
      letterGrade: g.lettergradeformatted,
      feedback: g.feedback?.replace(/<[^>]*>/g, "") || "",
    })) || [],
    ...rest,
  };
}

/**
 * Get overview grades (all courses)
 */
export function useGradesOverview() {
  return useMoodleQuery("grades-overview");
}

/**
 * Get quizzes
 */
export function useQuizzes() {
  const { data, ...rest } = useMoodleQuery("quizzes");
  return {
    quizzes: (data?.quizzes || []).map((q) => ({
      id: q.id,
      courseId: q.course,
      name: q.name,
      intro: q.intro?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
      timeopen: q.timeopen ? new Date(q.timeopen * 1000) : null,
      timeclose: q.timeclose ? new Date(q.timeclose * 1000) : null,
      timelimit: q.timelimit,
      maxGrade: q.grade,
      maxAttempts: q.attempts,
    })),
    ...rest,
  };
}

/**
 * Get notifications
 */
export function useNotifications(limit = 20) {
  const { data, ...rest } = useMoodleQuery("notifications", { limit }, {
    refetchInterval: 5 * 60 * 1000, // Every 5 min
  });
  return {
    notifications: (data?.notifications || []).map((n) => ({
      id: n.id,
      subject: n.subject,
      text: n.smallmessage || n.fullmessage?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
      type: n.component,
      read: n.read,
      time: new Date(n.timecreated * 1000),
      url: n.contexturl,
    })),
    ...rest,
  };
}

/**
 * Get unread notification count
 */
export function useUnreadCount() {
  const { data, ...rest } = useMoodleQuery("unread-count", {}, {
    refetchInterval: 2 * 60 * 1000, // Every 2 min
  });
  return { count: data || 0, ...rest };
}

/**
 * Comprehensive data sync — fetches everything in parallel
 */
export function useMoodleSync() {
  const [syncData, setSyncData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    const results = { courses: [], deadlines: [], assignments: [], quizzes: [], notifications: [], errors: [] };

    const fetches = [
      fetch(`${API_BASE}/courses`).then((r) => r.json()).then((d) => (results.courses = d.courses || [])),
      fetch(`${API_BASE}/deadlines`).then((r) => r.json()).then((d) => (results.deadlines = d.events || [])),
      fetch(`${API_BASE}/assignments`).then((r) => r.json()).then((d) => {
        results.assignments = [];
        for (const c of d.courses || []) for (const a of c.assignments || []) results.assignments.push({ ...a, _courseName: c.shortname });
      }),
      fetch(`${API_BASE}/quizzes`).then((r) => r.json()).then((d) => (results.quizzes = d.quizzes || [])),
      fetch(`${API_BASE}/notifications`).then((r) => r.json()).then((d) => (results.notifications = d.notifications || [])),
    ];

    try {
      const settled = await Promise.allSettled(fetches);
      settled.forEach((r, i) => {
        if (r.status === "rejected") results.errors.push({ index: i, error: r.reason?.message });
      });
      results.timestamp = new Date().toISOString();
      setSyncData(results);
      setLastSync(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }

    return results;
  }, []);

  return { syncData, syncing, lastSync, error, sync };
}
