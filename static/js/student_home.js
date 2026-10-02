"use strict";

(function () {
  let charts = [];
  let cachedData = null;

  // ========== Fetch Data ==========
  async function fetchDashboardData() {
    const root = document.getElementById("studentDashboardRoot");
    if (!root) return null;
    const url = root.getAttribute("data-api-url");
    if (!url) {
      console.error("Missing dashboard API URL");
      return null;
    }
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        console.error("Dashboard API returned non-OK response", res.status, res.statusText);
        return null;
      }
      return await res.json();
    } catch (e) {
      console.error("Failed to load dashboard metrics", e);
      return null;
    }
  }

  // ========== Destroy Previous Charts ==========
  function destroyCharts() {
    charts.forEach(c => {
      try { c.dispose(); } catch (err) { }
    });
    charts = [];
  }

  // ========== Render Sparklines (Card Mini Charts) ==========
  function renderSparkline(domId, color, scoreArray) {
    const dom = document.getElementById(domId);
    if (!dom) return;
    const chart = echarts.init(dom);
    const option = {
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'category', show: false },
      yAxis: { type: 'value', show: false },
      series: [{
        data: scoreArray,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '33' },
            { offset: 1, color: color + '00' }
          ])
        }
      }]
    };
    chart.setOption(option);
    charts.push(chart);
  }

  // ========== Main Render Charts ==========
  function renderCharts(data) {
    destroyCharts();

    const isDark = document.body.classList.contains("dark-mode");
    const textColor = isDark ? "#ffffff" : "#000000";
    const subTextColor = isDark ? "#aaaaaa" : "#666666";
    const axisLineColor = isDark ? "#444444" : "#e2e8f0";
    const tooltipBg = isDark ? "rgba(20, 20, 20, 0.95)" : "rgba(255, 255, 255, 0.95)";
    const tooltipBorder = isDark ? "#008037" : "#008037";

    // 1. Sparklines Injection
    const attPct = data.attendance && data.attendance.percentage !== undefined && data.attendance.percentage !== null ? data.attendance.percentage : 0;
    const exAvg = data.performance && data.performance.exam_avg !== undefined && data.performance.exam_avg !== null ? data.performance.exam_avg : 0;
    const prAvg = data.performance && data.performance.practice_avg !== undefined && data.performance.practice_avg !== null ? data.performance.practice_avg : 0;
    const ovAvg = data.performance && data.performance.overall_avg !== undefined && data.performance.overall_avg !== null ? data.performance.overall_avg : 0;

    const attSpark = (data.attendance && data.attendance.sparkline && data.attendance.sparkline.length) ? data.attendance.sparkline : [0, 0, 0, 0, 0, 0];
    const exSpark = (data.performance && data.performance.exam_sparkline && data.performance.exam_sparkline.length) ? data.performance.exam_sparkline : [0, 0, 0, 0, 0, 0];
    const prSpark = (data.performance && data.performance.practice_sparkline && data.performance.practice_sparkline.length) ? data.performance.practice_sparkline : [0, 0, 0, 0, 0, 0];
    const ovSpark = (data.performance && data.performance.overall_sparkline && data.performance.overall_sparkline.length) ? data.performance.overall_sparkline : [0, 0, 0, 0, 0, 0];

    renderSparkline('sparklineAttendance', '#008037', attSpark);
    renderSparkline('sparklineExam', '#2563eb', exSpark);
    renderSparkline('sparklinePractice', '#7c3aed', prSpark);
    renderSparkline('sparklineOverall', '#d97706', ovSpark);

    // 2. 3D-Styled Column Chart (Exam vs Practice)
    const barDom = document.getElementById("barChart");
    if (barDom) {
      const barChart = echarts.init(barDom);
      const topBarData = [exAvg, prAvg];

      const barOption = {
        grid: { top: 50, bottom: 40, left: 45, right: 15 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: textColor, fontFamily: 'Century Gothic' }
        },
        xAxis: {
          data: ["Exam Avg", "Practice Avg"],
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: textColor, fontWeight: "bold", fontFamily: "Century Gothic", fontSize: 12 },
          axisTick: { show: false }
        },
        yAxis: {
          splitLine: { lineStyle: { type: "dashed", color: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 128, 55, 0.06)" } },
          axisLabel: { color: textColor, fontFamily: "Century Gothic" }
        },
        series: [
          // Lower Cylinder Cap
          {
            type: 'pictorialBar',
            symbol: 'ellipse',
            symbolSize: [50, 15],
            symbolOffset: [0, 7],
            symbolPosition: 'start',
            itemStyle: {
              color: function (params) {
                return params.dataIndex === 0 ? '#006026' : '#1d4ed8';
              }
            },
            data: topBarData,
            z: 10
          },
          // Main Body Bar
          {
            type: 'bar',
            barWidth: 50,
            itemStyle: {
              color: function (params) {
                return params.dataIndex === 0
                  ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#00a347' },
                    { offset: 1, color: '#008037' }
                  ])
                  : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#3b82f6' },
                    { offset: 1, color: '#2563eb' }
                  ]);
              }
            },
            label: {
              show: true,
              position: 'top',
              formatter: '{c}',
              fontFamily: 'Century Gothic',
              fontWeight: 'bold',
              color: textColor,
              offset: [0, -10]
            },
            data: topBarData,
            z: 5
          },
          // Upper Cylinder Cap
          {
            type: 'pictorialBar',
            symbol: 'ellipse',
            symbolSize: [50, 15],
            symbolOffset: [0, -7],
            symbolPosition: 'end',
            itemStyle: {
              color: function (params) {
                return params.dataIndex === 0 ? '#34d399' : '#60a5fa';
              }
            },
            data: topBarData,
            z: 15
          }
        ]
      };
      barChart.setOption(barOption);
      charts.push(barChart);
    }

    // 3. Score Trend Spline Line Chart
    const lineDom = document.getElementById("lineChart");
    if (lineDom) {
      const hasScores = data.trend && data.trend.scores && data.trend.scores.length > 0;
      if (!hasScores) {
        lineDom.removeAttribute('_echarts_instance_');
        lineDom.innerHTML = `<div class="no-data-msg" style="display:flex;align-items:center;justify-content:center;height:100%;color:${subTextColor};font-size:13px;font-weight:600;">No score trend available yet</div>`;
      } else {
        const lineChart = echarts.init(lineDom);
        const lineOption = {
          grid: { top: 40, bottom: 40, left: 40, right: 15 },
          tooltip: {
            trigger: 'axis',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: textColor, fontFamily: 'Century Gothic' }
          },
          xAxis: {
            type: "category",
            data: data.trend.labels,
            axisLine: { lineStyle: { color: axisLineColor } },
            axisLabel: { color: textColor, fontWeight: "bold", fontFamily: "Century Gothic", fontSize: 11 },
            axisTick: { show: false }
          },
          yAxis: {
            type: "value",
            splitLine: { lineStyle: { type: "dashed", color: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 128, 55, 0.06)" } },
            axisLabel: { color: textColor, fontFamily: "Century Gothic" }
          },
          series: [
            {
              data: data.trend.scores,
              type: "line",
              smooth: true,
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                width: 4,
                color: '#008037',
                shadowColor: "rgba(0, 128, 55, 0.2)",
                shadowBlur: 8,
                shadowOffsetY: 5
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
        charts.push(lineChart);
      }
    }

    // 4. Attendance Overview 3D Torus Donut
    const pieDom = document.getElementById("pieChart");
    if (pieDom) {
      const pieChart = echarts.init(pieDom);
      const presentVal = data.attendance ? (data.attendance.present || 0) : 0;
      const absentVal = data.attendance ? (data.attendance.absent || 0) : 0;
      const total = presentVal + absentVal;
      const presentPct = total > 0 ? Math.round((presentVal / total) * 100) : 0;
      const absentPct = total > 0 ? (100 - presentPct) : 0;

      const pVal = document.getElementById("legendPresentVal");
      const aVal = document.getElementById("legendAbsentVal");
      if (pVal) pVal.textContent = `${presentPct}%`;
      if (aVal) aVal.textContent = `${absentPct}%`;

      const pieSeriesData = total > 0 ? [
        {
          value: presentVal,
          name: "Present",
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#22c55e" },
              { offset: 1, color: "#16a34a" }
            ])
          }
        },
        {
          value: absentVal,
          name: "Absent",
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#f59e0b" },
              { offset: 1, color: "#d97706" }
            ])
          }
        }
      ] : [
        {
          value: 1,
          name: "No Attendance",
          itemStyle: { color: isDark ? "#374151" : "#e2e8f0" }
        }
      ];

      const pieOption = {
        tooltip: {
          trigger: 'item',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: textColor, fontFamily: 'Century Gothic' }
        },
        series: [
          {
            type: "pie",
            radius: ["65%", "78%"],
            center: ["50%", "50%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.15)",
              shadowOffsetY: 6
            },
            label: {
              show: true,
              position: "center",
              formatter: () => total > 0 ? `{val|${presentPct}%}\n{sub|Present}` : `{val|0%}\n{sub|No Attendance}`,
              rich: {
                val: { fontSize: 22, fontWeight: "800", color: textColor, fontFamily: "Century Gothic", padding: [4, 0] },
                sub: { fontSize: 11, color: subTextColor, fontFamily: "Century Gothic" }
              }
            },
            data: pieSeriesData
          }
        ]
      };
      pieChart.setOption(pieOption);
      charts.push(pieChart);
    }

    // 5. Subject Performance Horizontal Bar Chart
    const radarDom = document.getElementById("radarChart");
    if (radarDom) {
      const subjectData = (data.subject_performance && data.subject_performance.length) ? data.subject_performance : [];
      if (!subjectData.length) {
        radarDom.removeAttribute('_echarts_instance_');
        radarDom.innerHTML = `<div class="no-data-msg" style="display:flex;align-items:center;justify-content:center;height:100%;color:${subTextColor};font-size:13px;font-weight:600;">No subject performance data yet</div>`;
      } else {
        const radarChart = echarts.init(radarDom);
        const subjects = subjectData.map(item => item.subject);
        const averages = subjectData.map(item => item.average);
        const barOption = {
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: textColor, fontFamily: 'Century Gothic' }
          },
          grid: { left: 20, right: 20, top: 20, bottom: 20 },
          xAxis: {
            type: 'value',
            max: 100,
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 128, 55, 0.08)' } },
            axisLabel: { color: subTextColor, fontFamily: 'Century Gothic' }
          },
          yAxis: {
            type: 'category',
            data: subjects,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: subTextColor, fontFamily: 'Century Gothic', fontWeight: '700' }
          },
          series: [{
            name: 'Score (%)',
            type: 'bar',
            data: averages,
            barWidth: 18,
            itemStyle: {
              borderRadius: [0, 12, 12, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#22c55e' },
                { offset: 1, color: '#15803d' }
              ])
            },
            label: {
              show: true,
              position: 'right',
              color: textColor,
              fontFamily: 'Century Gothic',
              fontWeight: '700',
              formatter: '{c}%'
            }
          }]
        };
        radarChart.setOption(barOption);
        charts.push(radarChart);
      }
    }

    // 6. Performance Summary Semi-Circle Gauge
    const gaugeDom = document.getElementById("gaugeChart");
    if (gaugeDom) {
      const gaugeChart = echarts.init(gaugeDom);
      const gaugeValue = Math.min(Math.max(data.performance.overall_avg || 0, 0), 100);
      const overallTotal = data.performance.overall_total || 5.0;
      const gaugePercent = overallTotal > 0 ? Math.round((gaugeValue / overallTotal) * 100) : 0;
      const gaugeOption = {
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          radius: '100%',
          center: ['50%', '70%'],
          pointer: { show: false },
          progress: {
            show: true,
            overlap: false,
            roundCap: true,
            clip: false,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#22c55e' },
                { offset: 1, color: '#059669' }
              ])
            }
          },
          axisLine: {
            lineStyle: {
              width: 15,
              color: [[1, isDark ? '#333333' : '#e2e8f0']]
            }
          },
          splitLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false },
          data: [{
            value: gaugePercent,
            name: 'Your Performance'
          }],
          detail: {
            offsetCenter: [0, '-10%'],
            formatter: () => `{val|${gaugePercent}%}\n{sub|Your Performance}`,
            rich: {
              val: { fontSize: 26, fontWeight: '800', color: textColor, fontFamily: 'Century Gothic', padding: [5, 0] },
              sub: { fontSize: 11, color: subTextColor, fontFamily: 'Century Gothic' }
            }
          }
        }]
      };
      gaugeChart.setOption(gaugeOption);
      charts.push(gaugeChart);
    }
  }

  // ========== Fill Summary Data ==========
  function populateSummary(data) {
    document.getElementById("attendancePercent").textContent =
      (data.attendance.percentage !== undefined && data.attendance.percentage !== null ? data.attendance.percentage : 0) + "%";
    document.getElementById("examAvg").textContent =
      (data.performance.exam_avg !== undefined && data.performance.exam_avg !== null ? data.performance.exam_avg : 0).toFixed(2);
    document.getElementById("practiceAvg").textContent =
      (data.performance.practice_avg !== undefined && data.performance.practice_avg !== null ? data.performance.practice_avg : 0).toFixed(2);
    document.getElementById("overallAvg").textContent =
      (data.performance.overall_avg !== undefined && data.performance.overall_avg !== null ? data.performance.overall_avg : 0).toFixed(2);

    // Update Sub-labels (Out of X.X)
    const examSubEl = document.getElementById("examAvgSub");
    if (examSubEl) {
      examSubEl.textContent = `Out of ${(data.performance.exam_total !== undefined && data.performance.exam_total !== null ? data.performance.exam_total : 0).toFixed(1)}`;
    }
    const practiceSubEl = document.getElementById("practiceAvgSub");
    if (practiceSubEl) {
      practiceSubEl.textContent = `Out of ${(data.performance.practice_total !== undefined && data.performance.practice_total !== null ? data.performance.practice_total : 0).toFixed(1)}`;
    }
    const overallSubEl = document.getElementById("overallAvgSub");
    if (overallSubEl) {
      overallSubEl.textContent = `Out of ${(data.performance.overall_total !== undefined && data.performance.overall_total !== null ? data.performance.overall_total : 0).toFixed(1)}`;
    }

    // Helper to update trend badge dynamically
    function updateTrendBadge(elemId, val, dir) {
      const el = document.getElementById(elemId);
      if (!el) return;
      if (dir === 'none' || val === undefined || val === null) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'inline-flex';
      el.className = 'trend-badge';
      if (dir === 'up') {
        el.classList.add('green-trend');
        el.innerHTML = `↑ ${Math.round(val)}% <span class="trend-sub">from last month</span>`;
      } else if (dir === 'down') {
        el.classList.add('red-trend');
        el.innerHTML = `↓ ${Math.round(val)}% <span class="trend-sub">from last month</span>`;
      }
    }

    // Update Trend Badges
    updateTrendBadge("attendanceTrend", data.attendance.trend_val, data.attendance.trend_dir);
    updateTrendBadge("examTrend", data.performance.exam_trend_val, data.performance.exam_trend_dir);
    updateTrendBadge("practiceTrend", data.performance.practice_trend_val, data.performance.practice_trend_dir);
    updateTrendBadge("overallTrend", data.performance.overall_trend_val, data.performance.overall_trend_dir);

    const welcomeEl = document.getElementById("welcomeStudentName");
    if (welcomeEl && data.profile?.name) {
      welcomeEl.textContent = data.profile.name;
    }

    const profileNameEl = document.getElementById("profileName");
    if (profileNameEl && data.profile?.name) {
      profileNameEl.textContent = data.profile.name;
    }

    const profileAvatarEl = document.getElementById("profileAvatar");
    if (profileAvatarEl && data.profile?.name) {
      profileAvatarEl.textContent = data.profile.name.charAt(0).toUpperCase();
    }

    // Date Pill
    const dateObj = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}, ${days[dateObj.getDay()]}`;
    const dateTextEl = document.getElementById("dateText");
    if (dateTextEl) {
      dateTextEl.textContent = dateStr;
    }

    // Bottom Stats
    const statExamsEl = document.getElementById("statExams");
    if (statExamsEl) {
      statExamsEl.textContent = data.counts?.exam_count ?? '0';
    }
    const statPracticesEl = document.getElementById("statPractices");
    if (statPracticesEl) {
      statPracticesEl.textContent = data.counts?.practice_count ?? '0';
    }
    const statAssignmentsEl = document.getElementById("statAssignments");
    if (statAssignmentsEl) {
      statAssignmentsEl.textContent = data.counts?.assignment_count ?? '0';
    }
  }

  // ========== Populate Timeline ==========
  function populateActivity(activities) {
    const list = document.getElementById("activityTimeline");
    if (!list) return;
    list.innerHTML = "";

    if (!activities || !activities.length) {
      const li = document.createElement("li");
      li.className = "no-activity-item";
      li.style.padding = "16px";
      li.style.textAlign = "center";
      li.style.color = "var(--sub-text-color, #888)";
      li.style.fontSize = "13px";
      li.style.fontWeight = "600";
      li.textContent = "No recent activity yet.";
      list.appendChild(li);
      return;
    }

    const finalActivities = activities.map((act, index) => {
      const types = ["completed", "practice", "recorded", "submitted"];
      return {
        desc: act,
        date: "Recent",
        time: "",
        type: types[index % 4]
      };
    });

    finalActivities.forEach(item => {
      const li = document.createElement("li");

      const left = document.createElement("div");
      left.className = "act-left";

      const iconSpan = document.createElement("span");
      iconSpan.className = "act-icon";
      if (item.type === "completed") {
        iconSpan.className += " icon-completed";
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else if (item.type === "practice") {
        iconSpan.className += " icon-practice";
        iconSpan.innerHTML = "";
      } else if (item.type === "recorded") {
        iconSpan.className += " icon-recorded";
        iconSpan.innerHTML = "";
      } else {
        iconSpan.className += " icon-submitted";
        iconSpan.innerHTML = "";
      }

      const descSpan = document.createElement("span");
      descSpan.className = "act-desc";
      descSpan.textContent = item.desc;

      left.appendChild(iconSpan);
      left.appendChild(descSpan);

      const right = document.createElement("div");
      right.className = "act-right";

      const dateSpan = document.createElement("span");
      dateSpan.innerHTML = ` ${item.date}`;

      const timeSpan = document.createElement("span");
      timeSpan.innerHTML = `⏱ ${item.time}`;

      right.appendChild(dateSpan);
      right.appendChild(timeSpan);

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
  }

  // ========== 3D Tilt Card Event Listeners ==========
  function init3dTilt() {
    const cards = document.querySelectorAll(".summary-cards .card, .chart-card");
    cards.forEach(card => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const width = rect.width;
        const height = rect.height;

        const pctX = (x / width) - 0.5;
        const pctY = (y / height) - 0.5;

        const tiltX = -pctY * 8;
        const tiltY = pctX * 8;

        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-6px) translateZ(10px)`;
        card.style.transition = "transform 0.08s ease-out";

        const shadowX = -pctX * 15;
        const shadowY = -pctY * 15;
        card.style.boxShadow = `${shadowX}px ${shadowY}px 30px rgba(0, 128, 55, 0.08), 0 8px 24px rgba(0, 0, 0, 0.03)`;
        card.style.borderColor = "#008037";
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) translateZ(0)";
        card.style.transition = "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.4s ease, border-color 0.4s ease";
        card.style.boxShadow = "";
        card.style.borderColor = "";
      });
    });
  }

  // ========== Master Function ==========
  async function renderDashboard() {
    const data = await fetchDashboardData();
    if (!data || !data.performance) {
      console.error("Invalid dashboard data");
      return;
    }
    cachedData = data;

    populateSummary(data);
    renderCharts(data);
    populateActivity(data.activity);
    init3dTilt();
  }

  // ========== Listeners ==========
  document.addEventListener("DOMContentLoaded", () => {
    renderDashboard();

    // Resize Handler
    window.addEventListener("resize", () => {
      charts.forEach(c => {
        try { c.resize(); } catch (err) { }
      });
    });

    // Theme Change Handler
    window.addEventListener("themechange", () => {
      if (cachedData) {
        renderCharts(cachedData);
      }
    });
  });
})();
