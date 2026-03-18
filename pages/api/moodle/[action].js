// ═══════════════════════════════════════════════════════════════
//  Next.js API Route: /api/moodle/[action].js
//  Secure proxy — token stays server-side, never exposed to browser
// ═══════════════════════════════════════════════════════════════
//
//  SETUP:
//  1. Create .env.local with:
//     MOODLE_TOKEN=your_token_here
//     MOODLE_USER_ID=13592
//     MOODLE_BASE_URL=https://elearning.ubpkarawang.ac.id
//
//  2. Place this file at: pages/api/moodle/[action].js
//     OR app/api/moodle/[action]/route.js (for App Router)
//
// ═══════════════════════════════════════════════════════════════

const MOODLE_BASE = process.env.MOODLE_BASE_URL || "https://elearning.ubpkarawang.ac.id";
const MOODLE_API = `${MOODLE_BASE}/webservice/rest/server.php`;
const TOKEN = process.env.MOODLE_TOKEN;
const USER_ID = process.env.MOODLE_USER_ID || "13592";

// Map of allowed actions → Moodle WS function + default params
const ACTION_MAP = {
  // Courses
  courses: {
    fn: "core_course_get_enrolled_courses_by_timeline_classification",
    defaults: { classification: "inprogress" },
  },
  "course-contents": {
    fn: "core_course_get_contents",
    required: ["courseid"],
  },

  // Assignments
  assignments: {
    fn: "mod_assign_get_assignments",
  },
  "submission-status": {
    fn: "mod_assign_get_submission_status",
    required: ["assignid"],
  },

  // Deadlines (calendar events)
  deadlines: {
    fn: "core_calendar_get_action_events_by_timesort",
    defaults: {
      timesortfrom: () => Math.floor(Date.now() / 1000),
      limitnum: 50,
    },
  },

  // Grades
  "grades": {
    fn: "gradereport_user_get_grade_items",
    required: ["courseid"],
    defaults: { userid: USER_ID },
  },
  "grades-overview": {
    fn: "gradereport_overview_get_course_grades",
    defaults: { userid: USER_ID },
  },

  // Quizzes
  quizzes: {
    fn: "mod_quiz_get_quizzes_by_courses",
  },
  "quiz-attempts": {
    fn: "mod_quiz_get_user_attempts",
    required: ["quizid"],
    defaults: { status: "all" },
  },

  // Forum / Announcements
  forums: {
    fn: "mod_forum_get_forums_by_courses",
  },
  "forum-discussions": {
    fn: "mod_forum_get_forum_discussions",
    required: ["forumid"],
    defaults: { page: 0, perpage: 10, sortorder: -1 },
  },

  // Notifications
  notifications: {
    fn: "message_popup_get_popup_notifications",
    defaults: { useridto: USER_ID, limit: 20, offset: 0 },
  },
  "unread-count": {
    fn: "message_popup_get_unread_popup_notification_count",
    defaults: { useridto: USER_ID },
  },

  // Calendar
  "calendar-month": {
    fn: "core_calendar_get_calendar_monthly_view",
    required: ["year", "month"],
  },
  "calendar-upcoming": {
    fn: "core_calendar_get_calendar_upcoming_view",
  },

  // Site info
  "site-info": {
    fn: "core_webservice_get_site_info",
  },
};

// ─── Pages Router Handler ────────────────────────────────────

export default async function handler(req, res) {
  // Only allow GET and POST
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, ...queryParams } = req.query;
  const bodyParams = req.method === "POST" ? req.body : {};
  const params = { ...queryParams, ...bodyParams };

  // Delete the action from params since it's not a Moodle param
  delete params.action;

  // Check if action is valid
  const actionConfig = ACTION_MAP[action];
  if (!actionConfig) {
    return res.status(400).json({
      error: `Unknown action: ${action}`,
      available: Object.keys(ACTION_MAP),
    });
  }

  // Check required params
  if (actionConfig.required) {
    for (const param of actionConfig.required) {
      if (!params[param]) {
        return res.status(400).json({
          error: `Missing required parameter: ${param}`,
          required: actionConfig.required,
        });
      }
    }
  }

  // Build final params (defaults + user params)
  const finalParams = {};
  if (actionConfig.defaults) {
    for (const [key, value] of Object.entries(actionConfig.defaults)) {
      finalParams[key] = typeof value === "function" ? value() : value;
    }
  }
  Object.assign(finalParams, params);

  // Build Moodle API URL
  const urlParams = new URLSearchParams({
    wstoken: TOKEN,
    wsfunction: actionConfig.fn,
    moodlewsrestformat: "json",
    ...flattenParams(finalParams),
  });

  try {
    const response = await fetch(`${MOODLE_API}?${urlParams.toString()}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const data = await response.json();

    // Check for Moodle errors
    if (data.exception) {
      return res.status(502).json({
        error: "Moodle API error",
        message: data.message,
        errorcode: data.errorcode,
      });
    }

    // Set cache headers (5 minute cache for most, 1 min for notifications)
    const cacheDuration = ["notifications", "unread-count"].includes(action) ? 60 : 300;
    res.setHeader("Cache-Control", `s-maxage=${cacheDuration}, stale-while-revalidate`);

    return res.status(200).json(data);
  } catch (error) {
    console.error(`[Moodle Proxy] Error for action ${action}:`, error);
    return res.status(500).json({
      error: "Failed to fetch from Moodle",
      message: error.message,
    });
  }
}

// ─── Utility ─────────────────────────────────────────────────

function flattenParams(params, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object") {
          Object.assign(result, flattenParams(v, `${fullKey}[${i}]`));
        } else {
          result[`${fullKey}[${i}]`] = String(v);
        }
      });
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenParams(value, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

// ─── App Router Version (if using Next.js 13+ App Router) ────
// Place at: app/api/moodle/[action]/route.js
/*
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const action = params.action;
  const queryParams = Object.fromEntries(searchParams.entries());
  // ... same logic as handler above
}

export async function POST(request, { params }) {
  const body = await request.json();
  const action = params.action;
  // ... same logic
}
*/
