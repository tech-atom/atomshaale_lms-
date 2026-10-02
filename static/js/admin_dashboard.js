// ========================================================================
// admin_dashboard.js — Dynamic Admin Dashboard Counters & Live Polling
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Admin Dashboard JS initialized");

  const root = document.getElementById("adminDashboard");
  if (!root) {
    console.error("ERROR: #adminDashboard root element not found.");
    return;
  }

  const statsUrl = root.dataset.statsUrl || "/api/admin/admin/dashboard/stats/";

  const refs = {
    students: document.getElementById("stat-students"),
    colleges: document.getElementById("stat-colleges"),
    courses: document.getElementById("stat-courses"),
    trainers: document.getElementById("stat-trainers"),
    domains: document.getElementById("stat-domains"),
    exams: document.getElementById("stat-exams"),
    sessions: document.getElementById("stat-sessions"),
    feedback: document.getElementById("stat-feedback"),
    activeCollegesNote: document.getElementById("stat-active-colleges-note"),
    sectionsNote: document.getElementById("stat-sections-note"),
    subdomainsNote: document.getElementById("stat-subdomains-note"),
    scheduledExamsNote: document.getElementById("stat-scheduled-exams-note"),
    todaySessionsNote: document.getElementById("stat-today-sessions-note"),
    updatedAt: document.getElementById("statsUpdatedAt")
  };

  // Cache values to check for changes
  const prevValues = {
    students: 0,
    colleges: 0,
    courses: 0,
    trainers: 0,
    domains: 0,
    exams: 0,
    sessions: 0,
    feedback: 0
  };

  function animateValue(el, start, end, duration = 800) {
    if (!el) return;
    
    // Clear any active timer on the element
    clearInterval(el.timer);
    
    const range = end - start;
    if (range === 0) {
      el.textContent = end.toLocaleString();
      return;
    }

    let current = start;
    const stepTime = Math.max(Math.abs(Math.floor(duration / range)), 15);
    const increment = end > start ? Math.ceil(range / (duration / stepTime)) : Math.floor(range / (duration / stepTime));

    el.timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        clearInterval(el.timer);
        el.textContent = end.toLocaleString();
      } else {
        el.textContent = Math.floor(current).toLocaleString();
      }
    }, stepTime);
  }

  function applyStats(stats, updatedAt) {
    if (!stats) return;

    // Animate integer values
    animateValue(refs.students, prevValues.students, Number(stats.students || 0));
    animateValue(refs.colleges, prevValues.colleges, Number(stats.colleges || 0));
    animateValue(refs.courses, prevValues.courses, Number(stats.courses || 0));
    animateValue(refs.trainers, prevValues.trainers, Number(stats.trainers || 0));
    animateValue(refs.domains, prevValues.domains, Number(stats.domains || 0));
    animateValue(refs.exams, prevValues.exams, Number(stats.exams || 0));
    animateValue(refs.sessions, prevValues.sessions, Number(stats.sessions || 0));
    animateValue(refs.feedback, prevValues.feedback, Number(stats.feedback_entries || 0));

    // Store current values for next update cycle
    prevValues.students = Number(stats.students || 0);
    prevValues.colleges = Number(stats.colleges || 0);
    prevValues.courses = Number(stats.courses || 0);
    prevValues.trainers = Number(stats.trainers || 0);
    prevValues.domains = Number(stats.domains || 0);
    prevValues.exams = Number(stats.exams || 0);
    prevValues.sessions = Number(stats.sessions || 0);
    prevValues.feedback = Number(stats.feedback_entries || 0);

    // Update textual notes
    if (refs.activeCollegesNote) {
      refs.activeCollegesNote.textContent = `${stats.active_colleges || 0} currently active`;
    }
    if (refs.sectionsNote) {
      refs.sectionsNote.textContent = `Sections: ${stats.sections || 0}`;
    }
    if (refs.subdomainsNote) {
      refs.subdomainsNote.textContent = `Subdomains: ${stats.subdomains || 0}`;
    }
    if (refs.scheduledExamsNote) {
      refs.scheduledExamsNote.textContent = `Scheduled: ${stats.scheduled_exams || 0}`;
    }
    if (refs.todaySessionsNote) {
      refs.todaySessionsNote.textContent = `Today: ${stats.today_sessions || 0}`;
    }
    if (refs.updatedAt) {
      refs.updatedAt.textContent = `Updated ${updatedAt || "just now"}`;
    }
  }

  async function refreshStats(isInitial = false) {
    try {
      const res = await fetch(statsUrl, {
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      applyStats(data.stats, data.updated_at);
    } catch (err) {
      console.error("Dashboard stats refresh failed:", err);
      if (isInitial) {
        // Fallback to reading the initial DOM text content as baseline
        prevValues.students = Number(refs.students?.textContent || 0);
        prevValues.colleges = Number(refs.colleges?.textContent || 0);
        prevValues.courses = Number(refs.courses?.textContent || 0);
        prevValues.trainers = Number(refs.trainers?.textContent || 0);
        prevValues.domains = Number(refs.domains?.textContent || 0);
        prevValues.exams = Number(refs.exams?.textContent || 0);
        prevValues.sessions = Number(refs.sessions?.textContent || 0);
        prevValues.feedback = Number(refs.feedback?.textContent || 0);
      }
    }
  }

  // Run on startup and poll every 30s
  refreshStats(true);
  setInterval(() => refreshStats(false), 30000);
});
