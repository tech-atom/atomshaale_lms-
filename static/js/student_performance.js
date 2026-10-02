"use strict";

(function () {
  // --- ENDPOINTS ---
  const URLS = {
    get_performance: "/exam/api/performance/",
  };

  // ====== Escape HTML utility ======
  function escapeHtml(text) {
    return String(text).replace(/[&<>"'`=\/]/g, function (s) {
      return ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;", "`": "&#x60;",
        "=": "&#x3D;", "/": "&#x2F;"
      })[s];
    });
  }

  // ====== Data Storage ======
  let fullData = {
    labels: [],
    scores: [],
    marks: [],
    totals: [],
    statuses: [],
    attempted: [],
    correct: [],
    wrong: [],
    unattempted: [],
    tabSwitches: [],
    timeSpentEachQuestion: [],
    submissionMode: [],
    sectionAnalysis: [],
    submittedAt: [],
  };

  // ====== ECharts Instances ======
  let barChart = null;
  let lineChart = null;
  let pieChart = null;
  let sparkChart = null;

  // ====== Destroy Charts ======
  function destroyCharts() {
    if (barChart) { barChart.dispose(); barChart = null; }
    if (lineChart) { lineChart.dispose(); lineChart = null; }
    if (pieChart) { pieChart.dispose(); pieChart = null; }
    if (sparkChart) { sparkChart.dispose(); sparkChart = null; }
  }

  // ====== Chart Rendering ======
  function renderCharts(labels = fullData.labels, scores = fullData.scores) {
    const isDark = document.body.classList.contains("dark-mode");
    const textColor = isDark ? "#ffffff" : "#000000";
    const subTextColor = isDark ? "#aaaaaa" : "#64748b";
    const axisLineColor = isDark ? "#444444" : "#e2e8f0";
    const tooltipBg = isDark ? "rgba(20, 20, 20, 0.95)" : "rgba(255, 255, 255, 0.95)";
    const tooltipBorder = isDark ? "#008037" : "#008037";
    const splitLineColor = isDark ? "#2d2d2d" : "#f1f5f9";

    // --- Bar Chart ---
    const barDom = document.getElementById('barChart');
    if (barDom) {
      if (!barChart) barChart = echarts.init(barDom);
      const barOption = {
        grid: { top: 15, bottom: 25, left: 35, right: 10 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: textColor, fontFamily: "Century Gothic", fontSize: 11 }
        },
        xAxis: {
          data: labels,
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: subTextColor, fontWeight: "bold", fontFamily: "Century Gothic", fontSize: 9 },
          axisTick: { show: false }
        },
        yAxis: {
          max: 100,
          splitLine: { lineStyle: { type: "dashed", color: splitLineColor } },
          axisLabel: { color: subTextColor, fontFamily: "Century Gothic", fontSize: 9 }
        },
        series: [
          {
            type: 'bar',
            barWidth: 15,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#34d399" },
                { offset: 1, color: "#008037" }
              ]),
              borderRadius: [4, 4, 0, 0]
            },
            data: scores,
          }
        ]
      };
      barChart.setOption(barOption);
    }

    // --- Line Chart ---
    const lineDom = document.getElementById('lineChart');
    if (lineDom) {
      if (!lineChart) lineChart = echarts.init(lineDom);
      const lineOption = {
        grid: { top: 15, bottom: 25, left: 35, right: 10 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: textColor, fontFamily: "Century Gothic", fontSize: 11 }
        },
        xAxis: {
          type: "category",
          data: labels,
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: subTextColor, fontWeight: "bold", fontFamily: "Century Gothic", fontSize: 9 },
          axisTick: { show: false }
        },
        yAxis: {
          type: "value",
          max: 100,
          splitLine: { lineStyle: { type: "dashed", color: splitLineColor } },
          axisLabel: { color: subTextColor, fontFamily: "Century Gothic", fontSize: 9 }
        },
        series: [
          {
            data: scores,
            type: "line",
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              width: 3,
              color: '#008037'
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(0, 128, 55, 0.15)" },
                { offset: 1, color: "rgba(0, 128, 55, 0)" }
              ])
            },
            itemStyle: {
              color: "#008037",
              borderWidth: 2,
              borderColor: isDark ? "#121212" : "#fff"
            }
          }
        ]
      };
      lineChart.setOption(lineOption);
    }

    // --- Donut Chart ---
    const pieDom = document.getElementById('pieChart');
    if (pieDom) {
      if (!pieChart) pieChart = echarts.init(pieDom);

      const totalCorrect = fullData.correct.reduce((a, b) => a + b, 0);
      const totalWrong = fullData.wrong.reduce((a, b) => a + b, 0);
      const totalUnattempted = fullData.unattempted.reduce((a, b) => a + b, 0);

      const pieOption = {
        tooltip: {
          trigger: 'item',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: textColor, fontFamily: "Century Gothic", fontSize: 11 }
        },
        series: [
          {
            name: "Attempts",
            type: "pie",
            radius: ["65%", "90%"],
            center: ["50%", "50%"],
            avoidLabelOverlap: false,
            label: { show: false },
            data: [
              { value: totalCorrect, name: "Correct", itemStyle: { color: "#008037" } },
              { value: totalWrong, name: "Wrong", itemStyle: { color: "#ef4444" } },
              { value: totalUnattempted, name: "Unattempted", itemStyle: { color: "#3b82f6" } }
            ]
          }
        ]
      };
      pieChart.setOption(pieOption);
    }
  }

  // ====== Table & Card Updates ======
  function updateTable(filterExam = "all", searchQuery = "") {
    const table = document.getElementById("performanceTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    let rowsAdded = 0;
    for (let i = 0; i < fullData.labels.length; i++) {
      const examName = fullData.labels[i];

      // Filter by Exam dropdown selection
      if (filterExam !== "all" && examName !== filterExam) continue;

      // Filter by Search searchbox
      if (searchQuery !== "" && !examName.toLowerCase().includes(searchQuery)) continue;

      const row = document.createElement('tr');

      // Index column
      const tdNum = document.createElement('td');
      tdNum.textContent = String(rowsAdded + 1);

      const tdExam = document.createElement('td');
      tdExam.textContent = examName;

      const tdMarks = document.createElement('td');
      tdMarks.textContent = String(fullData.marks[i] ?? 0);

      const tdTotal = document.createElement('td');
      tdTotal.textContent = String(fullData.totals[i] ?? 0);

      const tdScore = document.createElement('td');
      tdScore.textContent = String(Math.round(fullData.scores[i])) + "%";

      const tdAttempted = document.createElement('td');
      tdAttempted.textContent = String(fullData.attempted[i] ?? 0);

      const tdCorrect = document.createElement('td');
      const correctVal = fullData.correct[i] ?? 0;
      tdCorrect.textContent = String(correctVal);
      if (correctVal > 0) tdCorrect.classList.add("txt-green");

      const tdWrong = document.createElement('td');
      const wrongVal = fullData.wrong[i] ?? 0;
      tdWrong.textContent = String(wrongVal);
      if (wrongVal > 0) tdWrong.classList.add("txt-red");

      const tdUnattempted = document.createElement('td');
      const unattemptedVal = fullData.unattempted[i] ?? 0;
      tdUnattempted.textContent = String(unattemptedVal);
      if (unattemptedVal > 0) tdUnattempted.classList.add("txt-muted");

      const tdTabSwitch = document.createElement('td');
      tdTabSwitch.textContent = String(fullData.tabSwitches[i] ?? 0);

      const tdTimeSpent = document.createElement('td');
      tdTimeSpent.textContent = String(fullData.timeSpentEachQuestion[i] || "-");

      const tdSubmittedAt = document.createElement('td');
      tdSubmittedAt.textContent = String(fullData.submittedAt[i] || "-");

      row.appendChild(tdNum);
      row.appendChild(tdExam);
      row.appendChild(tdMarks);
      row.appendChild(tdTotal);
      row.appendChild(tdScore);
      row.appendChild(tdAttempted);
      row.appendChild(tdCorrect);
      row.appendChild(tdWrong);
      row.appendChild(tdUnattempted);
      row.appendChild(tdTabSwitch);
      row.appendChild(tdTimeSpent);
      row.appendChild(tdSubmittedAt);

      tbody.appendChild(row);
      rowsAdded++;
    }

    const msg = document.getElementById("performanceMessage");
    if (msg) {
      msg.textContent = rowsAdded === 0 ? "No performance records matches the criteria." : "";
    }
  }

  // ====== Update Dashboard Cards ======
  function populateDashboardMetrics(data) {
    const labels = data.labels || [];
    const scores = data.scores || [];
    const marks = data.marks || [];
    const totals = data.totals || [];
    const correct = data.correct_answers || [];
    const wrong = data.wrong_answers || [];
    const unattempted = data.unattempted_questions || [];

    // 1. Average Score Circular Gauge
    const sumMarks = marks.reduce((a, b) => a + (b || 0), 0);
    const sumTotals = totals.reduce((a, b) => a + (b || 0), 0);
    const avgScore = sumTotals > 0 ? (sumMarks / sumTotals) * 100 : 0.0;
    const roundedAvg = Math.round(avgScore);

    const fillEl = document.getElementById("avgScoreGaugeFill");
    if (fillEl) {
      const circ = 251.2;
      const offset = circ - (roundedAvg / 100) * circ;
      fillEl.style.strokeDashoffset = offset;
    }
    const percentEl = document.getElementById("avgScorePercent");
    if (percentEl) percentEl.textContent = `${roundedAvg}%`;

    // 2. Average Score Sparkline (Mini spline wave chart)
    const sparklineDom = document.getElementById('avgScoreSparkline');
    if (sparklineDom && scores.length > 0) {
      if (!sparkChart) sparkChart = echarts.init(sparklineDom);
      const sparkOption = {
        grid: { top: 2, bottom: 2, left: 2, right: 2 },
        xAxis: { type: 'category', show: false, data: labels },
        yAxis: { type: 'value', show: false, min: 0, max: 100 },
        series: [{
          data: scores,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#008037', width: 2.2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 128, 55, 0.15)' },
              { offset: 1, color: 'rgba(0, 128, 55, 0)' }
            ])
          }
        }]
      };
      sparkChart.setOption(sparkOption);
    }

    // 3. Mini metrics values
    const examsTakenVal = document.getElementById("examsTakenVal");
    if (examsTakenVal) examsTakenVal.textContent = String(labels.length);

    const totalCorrect = correct.reduce((a, b) => a + (b || 0), 0);
    const totalWrong = wrong.reduce((a, b) => a + (b || 0), 0);
    const totalUnattempted = unattempted.reduce((a, b) => a + (b || 0), 0);
    const totalQuestions = totalCorrect + totalWrong + totalUnattempted;

    const totalQuestionsVal = document.getElementById("totalQuestionsVal");
    if (totalQuestionsVal) totalQuestionsVal.textContent = String(totalQuestions);

    const correctAnswersVal = document.getElementById("correctAnswersVal");
    if (correctAnswersVal) correctAnswersVal.textContent = String(totalCorrect);

    const wrongAnswersVal = document.getElementById("wrongAnswersVal");
    if (wrongAnswersVal) wrongAnswersVal.textContent = String(totalWrong);

    const unattemptedVal = document.getElementById("unattemptedVal");
    if (unattemptedVal) unattemptedVal.textContent = String(totalUnattempted);

    // 4. Donut Central value & custom legends rates
    const donutTotalVal = document.getElementById("donutTotalVal");
    if (donutTotalVal) donutTotalVal.textContent = String(totalQuestions);

    const donutCorrectPct = document.getElementById("donutCorrectPct");
    if (donutCorrectPct) {
      const pct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      donutCorrectPct.textContent = `${totalCorrect} (${pct}%)`;
    }
    const donutWrongPct = document.getElementById("donutWrongPct");
    if (donutWrongPct) {
      const pct = totalQuestions > 0 ? Math.round((totalWrong / totalQuestions) * 100) : 0;
      donutWrongPct.textContent = `${totalWrong} (${pct}%)`;
    }
    const donutUnattemptedPct = document.getElementById("donutUnattemptedPct");
    if (donutUnattemptedPct) {
      const pct = totalQuestions > 0 ? Math.round((totalUnattempted / totalQuestions) * 100) : 0;
      donutUnattemptedPct.textContent = `${totalUnattempted} (${pct}%)`;
    }

    // 5. Summary and time spent indicators
    const summary = data.summary || {};

    const timeSpentVal = document.getElementById("timeSpentVal");
    if (timeSpentVal) timeSpentVal.textContent = summary.total_time_spent || "00:00:00";

    const highestScoreVal = document.getElementById("highestScoreVal");
    if (highestScoreVal) highestScoreVal.textContent = summary.highest_score || "0%";

    const lowestScoreVal = document.getElementById("lowestScoreVal");
    if (lowestScoreVal) lowestScoreVal.textContent = summary.lowest_score || "0%";

    const bestSubjectVal = document.getElementById("bestSubjectVal");
    if (bestSubjectVal) bestSubjectVal.textContent = summary.best_subject || "-";

    const mostAttemptedVal = document.getElementById("mostAttemptedVal");
    if (mostAttemptedVal) mostAttemptedVal.textContent = summary.most_attempted_subject || "-";

    const avgTimePerQuestionVal = document.getElementById("avgTimePerQuestionVal");
    if (avgTimePerQuestionVal) avgTimePerQuestionVal.textContent = summary.avg_time_per_question || "00:00:00";

    // 6. Populate dropdown filter list with all the distinct exams
    const filterSelect = document.getElementById("examFilterSelect");
    if (filterSelect) {
      // Keep "All Exams" option, remove rest
      filterSelect.innerHTML = '<option value="all">All Exams</option>';
      labels.forEach(lbl => {
        const opt = document.createElement("option");
        opt.value = lbl;
        opt.textContent = lbl;
        filterSelect.appendChild(opt);
      });
    }
  }

  // ====== Fetch Performance Data ======
  function fetchPerformance() {
    fetch(URLS.get_performance, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data.labels || data.labels.length === 0) {
          const msg = document.getElementById("performanceMessage");
          if (msg) msg.textContent = "No performance data available.";
          return;
        }

        fullData = {
          labels: (data.labels || []).map(escapeHtml),
          scores: (data.scores || []).map(s => parseFloat(s)),
          marks: (data.marks || []).map(s => s == null ? 0 : parseFloat(s)),
          totals: (data.totals || []).map(s => s == null ? 0 : parseFloat(s)),
          statuses: (data.statuses || []).map(escapeHtml),
          attempted: (data.attempted_questions || []).map(Number),
          correct: (data.correct_answers || []).map(Number),
          wrong: (data.wrong_answers || []).map(Number),
          unattempted: (data.unattempted_questions || []).map(Number),
          tabSwitches: (data.tab_switch_count || []).map(Number),
          timeSpentEachQuestion: (data.time_spent_each_question || []).map(escapeHtml),
          submissionMode: (data.submission_mode || []).map(escapeHtml),
          sectionAnalysis: (data.section_analysis || []).map(escapeHtml),
          submittedAt: (data.submitted_at || []).map(escapeHtml),
        };

        populateDashboardMetrics(data);
        renderCharts();
        updateTable();
      })
      .catch(err => {
        console.error("Error fetching performance data:", err);
        const msg = document.getElementById("performanceMessage");
        if (msg) msg.textContent = "Error loading charts.";
      });
  }

  // ====== DOM Ready Logic ======
  document.addEventListener("DOMContentLoaded", () => {
    // Only run on the correct page
    const barEl = document.getElementById("barChart");
    const lineEl = document.getElementById("lineChart");
    const pieEl = document.getElementById("pieChart");
    if (!(barEl && lineEl && pieEl)) return;

    fetchPerformance();

    // Wire up Exam dropdown selector filter
    const filterSelect = document.getElementById("examFilterSelect");
    const searchInput = document.getElementById("examSearchInput");

    function handleFilters() {
      const activeExam = filterSelect ? filterSelect.value : "all";
      const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

      // Filter the data shown in bar/line charts
      const filteredIndexes = [];
      for (let i = 0; i < fullData.labels.length; i++) {
        const examName = fullData.labels[i];
        if (activeExam !== "all" && examName !== activeExam) continue;
        if (query !== "" && !examName.toLowerCase().includes(query)) continue;
        filteredIndexes.push(i);
      }

      const filteredLabels = filteredIndexes.map(i => fullData.labels[i]);
      const filteredScores = filteredIndexes.map(i => fullData.scores[i]);

      if (barChart) {
        barChart.setOption({
          xAxis: { data: filteredLabels },
          series: [{ data: filteredScores }]
        });
      }
      if (lineChart) {
        lineChart.setOption({
          xAxis: { data: filteredLabels },
          series: [{ data: filteredScores }]
        });
      }

      updateTable(activeExam, query);
    }

    if (filterSelect) {
      filterSelect.addEventListener("change", handleFilters);
    }

    if (searchInput) {
      searchInput.addEventListener("input", handleFilters);
    }

    // Toggle Table visibility button
    const toggleTableEl = document.getElementById("toggleTable");
    if (toggleTableEl) {
      toggleTableEl.addEventListener("click", () => {
        const tableCard = document.querySelector(".detailed-perf-card");
        if (tableCard) {
          const isHidden = tableCard.style.display === "none";
          tableCard.style.display = isHidden ? "block" : "none";

          // Update button text and icon
          const textSpan = toggleTableEl.querySelector("span");
          if (textSpan) textSpan.textContent = isHidden ? "Hide Table" : "Show Table";

          toggleTableEl.innerHTML = isHidden
            ? `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hide Table</span>`
            : `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg><span>Show Table</span>`;
        }
      });
    }

    // ECharts responsiveness resize
    window.addEventListener("resize", () => {
      if (barChart) barChart.resize();
      if (lineChart) lineChart.resize();
      if (pieChart) pieChart.resize();
      if (sparkChart) sparkChart.resize();
    });

    // Theme Change Handler
    window.addEventListener("themechange", () => {
      destroyCharts();
      renderCharts();
    });
  });

})();
