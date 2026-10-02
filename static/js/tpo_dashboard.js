/* static/js/tpo_dashboard.js v5.0
   Fetches all data from /tpo/dashboard/data/ (college-scoped AJAX endpoint)
   and populates the futuristic TPO Command Center dashboard.
*/

document.addEventListener("DOMContentLoaded", () => {

  /* ─── Live Date Badge ─── */
  const dateEl = document.getElementById("liveDateStr");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });
  }

  /* ─── Animated Number Counter ─── */
  function animateVal(el, target, suffix = "%", duration = 900) {
    if (!el) return;
    const start = performance.now();
    const from = 0;
    const to = parseFloat(target) || 0;
    function step(ts) {
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const cur = from + (to - from) * eased;
      el.textContent = (to % 1 === 0 ? Math.floor(cur) : cur.toFixed(1)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ─── Set progress bar width ─── */
  function setBar(id, value, max = 100) {
    const el = document.getElementById(id);
    if (el) setTimeout(() => { el.style.width = Math.min((value / max) * 100, 100) + "%"; }, 200);
  }

  /* ─── Score pill class ─── */
  function scoreClass(v) {
    if (v >= 75) return "s-high";
    if (v >= 50) return "s-mid";
    return "s-low";
  }

  /* ─── Tier badge ─── */
  function tierBadge(v) {
    if (v >= 85) return `<span class="tier-badge tier-excellent"><svg viewBox="0 0 24 24" width="12" height="12" fill="#f5b301" stroke="#f5b301" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Excellent</span>`;
    if (v >= 70) return `<span class="tier-badge tier-good"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Good</span>`;
    if (v >= 50) return `<span class="tier-badge tier-average"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Average</span>`;
    return `<span class="tier-badge tier-poor"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Needs Focus</span>`;
  }

  /* ─── Rank badge ─── */
  function rankBadge(n) {
    const icons = {
      1: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:2px; color:#eab308;"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> 1`,
      2: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:2px; color:#94a3b8;"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> 2`,
      3: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:2px; color:#b45309;"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> 3`
    };
    const cls = n <= 3 ? `rank-${n}` : "rank-n";
    return `<span class="rank-badge ${cls}">${icons[n] || n}</span>`;
  }

  /* ─── Chart color palette ─── */
  const COLORS = {
    green:  "#10b981",
    blue:   "#3b82f6",
    purple: "#8b5cf6",
    amber:  "#f59e0b",
    teal:   "#0d9488",
    indigo: "#6366f1",
    rose:   "#f43f5e",
    gray:   "#9ca3af",
  };

  /* ═══════════════════════════════════════════════
     CHART INSTANCES (pre-built, data filled later)
     ═══════════════════════════════════════════════ */
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded.");
    return;
  }

  /* 1. Radar Chart */
  const radarCanvas = document.getElementById("competencyRadar");
  let radarChart = null;
  if (radarCanvas) {
    radarChart = new Chart(radarCanvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: ["Exam Score", "Practice", "Attendance", "Feedback", "Placement Index"],
        datasets: [{
          label: "Competency (%)",
          data: [0, 0, 0, 0, 0],
          backgroundColor: "rgba(13,148,136,0.18)",
          borderColor: "#0d9488",
          borderWidth: 2.5,
          pointBackgroundColor: "#0d9488",
          pointBorderColor: "#fff",
          pointRadius: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            angleLines: { color: "rgba(0,0,0,0.07)" },
            grid: { color: "rgba(0,0,0,0.07)" },
            suggestedMin: 0, suggestedMax: 100,
            ticks: { backdropColor: "transparent", color: "#9ca3af", font: { size: 10 } },
            pointLabels: { color: "#374151", font: { size: 11, weight: "700" } }
          }
        }
      }
    });
  }

  /* 2. Polar Area (Tier Distribution) */
  const polarCanvas = document.getElementById("tierPolarArea");
  let polarChart = null;
  if (polarCanvas) {
    polarChart = new Chart(polarCanvas.getContext("2d"), {
      type: "polarArea",
      data: {
        labels: ["Excellent (≥85%)", "Good (70-84%)", "Average (50-69%)", "Needs Focus (<50%)"],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: [
            "rgba(16,185,129,0.78)",
            "rgba(59,130,246,0.78)",
            "rgba(245,158,11,0.78)",
            "rgba(244,63,94,0.78)",
          ],
          borderWidth: 2, borderColor: "#fff",
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { r: { ticks: { display: false }, grid: { color: "rgba(0,0,0,0.05)" } } }
      }
    });
  }

  /* 3. Attendance Trend Line */
  const trendCanvas = document.getElementById("attendanceTrend");
  let trendChart = null;
  if (trendCanvas) {
    trendChart = new Chart(trendCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Attendance %",
          data: [],
          borderColor: "#008037",
          backgroundColor: "rgba(0,128,55,0.10)",
          borderWidth: 2.5,
          pointBackgroundColor: "#008037",
          pointRadius: 4,
          tension: 0.4, fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  /* 4. Feedback Bar */
  const feedbackCanvas = document.getElementById("feedbackChart");
  let feedbackChart = null;
  if (feedbackCanvas) {
    feedbackChart = new Chart(feedbackCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Content Quality", "Objectives Clarity", "Structure & Logic", "Satisfaction"],
        datasets: [{
          label: "Avg Rating (1-5)",
          data: [0, 0, 0, 0],
          backgroundColor: [COLORS.teal, COLORS.indigo, COLORS.purple, COLORS.amber],
          borderRadius: 8, barThickness: 32,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  /* 5. Course Performance Grouped Bar */
  const courseCanvas = document.getElementById("courseChart");
  let courseChart = null;
  if (courseCanvas) {
    courseChart = new Chart(courseCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            label: "Exam Avg %",
            data: [],
            backgroundColor: "rgba(99,102,241,0.82)",
            borderRadius: 6, barPercentage: 0.55,
          },
          {
            label: "Practice Avg %",
            data: [],
            backgroundColor: "rgba(16,185,129,0.82)",
            borderRadius: 6, barPercentage: 0.55,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════
     FETCH DATA FROM AJAX ENDPOINT
     ═══════════════════════════════════════════════ */
  fetch("/tpo/dashboard/data/")
    .then(res => {
      if (!res.ok) throw new Error("Dashboard data fetch failed: " + res.status);
      return res.json();
    })
    .then(d => {

      /* ── Metric Cards ── */
      animateVal(document.getElementById("avg-attendance"), d.avg_attendance, "%");
      animateVal(document.getElementById("avg-exam"), d.avg_exam, "%");
      animateVal(document.getElementById("avg-practice"), d.avg_practice, "%");
      animateVal(document.getElementById("placement-readiness"), d.placement_readiness, "%");

      setBar("bar-attendance", d.avg_attendance);
      setBar("bar-exam",       d.avg_exam);
      setBar("bar-practice",   d.avg_practice);
      setBar("bar-readiness",  d.placement_readiness);

      /* ── Radar ── */
      if (radarChart && d.radar_metrics) {
        radarChart.data.datasets[0].data = d.radar_metrics;
        radarChart.update();
      }

      /* ── Tier Polar ── */
      if (polarChart && d.performance_tiers) {
        const t = d.performance_tiers;
        polarChart.data.datasets[0].data = [t.excellent, t.good, t.average, t.poor];
        polarChart.update();

        const se = document.getElementById("cnt-excellent");
        const sg = document.getElementById("cnt-good");
        const sa = document.getElementById("cnt-avg");
        const sp = document.getElementById("cnt-poor");
        if (se) se.textContent = t.excellent;
        if (sg) sg.textContent = t.good;
        if (sa) sa.textContent = t.average;
        if (sp) sp.textContent = t.poor;
      }

      /* ── Attendance Trend ── */
      if (trendChart && d.attendance_trend && d.attendance_trend.length > 0) {
        trendChart.data.labels  = d.attendance_trend.map(x => x.month);
        trendChart.data.datasets[0].data = d.attendance_trend.map(x => x.attendance);
        trendChart.update();
      }

      /* ── Feedback Chart ── */
      if (feedbackChart && d.feedback_summary) {
        const fb = d.feedback_summary;
        feedbackChart.data.datasets[0].data = [
          fb.content_rating,
          fb.objectives_clarity,
          fb.structure_logic,
          fb.satisfaction,
        ];
        feedbackChart.update();
      }

      /* ── Course Performance Chart ── */
      if (courseChart && d.course_performance && d.course_performance.length > 0) {
        courseChart.data.labels = d.course_performance.map(c => c.course);
        courseChart.data.datasets[0].data = d.course_performance.map(c => c.exam_avg);
        courseChart.data.datasets[1].data = d.course_performance.map(c => c.practice_avg);
        courseChart.update();
      }

      /* ── Top Students Table ── */
      const tbody = document.getElementById("topStudentsTableBody");
      if (tbody && d.top_students && d.top_students.length > 0) {
        tbody.innerHTML = d.top_students.map((s, i) => {
          const n = i + 1;
          const eCls = scoreClass(s.avg_exam);
          const pCls = scoreClass(s.avg_practice);
          return `
            <tr>
              <td>${rankBadge(n)}</td>
              <td class="student-name-cell">${s.name}</td>
              <td><span class="usn-mono">${s.usn}</span></td>
              <td>${s.course}</td>
              <td><span class="score-pill ${eCls}">${s.avg_exam.toFixed(1)}%</span></td>
              <td><span class="score-pill ${pCls}">${s.avg_practice.toFixed(1)}%</span></td>
              <td><strong>${s.overall.toFixed(1)}%</strong></td>
              <td>${tierBadge(s.overall)}</td>
            </tr>`;
        }).join("");
      } else if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No student performance data available.</td></tr>`;
      }

    })
    .catch(err => {
      console.error("TPO Dashboard AJAX error:", err);
      const tbody = document.getElementById("topStudentsTableBody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Could not load data. Please refresh.</td></tr>`;
    });

}); // end DOMContentLoaded
