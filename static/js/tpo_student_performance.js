/* static/js/tpo_student_performance.js */

document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("perfSearchInput");
  const tableBody = document.getElementById("perfTableBody");
  const showingStart = document.getElementById("showingStart");
  const showingEnd = document.getElementById("showingEnd");

  // Pre-fill and trigger client-side search if "search" query parameter exists
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get("search");
  if (searchParam && searchInput) {
    searchInput.value = searchParam;
    setTimeout(() => {
      searchInput.dispatchEvent(new Event("keyup"));
    }, 100);
  }

  const modal = document.getElementById("perfDetailModal");
  const closeBtn = modal ? modal.querySelector(".modal-close") : null;

  // Client-side Table Search
  if (searchInput && tableBody) {
    searchInput.addEventListener("keyup", function () {
      const query = this.value.toLowerCase().trim();
      const rows = tableBody.querySelectorAll("tr");
      let visibleCount = 0;

      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(query)) {
          row.style.display = "";
          visibleCount++;
        } else {
          row.style.display = "none";
        }
      });

      if (showingStart && showingEnd) {
        showingStart.textContent = visibleCount > 0 ? "1" : "0";
        showingEnd.textContent = visibleCount.toString();
      }
    });
  }

  // Global function to open detailed student performance attempt modal
  window.openStudentPerfModal = function (studentId) {
    if (!modal) return;

    fetch(`/tpo/performance/student-detail/${studentId}/`)
      .then(res => res.json())
      .then(data => {
        document.getElementById("perfModalStudentName").textContent = data.student_name || "Student Performance History";
        document.getElementById("perfModalUSN").textContent = `USN: ${data.usn || "—"}`;
        document.getElementById("perfModalCourse").textContent = `${data.course || "—"} | Yr ${data.year} Sem ${data.semester}`;

        // Populate Main Exam Logs
        const examBody = document.getElementById("perfModalExamLogs");
        if (examBody) {
          examBody.innerHTML = "";
          if (data.exam_logs && data.exam_logs.length > 0) {
            data.exam_logs.forEach(log => {
              const statusClass = log.status === "Passed" ? "status-badge excellent" : "status-badge poor";
              const row = `
                <tr>
                  <td><strong>${log.title}</strong></td>
                  <td>${log.marks}</td>
                  <td><span class="score-pill exam-score">${log.pct}</span></td>
                  <td>${log.date}</td>
                  <td><span class="${statusClass}">${log.status}</span></td>
                  <td>
                    <button class="action-btn-view detailed-report-btn" data-type="exam" data-id="${log.result_id}" style="padding: 4px 8px; font-size: 0.85em; background-color: #28556f; color: #fff; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-file-alt"></i> Detailed Report</button>
                  </td>
                </tr>`;
              examBody.insertAdjacentHTML("beforeend", row);
            });
          } else {
            examBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:14px; color:#888;">No main exam attempts recorded.</td></tr>`;
          }
        }

        // Populate Practice Test Logs
        const practiceBody = document.getElementById("perfModalPracticeLogs");
        if (practiceBody) {
          practiceBody.innerHTML = "";
          if (data.practice_logs && data.practice_logs.length > 0) {
            data.practice_logs.forEach(log => {
              const statusClass = log.status === "Passed" ? "status-badge excellent" : "status-badge poor";
              const row = `
                <tr>
                  <td><strong>${log.title}</strong></td>
                  <td>${log.marks}</td>
                  <td><span class="score-pill practice-score">${log.pct}</span></td>
                  <td>${log.date}</td>
                  <td><span class="${statusClass}">${log.status}</span></td>
                  <td>
                    <button class="action-btn-view detailed-report-btn" data-type="practice" data-id="${log.result_id}" style="padding: 4px 8px; font-size: 0.85em; background-color: #28556f; color: #fff; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-file-alt"></i> Detailed Report</button>
                  </td>
                </tr>`;
              practiceBody.insertAdjacentHTML("beforeend", row);
            });
          } else {
            practiceBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:14px; color:#888;">No practice test attempts recorded.</td></tr>`;
          }
        }

        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
      })
      .catch(err => {
        console.error("Error fetching student performance details:", err);
      });
  };

  function closeModal() {
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  // Close Modal Events
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) {
        closeModal();
      }
    });
  }

  // --- Student Detailed Report Drawer JS Logic ---
  const configEl = document.getElementById("tpo-config");
  const resultDetailUrl = configEl ? configEl.dataset.resultDetailUrl : "";

  const detailDrawer = document.getElementById("studentDetailDrawer");
  const detailBackdrop = document.getElementById("detailModalBackdrop");
  const detailCloseBtn = document.getElementById("detailDrawerCloseBtn");

  const closeDetailDrawer = () => {
    if (detailDrawer && detailBackdrop) {
      detailDrawer.classList.add("hidden");
      detailBackdrop.classList.add("hidden");
      detailDrawer.setAttribute("aria-hidden", "true");
    }
  };

  if (detailCloseBtn) detailCloseBtn.addEventListener("click", closeDetailDrawer);
  if (detailBackdrop) detailBackdrop.addEventListener("click", closeDetailDrawer);

  const examLogsTable = document.getElementById("perfModalExamLogs");
  const practiceLogsTable = document.getElementById("perfModalPracticeLogs");

  const handleReportBtnClick = (e) => {
    const btn = e.target.closest(".detailed-report-btn");
    if (btn) {
      const resultId = btn.dataset.id;
      const testType = btn.dataset.type;
      if (resultId && testType) {
        fetchAndShowDetail(resultId, testType);
      }
    }
  };

  if (examLogsTable) {
    examLogsTable.addEventListener("click", handleReportBtnClick);
  }
  if (practiceLogsTable) {
    practiceLogsTable.addEventListener("click", handleReportBtnClick);
  }

  function fetchAndShowDetail(resultId, testType) {
    if (!resultDetailUrl) {
      console.error("Error: Detail API URL not configured");
      return;
    }
    
    const container = document.getElementById("drawerQuestionContainer");
    container.innerHTML = `<div class="drawer-loading"><i class="fas fa-spinner fa-spin"></i> Fetching detailed report from database...</div>`;
    
    if (detailDrawer && detailBackdrop) {
      detailDrawer.classList.remove("hidden");
      detailBackdrop.classList.remove("hidden");
      detailDrawer.setAttribute("aria-hidden", "false");
    }

    fetch(`${resultDetailUrl}?type=${testType}&id=${resultId}`)
      .then(res => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      })
      .then(data => {
        document.getElementById("detailDrawerType").textContent = data.test_type;
        document.getElementById("detailStudentName").textContent = data.student.name;
        document.getElementById("detailStudentUsn").textContent = data.student.usn;
        document.getElementById("detailStudentEmail").textContent = data.student.email;
        document.getElementById("detailStudentCollege").textContent = data.student.college;
        document.getElementById("detailStudentCourse").textContent = data.student.course;
        document.getElementById("detailStudentYear").textContent = data.student.year;
        document.getElementById("detailStudentSemester").textContent = data.student.semester;
        document.getElementById("detailStudentSection").textContent = data.student.section;

        document.getElementById("detailMarksObtained").textContent = data.marks_obtained;
        const totalMarksEl = document.getElementById("detailTotalMarks");
        if (totalMarksEl) totalMarksEl.textContent = data.total_marks;
        document.getElementById("detailPercentage").textContent = `${data.percentage}%`;
        
        const statusBadge = document.getElementById("detailStatusBadge");
        statusBadge.textContent = data.status;
        statusBadge.className = `status-badge ${data.status.toLowerCase()}`;

        document.getElementById("detailAttemptedCount").textContent = data.attempted_questions;
        document.getElementById("detailCorrectCount").textContent = data.correct_answers;
        document.getElementById("detailWrongCount").textContent = data.wrong_answers;
        document.getElementById("detailTimeSpent").textContent = data.time_taken;
        document.getElementById("detailSubmittedAt").textContent = data.submitted_at;

        const switchesGroup = document.getElementById("detailTabSwitchesGroup");
        const modeGroup = document.getElementById("detailSubmissionModeGroup");
        if (testType === "exam") {
          switchesGroup.style.display = "block";
          modeGroup.style.display = "block";
          document.getElementById("detailTabSwitches").textContent = data.tab_switch_count ?? "0";
          document.getElementById("detailSubmissionMode").textContent = data.submission_mode ?? "—";
        } else {
          switchesGroup.style.display = "none";
          modeGroup.style.display = "none";
        }

        container.innerHTML = "";
        const breakdown = data.question_wise_breakdown || [];
        if (!breakdown.length) {
          container.innerHTML = `<div class="no-records-cell">No question details stored in database for this attempt.</div>`;
          return;
        }

        breakdown.forEach((q, idx) => {
          const itemDiv = document.createElement("div");
          itemDiv.className = `drawer-question-item ${q.correct ? "q-correct" : "q-incorrect"}`;
          
          let typeIcon = "fa-question-circle";
          if (q.type === "MCQ") typeIcon = "fa-list-ul";
          else if (q.type === "TF") typeIcon = "fa-check-double";
          else if (q.type === "DESC") typeIcon = "fa-align-left";
          else if (q.type === "CODE" || q.type === "Code") typeIcon = "fa-code";

          let answerHtml = "";
          if (q.parsed_code) {
            answerHtml = `
              <div class="code-editor-header">
                <span><i class="fas fa-code"></i> ${q.parsed_code.language}</span>
              </div>
              <pre class="code-preview" style="background:#1e293b; color:#fff; padding:10px; border-radius:6px; overflow-x:auto;"><code>${escapeHtml(q.parsed_code.code)}</code></pre>
            `;
          } else {
            answerHtml = `<p class="response-text" style="font-weight:600; color:#334155; margin:0;">${escapeHtml(q.student_answer || "— (No Answer)")}</p>`;
          }

          let verdictHtml = "";
          if (q.type === "CODE" || q.type === "Code") {
            const passed = q.passed || 0;
            const total = q.total || 0;
            const badgeColor = q.correct ? "background:#dcfce7; color:#15803d;" : "background:#fee2e2; color:#b91c1c;";
            verdictHtml = `
              <div class="code-metrics" style="margin-top:10px; font-size:0.85em; display:flex; gap:15px;">
                <span><strong>Verdict:</strong> <span class="badge" style="${badgeColor}">${escapeHtml(q.verdict)}</span></span>
                <span><strong>Test Cases:</strong> <span class="badge" style="background:#e0f2fe; color:#0369a1;">${passed} / ${total} Passed</span></span>
              </div>
            `;
          }

          itemDiv.innerHTML = `
            <div class="q-item-header">
              <span class="q-item-number"><i class="fas ${typeIcon}"></i> Question ${idx + 1} (${q.type})</span>
              <span class="q-item-score ${q.correct ? "score-pass" : "score-fail"}">
                ${q.marks_awarded} Marks
              </span>
            </div>
            <div class="q-item-body">
              <p class="question-text-view" style="font-size:0.95em; color:#1f2937; margin:0 0 10px 0;">${escapeHtml(q.question_text)}</p>
              
              <div class="response-section" style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:10px;">
                <h5 style="margin:0 0 6px 0; color:#475569; font-size:0.85em;">Student Response:</h5>
                ${answerHtml}
              </div>

              <div class="answer-key-section" style="background:#f0fdf4; padding:10px; border-radius:8px; border:1px solid #dcfce7;">
                <h5 style="margin:0 0 6px 0; color:#166534; font-size:0.85em;">Correct Answer / Criteria:</h5>
                <p class="correct-text" style="font-weight:600; color:#15803d; margin:0;">${escapeHtml(q.correct_answer || "—")}</p>
              </div>

              ${verdictHtml}
            </div>
          `;
          container.appendChild(itemDiv);
        });
      })
      .catch(err => {
        console.error(err);
        container.innerHTML = `<div class="drawer-error"><i class="fas fa-exclamation-triangle"></i> Failed to retrieve detailed metrics from database.</div>`;
      });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initialize Chart.js Analytics
  const pData = window.perfChartData || { labels: [], exam_avg: [], practice_avg: [], overall_avg: [] };

  // 1. Grouped Bar Chart (Exam vs Practice vs Overall)
  const barCanvas = document.getElementById("performanceChart");
  if (barCanvas && typeof Chart !== "undefined") {
    new Chart(barCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: pData.labels.length > 0 ? pData.labels : ["No Data"],
        datasets: [
          {
            label: "Exam Avg (%)",
            data: pData.exam_avg.length > 0 ? pData.exam_avg : [0],
            backgroundColor: "#3b82f6",
            borderRadius: 6,
          },
          {
            label: "Practice Avg (%)",
            data: pData.practice_avg.length > 0 ? pData.practice_avg : [0],
            backgroundColor: "#f59e0b",
            borderRadius: 6,
          },
          {
            label: "Overall Avg (%)",
            data: pData.overall_avg.length > 0 ? pData.overall_avg : [0],
            backgroundColor: "#10b981",
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { font: { family: "Century Gothic", weight: "bold" } }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.raw}%`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (val) => val + "%" }
          }
        }
      }
    });
  }

  // 2. Doughnut Chart (Performance Tier Breakdown)
  const doughnutCanvas = document.getElementById("perfDoughnutChart");
  if (doughnutCanvas && typeof Chart !== "undefined" && tableBody) {
    const rows = tableBody.querySelectorAll("tr");
    let excellentCount = 0, goodCount = 0, averageCount = 0, poorCount = 0;

    rows.forEach(row => {
      const badge = row.querySelector(".status-badge");
      if (badge) {
        if (badge.classList.contains("excellent")) excellentCount++;
        else if (badge.classList.contains("good")) goodCount++;
        else if (badge.classList.contains("average")) averageCount++;
        else if (badge.classList.contains("poor")) poorCount++;
      }
    });

    const totalCount = excellentCount + goodCount + averageCount + poorCount;
    const donutData = totalCount > 0 ? [excellentCount, goodCount, averageCount, poorCount] : [0, 0, 0, 1];

    new Chart(doughnutCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Excellent", "Good", "Average", "Needs Focus"],
        datasets: [
          {
            data: donutData,
            backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"],
            borderWidth: 2,
            borderColor: "#ffffff"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // 3. TPO Overview circular progress ring / gauge
  const tpoGaugeCanvas = document.getElementById("tpoOverviewGauge");
  if (tpoGaugeCanvas && typeof Chart !== "undefined") {
    const avgScore = parseFloat(tpoGaugeCanvas.dataset.score) || 0;
    const remaining = Math.max(0, 100 - avgScore);
    let color = "#ef4444";
    if (avgScore >= 90) color = "#10b981";
    else if (avgScore >= 75) color = "#059669";
    else if (avgScore >= 50) color = "#f59e0b";
    else if (avgScore >= 25) color = "#f97316";

    new Chart(tpoGaugeCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        datasets: [{
          data: [avgScore, remaining],
          backgroundColor: [color, "#e2e8f0"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "82%",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        animation: { duration: 1200 }
      }
    });
  }
});
