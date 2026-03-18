// ═══════════════════════════════════════════════════════════════
//  MOODLE API SERVICE — UBP Karawang Elearning Integration
//  Moodle 4.4+ | User ID: 13592 | API: moodle_mobile_app
// ═══════════════════════════════════════════════════════════════

const MOODLE_BASE = "https://elearning.ubpkarawang.ac.id";
const MOODLE_API = `${MOODLE_BASE}/webservice/rest/server.php`;
const MOODLE_TOKEN_URL = `${MOODLE_BASE}/login/token.php`;

// ─── Core API Call ───────────────────────────────────────────

/**
 * Generic Moodle Web Service call
 * @param {string} token - User's wstoken
 * @param {string} wsfunction - Moodle WS function name
 * @param {Object} params - Additional parameters
 * @returns {Promise<Object>} API response
 */
async function moodleCall(token, wsfunction, params = {}) {
  const urlParams = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: "json",
    ...flattenParams(params),
  });

  const response = await fetch(`${MOODLE_API}?${urlParams.toString()}`);
  const data = await response.json();

  if (data.exception) {
    throw new Error(`Moodle API Error: ${data.message} (${data.errorcode})`);
  }

  return data;
}

/**
 * Flatten nested params for Moodle API (e.g., courseids[0]=5)
 */
function flattenParams(params, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object") {
          Object.assign(result, flattenParams(v, `${fullKey}[${i}]`));
        } else {
          result[`${fullKey}[${i}]`] = v;
        }
      });
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenParams(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// ─── Authentication ──────────────────────────────────────────

/**
 * Get API token with username/password
 */
async function getToken(username, password) {
  const params = new URLSearchParams({
    username,
    password,
    service: "moodle_mobile_app",
  });

  const response = await fetch(`${MOODLE_TOKEN_URL}?${params.toString()}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(`Login failed: ${data.error}`);
  }

  return data.token;
}

/**
 * Get site info and validate token
 */
async function getSiteInfo(token) {
  return moodleCall(token, "core_webservice_get_site_info");
}

// ─── Courses ─────────────────────────────────────────────────

/**
 * Get all enrolled courses
 */
async function getEnrolledCourses(token, classification = "all") {
  const data = await moodleCall(token, "core_course_get_enrolled_courses_by_timeline_classification", {
    classification,
  });
  return (data.courses || []).map((c) => ({
    id: c.id,
    shortname: c.shortname,
    fullname: c.fullname,
    summary: c.summary?.replace(/<[^>]*>/g, "") || "",
    startdate: c.startdate ? new Date(c.startdate * 1000).toISOString().split("T")[0] : null,
    enddate: c.enddate ? new Date(c.enddate * 1000).toISOString().split("T")[0] : null,
    progress: c.progress,
    hidden: c.hidden,
    courseimage: c.courseimage,
  }));
}

/**
 * Get full course content (sections, modules)
 */
async function getCourseContents(token, courseId) {
  return moodleCall(token, "core_course_get_contents", { courseid: courseId });
}

// ─── Assignments & Deadlines ─────────────────────────────────

/**
 * Get all assignments across all courses (or specific courses)
 */
async function getAssignments(token, courseIds = []) {
  const params = {};
  if (courseIds.length > 0) {
    params.courseids = courseIds;
  }
  const data = await moodleCall(token, "mod_assign_get_assignments", params);

  const assignments = [];
  for (const course of data.courses || []) {
    for (const assign of course.assignments || []) {
      assignments.push({
        id: assign.id,
        cmid: assign.cmid,
        courseId: course.id,
        courseName: course.shortname || course.fullname,
        name: assign.name,
        intro: assign.intro?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
        duedate: assign.duedate ? new Date(assign.duedate * 1000).toISOString().split("T")[0] : null,
        duedateTimestamp: assign.duedate,
        cutoffdate: assign.cutoffdate ? new Date(assign.cutoffdate * 1000).toISOString().split("T")[0] : null,
        allowsubmissionsfromdate: assign.allowsubmissionsfromdate,
        grade: assign.grade,
        nosubmissions: assign.nosubmissions,
        submissiondrafts: assign.submissiondrafts,
      });
    }
  }

  return assignments.sort((a, b) => (a.duedateTimestamp || Infinity) - (b.duedateTimestamp || Infinity));
}

/**
 * Get submission status for a specific assignment
 */
async function getSubmissionStatus(token, assignId) {
  const data = await moodleCall(token, "mod_assign_get_submission_status", {
    assignid: assignId,
  });

  const submission = data.lastattempt?.submission;
  const grade = data.feedback?.grade;

  return {
    assignId,
    status: submission?.status || "nosubmission", // "new", "draft", "submitted", "nosubmission"
    graded: !!grade,
    gradeValue: grade?.grade || null,
    timecreated: submission?.timecreated
      ? new Date(submission.timecreated * 1000).toISOString()
      : null,
    timemodified: submission?.timemodified
      ? new Date(submission.timemodified * 1000).toISOString()
      : null,
    attemptnumber: submission?.attemptnumber || 0,
    gradedDate: grade?.timemodified
      ? new Date(grade.timemodified * 1000).toISOString()
      : null,
  };
}

/**
 * Get all upcoming deadlines (assignments, quizzes, etc.) via calendar
 * This is the most powerful single endpoint for deadline tracking
 */
async function getUpcomingDeadlines(token, limit = 50) {
  const now = Math.floor(Date.now() / 1000);
  const data = await moodleCall(token, "core_calendar_get_action_events_by_timesort", {
    timesortfrom: now,
    limitnum: limit,
  });

  return (data.events || []).map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
    type: e.modulename || e.eventtype, // "assign", "quiz", "forum", etc.
    courseName: e.course?.shortname || e.course?.fullname || "",
    courseId: e.course?.id,
    timestart: new Date(e.timestart * 1000).toISOString(),
    date: new Date(e.timestart * 1000).toISOString().split("T")[0],
    timesort: e.timesort,
    url: e.url,
    action: e.action?.name || null, // "Submit", "Attempt quiz", etc.
    actionable: e.action?.actionable || false,
    overdue: e.overdue || false,
  }));
}

// ─── Grades ──────────────────────────────────────────────────

/**
 * Get detailed grade items for a specific course
 */
async function getCourseGrades(token, courseId, userId) {
  const data = await moodleCall(token, "gradereport_user_get_grade_items", {
    courseid: courseId,
    userid: userId,
  });

  const userGrades = data.usergrades?.[0];
  if (!userGrades) return [];

  return (userGrades.gradeitems || []).map((g) => ({
    id: g.id,
    itemname: g.itemname || "Course Total",
    itemtype: g.itemtype, // "mod", "course", "category"
    itemmodule: g.itemmodule, // "assign", "quiz", etc.
    graderaw: g.graderaw,
    gradeformatted: g.gradeformatted,
    grademin: g.grademin,
    grademax: g.grademax,
    percentageformatted: g.percentageformatted,
    lettergrade: g.lettergradeformatted,
    feedback: g.feedback?.replace(/<[^>]*>/g, "") || "",
    rank: g.rank,
  }));
}

/**
 * Get overview grades (one grade per course)
 */
async function getAllCourseGrades(token, userId) {
  const data = await moodleCall(token, "gradereport_overview_get_course_grades", {
    userid: userId,
  });

  return (data.grades || []).map((g) => ({
    courseId: g.courseid,
    courseName: g.courseidnumber,
    grade: g.grade,
    rawgrade: g.rawgrade,
    rank: g.rank,
  }));
}

// ─── Quizzes / Exams ─────────────────────────────────────────

/**
 * Get all quizzes across courses
 */
async function getQuizzes(token, courseIds = []) {
  const params = {};
  if (courseIds.length > 0) {
    params.courseids = courseIds;
  }
  const data = await moodleCall(token, "mod_quiz_get_quizzes_by_courses", params);

  return (data.quizzes || []).map((q) => ({
    id: q.id,
    cmid: q.coursemodule,
    courseId: q.course,
    name: q.name,
    intro: q.intro?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
    timeopen: q.timeopen ? new Date(q.timeopen * 1000).toISOString() : null,
    timeclose: q.timeclose ? new Date(q.timeclose * 1000).toISOString() : null,
    timelimit: q.timelimit, // in seconds
    grade: q.grade, // max grade
    attempts: q.attempts, // max attempts allowed
    grademethod: q.grademethod,
  }));
}

/**
 * Get user's quiz attempts
 */
async function getQuizAttempts(token, quizId) {
  const data = await moodleCall(token, "mod_quiz_get_user_attempts", {
    quizid: quizId,
    status: "all",
  });

  return (data.attempts || []).map((a) => ({
    id: a.id,
    quizId: a.quiz,
    attempt: a.attempt,
    state: a.state, // "inprogress", "overdue", "finished", "abandoned"
    timestart: new Date(a.timestart * 1000).toISOString(),
    timefinish: a.timefinish ? new Date(a.timefinish * 1000).toISOString() : null,
    sumgrades: a.sumgrades,
  }));
}

/**
 * Get user's best grade for a quiz
 */
async function getQuizBestGrade(token, quizId) {
  const data = await moodleCall(token, "mod_quiz_get_user_best_grade", {
    quizid: quizId,
  });
  return {
    grade: data.grade,
    gradetopass: data.gradetopass,
    hasgrade: data.hasgrade,
  };
}

// ─── Forum / Announcements ───────────────────────────────────

/**
 * Get all forums in enrolled courses (filter for "news" type = announcements)
 */
async function getForums(token, courseIds = []) {
  const params = {};
  if (courseIds.length > 0) {
    params.courseids = courseIds;
  }
  const data = await moodleCall(token, "mod_forum_get_forums_by_courses", params);

  return (data || []).map((f) => ({
    id: f.id,
    courseId: f.course,
    name: f.name,
    type: f.type, // "news" = announcements, "general", etc.
    intro: f.intro?.replace(/<[^>]*>/g, "") || "",
  }));
}

/**
 * Get discussions (threads) in a forum
 */
async function getForumDiscussions(token, forumId, page = 0, perpage = 10) {
  const data = await moodleCall(token, "mod_forum_get_forum_discussions", {
    forumid: forumId,
    page,
    perpage,
    sortorder: -1, // newest first
  });

  return (data.discussions || []).map((d) => ({
    id: d.discussion,
    name: d.name,
    message: d.message?.replace(/<[^>]*>/g, "").substring(0, 500) || "",
    author: d.userfullname,
    created: new Date(d.created * 1000).toISOString(),
    modified: new Date(d.timemodified * 1000).toISOString(),
    pinned: d.pinned,
    numreplies: d.numreplies,
  }));
}

/**
 * Get all announcements across all courses
 */
async function getAllAnnouncements(token, courseIds = []) {
  const forums = await getForums(token, courseIds);
  const newsForums = forums.filter((f) => f.type === "news");

  const announcements = [];
  for (const forum of newsForums) {
    try {
      const discussions = await getForumDiscussions(token, forum.id, 0, 5);
      for (const d of discussions) {
        announcements.push({
          ...d,
          courseId: forum.courseId,
          forumName: forum.name,
        });
      }
    } catch (e) {
      console.warn(`Failed to get announcements for forum ${forum.id}:`, e.message);
    }
  }

  return announcements.sort((a, b) => new Date(b.created) - new Date(a.created));
}

// ─── Notifications ───────────────────────────────────────────

/**
 * Get popup notifications
 */
async function getNotifications(token, userId, limit = 20) {
  const data = await moodleCall(token, "message_popup_get_popup_notifications", {
    useridto: userId,
    limit,
    offset: 0,
  });

  return (data.notifications || []).map((n) => ({
    id: n.id,
    subject: n.subject,
    text: n.smallmessage || n.fullmessage?.replace(/<[^>]*>/g, "").substring(0, 200) || "",
    fullHtml: n.fullmessagehtml,
    type: n.component, // "mod_assign", "mod_quiz", etc.
    read: n.read,
    timecreated: new Date(n.timecreated * 1000).toISOString(),
    url: n.contexturl,
    iconurl: n.iconurl,
  }));
}

/**
 * Get unread notification count
 */
async function getUnreadNotificationCount(token, userId) {
  const data = await moodleCall(token, "message_popup_get_unread_popup_notification_count", {
    useridto: userId,
  });
  return data || 0;
}

// ─── Calendar ────────────────────────────────────────────────

/**
 * Get monthly calendar view
 */
async function getCalendarMonth(token, year, month) {
  return moodleCall(token, "core_calendar_get_calendar_monthly_view", {
    year,
    month,
  });
}

/**
 * Get upcoming calendar events
 */
async function getCalendarUpcoming(token) {
  return moodleCall(token, "core_calendar_get_calendar_upcoming_view");
}

// ─── Full Sync (Aggregate Everything) ────────────────────────

/**
 * Sync all data in one batch — call this on app load and every 15-30 min
 */
async function fullSync(token, userId) {
  const results = {
    timestamp: new Date().toISOString(),
    courses: [],
    assignments: [],
    deadlines: [],
    grades: {},
    quizzes: [],
    announcements: [],
    notifications: [],
    errors: [],
  };

  try {
    // 1. Get courses
    results.courses = await getEnrolledCourses(token, "inprogress");
  } catch (e) {
    results.errors.push({ step: "courses", error: e.message });
  }

  const courseIds = results.courses.map((c) => c.id);

  // 2. Parallel fetch
  const [assignments, deadlines, quizzes, announcements, notifications] = await Promise.allSettled([
    getAssignments(token, courseIds),
    getUpcomingDeadlines(token, 50),
    getQuizzes(token, courseIds),
    getAllAnnouncements(token, courseIds),
    getNotifications(token, userId, 20),
  ]);

  if (assignments.status === "fulfilled") results.assignments = assignments.value;
  else results.errors.push({ step: "assignments", error: assignments.reason?.message });

  if (deadlines.status === "fulfilled") results.deadlines = deadlines.value;
  else results.errors.push({ step: "deadlines", error: deadlines.reason?.message });

  if (quizzes.status === "fulfilled") results.quizzes = quizzes.value;
  else results.errors.push({ step: "quizzes", error: quizzes.reason?.message });

  if (announcements.status === "fulfilled") results.announcements = announcements.value;
  else results.errors.push({ step: "announcements", error: announcements.reason?.message });

  if (notifications.status === "fulfilled") results.notifications = notifications.value;
  else results.errors.push({ step: "notifications", error: notifications.reason?.message });

  // 3. Get grades per course (sequential to avoid rate limit)
  for (const course of results.courses.slice(0, 15)) {
    try {
      const grades = await getCourseGrades(token, course.id, userId);
      results.grades[course.id] = {
        courseName: course.fullname,
        items: grades,
      };
    } catch (e) {
      results.errors.push({ step: `grades-${course.id}`, error: e.message });
    }
  }

  return results;
}

// ─── Export ───────────────────────────────────────────────────

export {
  // Auth
  getToken,
  getSiteInfo,
  // Courses
  getEnrolledCourses,
  getCourseContents,
  // Assignments
  getAssignments,
  getSubmissionStatus,
  getUpcomingDeadlines,
  // Grades
  getCourseGrades,
  getAllCourseGrades,
  // Quizzes
  getQuizzes,
  getQuizAttempts,
  getQuizBestGrade,
  // Forum
  getForums,
  getForumDiscussions,
  getAllAnnouncements,
  // Notifications
  getNotifications,
  getUnreadNotificationCount,
  // Calendar
  getCalendarMonth,
  getCalendarUpcoming,
  // Full sync
  fullSync,
  // Utilities
  moodleCall,
  MOODLE_BASE,
  MOODLE_API,
};
