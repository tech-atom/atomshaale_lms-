/* static/js/tpo_feedback.js v3.0 */

document.addEventListener("DOMContentLoaded", () => {
  const data = window.fbData || {};

  // ── Live Table Search ──
  const searchInput = document.getElementById("fbSearchInput");
  const tableBody   = document.getElementById("fbTableBody");

  if (searchInput && tableBody) {
    searchInput.addEventListener("keyup", () => {
      const q = searchInput.value.toLowerCase().trim();
      tableBody.querySelectorAll("tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  // ── Quick Date Shortcuts ──
  const dateFrom = document.getElementById("dateFromInput");
  const dateTo   = document.getElementById("dateToInput");
  const form     = document.getElementById("fbFilterForm");

  function fmt(d) {
    // Returns YYYY-MM-DD for a Date object
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function setDates(from, to) {
    if (dateFrom) dateFrom.value = fmt(from);
    if (dateTo)   dateTo.value   = fmt(to);
    // Mark active button
    document.querySelectorAll(".qd-btn").forEach(b => b.classList.remove("active"));
    // Submit the form to apply filter
    if (form) form.submit();
  }

  const today = new Date();

  const qdToday = document.getElementById("qdToday");
  if (qdToday) {
    qdToday.addEventListener("click", () => {
      qdToday.classList.add("active");
      setDates(today, today);
    });
  }

  const qdYesterday = document.getElementById("qdYesterday");
  if (qdYesterday) {
    qdYesterday.addEventListener("click", () => {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      qdYesterday.classList.add("active");
      setDates(y, y);
    });
  }

  const qdThisWeek = document.getElementById("qdThisWeek");
  if (qdThisWeek) {
    qdThisWeek.addEventListener("click", () => {
      const day = today.getDay(); // 0=Sun
      const start = new Date(today);
      start.setDate(today.getDate() - day);   // Sunday
      qdThisWeek.classList.add("active");
      setDates(start, today);
    });
  }

  const qdThisMonth = document.getElementById("qdThisMonth");
  if (qdThisMonth) {
    qdThisMonth.addEventListener("click", () => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      qdThisMonth.classList.add("active");
      setDates(start, today);
    });
  }

  const qdClear = document.getElementById("qdClear");
  if (qdClear) {
    qdClear.addEventListener("click", () => {
      if (dateFrom) dateFrom.value = "";
      if (dateTo)   dateTo.value   = "";
      if (form) form.submit();
    });
  }

  // Highlight the active quick-filter based on current URL params
  (function highlightActive() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("date_from");
    const to   = params.get("date_to");
    if (!from && !to) return;

    const todayStr     = fmt(today);
    const yest         = new Date(today); yest.setDate(today.getDate() - 1);
    const yesterdayStr = fmt(yest);

    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const weekStartStr = fmt(weekStart);

    const monthStart    = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = fmt(monthStart);

    if (from === todayStr     && to === todayStr)     document.getElementById("qdToday")?.classList.add("active");
    if (from === yesterdayStr && to === yesterdayStr) document.getElementById("qdYesterday")?.classList.add("active");
    if (from === weekStartStr && to === todayStr)     document.getElementById("qdThisWeek")?.classList.add("active");
    if (from === monthStartStr && to === todayStr)    document.getElementById("qdThisMonth")?.classList.add("active");
  })();

  if (typeof Chart === "undefined") return;

  const COLORS = {
    green:  "#10b981",
    blue:   "#3b82f6",
    amber:  "#f59e0b",
    purple: "#8b5cf6",
    teal:   "#0d9488",
    rose:   "#f43f5e",
    indigo: "#6366f1",
  };

  // ── 1. Feedback Quality Radar ──
  const radarCanvas = document.getElementById("fbRadarChart");
  if (radarCanvas) {
    new Chart(radarCanvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: ["Content Quality", "Objectives Clarity", "Structure & Logic", "Overall Satisfaction"],
        datasets: [{
          label: "Average Rating",
          data: [
            data.avgContent    || 0,
            data.avgClarity    || 0,
            data.avgLogic      || 0,
            data.avgSatisfaction || 0,
          ],
          backgroundColor: "rgba(13, 148, 136, 0.22)",
          borderColor: "#0d9488",
          borderWidth: 2.5,
          pointBackgroundColor: "#0d9488",
          pointBorderColor: "#fff",
          pointRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            suggestedMin: 0,
            suggestedMax: 5,
            ticks: { stepSize: 1 },
            grid: { color: "rgba(0,0,0,0.07)" },
            angleLines: { color: "rgba(0,0,0,0.07)" },
          }
        }
      }
    });
  }

  // ── 2. Average Rating by Category Bar ──
  const avgBarCanvas = document.getElementById("fbAvgBarChart");
  if (avgBarCanvas) {
    new Chart(avgBarCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Content Quality", "Objectives Clarity", "Structure & Logic", "Satisfaction"],
        datasets: [{
          label: "Avg Rating (1–5)",
          data: [
            data.avgContent      || 0,
            data.avgClarity      || 0,
            data.avgLogic        || 0,
            data.avgSatisfaction || 0,
          ],
          backgroundColor: [COLORS.blue, COLORS.teal, COLORS.purple, COLORS.amber],
          borderRadius: 8,
          barThickness: 36,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 5, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  // ── 3. Session Engagement Doughnut ──
  const engCanvas = document.getElementById("fbEngagementChart");
  if (engCanvas) {
    const engDist = data.engagementDist || {};
    const engLabels = Object.keys(engDist).map(k => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    const engValues = Object.values(engDist);

    new Chart(engCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: engLabels.length > 0 ? engLabels : ["No Data"],
        datasets: [{
          data: engValues.length > 0 ? engValues : [1],
          backgroundColor: [COLORS.green, COLORS.blue, COLORS.amber, COLORS.rose],
          borderWidth: 2,
          borderColor: "#fff",
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  // ── 4. Future Interest Polar Area ──
  const interestCanvas = document.getElementById("fbInterestChart");
  if (interestCanvas) {
    const intDist = data.interestDist || {};
    const intLabels = Object.keys(intDist).map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const intValues = Object.values(intDist);

    new Chart(interestCanvas.getContext("2d"), {
      type: "polarArea",
      data: {
        labels: intLabels.length > 0 ? intLabels : ["No Data"],
        datasets: [{
          data: intValues.length > 0 ? intValues : [1],
          backgroundColor: [
            "rgba(16, 185, 129, 0.75)",
            "rgba(239, 68, 68, 0.75)",
            "rgba(245, 158, 11, 0.75)",
          ],
          borderWidth: 2,
          borderColor: "#fff",
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } }
        },
        scales: { r: { ticks: { display: false } } }
      }
    });
  }

  // ── 5. Trainer Performance Bar Chart ──
  const trainerCanvas = document.getElementById("fbTrainerBarChart");
  if (trainerCanvas) {
    const td = data.trainerChart || {};
    const labels = (td.labels && td.labels.length > 0) ? td.labels : ["No Data"];
    const knowledgeData  = td.knowledge  || [0];
    const paceData       = td.pace       || [0];
    const queriesData    = td.queries    || [0];

    new Chart(trainerCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Knowledge",
            data: knowledgeData,
            backgroundColor: "rgba(13, 148, 136, 0.80)",
            borderRadius: 6,
            barPercentage: 0.65,
          },
          {
            label: "Pace",
            data: paceData,
            backgroundColor: "rgba(59, 130, 246, 0.80)",
            borderRadius: 6,
            barPercentage: 0.65,
          },
          {
            label: "Query Handling",
            data: queriesData,
            backgroundColor: "rgba(245, 158, 11, 0.80)",
            borderRadius: 6,
            barPercentage: 0.65,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} / 5`
            }
          }
        },
        scales: {
          y: {
            min: 0, max: 5,
            ticks: { stepSize: 1 },
            grid: { color: "rgba(0,0,0,0.05)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // ── Trainer Table Live Search ──
  const trainerSearch = document.getElementById("trainerFbSearchInput");
  const trainerBody   = document.getElementById("trainerFbTableBody");
  if (trainerSearch && trainerBody) {
    trainerSearch.addEventListener("keyup", () => {
      const q = trainerSearch.value.toLowerCase().trim();
      trainerBody.querySelectorAll("tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }
});
