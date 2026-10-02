/* static/js/tpo_student_attendance.js */

document.addEventListener("DOMContentLoaded", function () {
  // ---------- 1. Overview Bar Chart Setup ----------
  const overviewCanvas = document.getElementById("attendanceOverviewChart");
  let overviewChartInstance = null;

  if (overviewCanvas) {
    try {
      const studentLabels = JSON.parse(overviewCanvas.getAttribute("data-student-labels") || "[]");
      const studentValues = JSON.parse(overviewCanvas.getAttribute("data-student-values") || "[]");
      const courseLabels = JSON.parse(overviewCanvas.getAttribute("data-course-labels") || "[]");
      const courseValues = JSON.parse(overviewCanvas.getAttribute("data-course-values") || "[]");

      function renderOverviewChart(labels, data, datasetLabel) {
        if (overviewChartInstance) {
          overviewChartInstance.destroy();
        }

        const ctx = overviewCanvas.getContext("2d");
        const isMobile = window.innerWidth < 500;
        const isDark = document.body.classList.contains("dark-mode");
        const dynamicBarThickness = isMobile
          ? Math.max(8, Math.floor((window.innerWidth - 100) / (labels.length || 1)))
          : (labels.length > 10 ? 18 : 28);
        const tickColor = isDark ? "#aaaaaa" : "#666666";
        const gridColor = isDark ? "#2a2a2a" : "#f3f4f6";

        overviewChartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{
              label: datasetLabel,
              data: data,
              backgroundColor: "#008037",
              borderRadius: isMobile ? 3 : 6,
              barThickness: dynamicBarThickness,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return context.raw + "%";
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  callback: function (val) {
                    return val + "%";
                  },
                  font: { size: isMobile ? 9 : 12 },
                  color: tickColor
                },
                grid: { color: gridColor }
              },
              x: {
                grid: { display: false },
                ticks: {
                  maxRotation: isMobile ? 45 : 0,
                  minRotation: isMobile ? 45 : 0,
                  font: { size: isMobile ? 9 : 12 },
                  color: tickColor
                }
              }
            }
          }
        });
      }

      // Initial render: By Student
      renderOverviewChart(studentLabels, studentValues, "Attendance (%)");

      // Toggle Buttons
      const btnStudent = document.getElementById("btnChartStudent");
      const btnCourse = document.getElementById("btnChartCourse");

      if (btnStudent && btnCourse) {
        btnStudent.addEventListener("click", function () {
          btnStudent.classList.add("active");
          btnCourse.classList.remove("active");
          renderOverviewChart(studentLabels, studentValues, "Student Attendance (%)");
        });

        btnCourse.addEventListener("click", function () {
          btnCourse.classList.add("active");
          btnStudent.classList.remove("active");
          renderOverviewChart(courseLabels, courseValues, "Course Average (%)");
        });
      }
    } catch (err) {
      console.warn("Failed to initialize Overview Chart:", err);
    }
  }

  // ---------- 2. Distribution Donut Chart Setup ----------
  const distCanvas = document.getElementById("attendanceDistributionChart");
  if (distCanvas) {
    try {
      const distValues = JSON.parse(distCanvas.getAttribute("data-dist") || "[0,0,0,0]");
      const ctxDist = distCanvas.getContext("2d");

      const isDarkDonut = document.body.classList.contains("dark-mode");
      const donutBorder = isDarkDonut ? "#1a1a1a" : "#ffffff";

      new Chart(ctxDist, {
        type: "doughnut",
        data: {
          labels: [">= 90% (Excellent)", "75% - 89% (Good)", "50% - 74% (Average)", "< 50% (Poor)"],
          datasets: [{
            data: distValues,
            backgroundColor: ["#008037", "#22c55e", "#eab308", "#ef4444"],
            borderWidth: 2,
            borderColor: donutBorder
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "75%",
          plugins: {
            legend: { display: false }
          }
        }
      });
    } catch (err) {
      console.warn("Failed to initialize Distribution Donut Chart:", err);
    }
  }

  // ---------- 3. Quick Date Filters Handler ----------
  const quickBtns = document.querySelectorAll(".quick-btn");
  const hiddenQuickInput = document.getElementById("hiddenQuickFilter");
  const primaryForm = document.getElementById("primaryFilterForm");

  quickBtns.forEach(btn => {
    btn.addEventListener("click", function () {
      const preset = this.getAttribute("data-preset");
      if (hiddenQuickInput && primaryForm) {
        hiddenQuickInput.value = preset;
        primaryForm.submit();
      }
    });
  });

  // ---------- 4. Table Real-time Search & Filter ----------
  const tableSearchInput = document.getElementById("tableSearchInput");
  const tableBody = document.getElementById("attendanceTableBody");

  if (tableSearchInput && tableBody) {
    tableSearchInput.addEventListener("keyup", function () {
      const query = this.value.toLowerCase().trim();
      const rows = tableBody.querySelectorAll("tr");

      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(query)) {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      });
    });
  }

  // ---------- 5. Student Attendance Detail Modal Handler ----------
  const modalBackdrop = document.getElementById("studentDetailModal");
  const modalStudentName = document.getElementById("modalStudentName");
  const modalStudentUSN = document.getElementById("modalStudentUSN");
  const modalLogTableBody = document.getElementById("modalLogTableBody");
  const closeModalBtn = document.getElementById("closeModalBtn");

  document.querySelectorAll(".view-detail-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      const studentId = this.getAttribute("data-id");
      const name = this.getAttribute("data-name");
      const usn = this.getAttribute("data-usn");

      if (modalStudentName) modalStudentName.textContent = name || "";
      if (modalStudentUSN) modalStudentUSN.textContent = usn || "";
      if (modalLogTableBody) modalLogTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Loading attendance log...</td></tr>';

      if (modalBackdrop) modalBackdrop.classList.add("active");

      // Fetch detail API
      fetch(`/tpo/attendance/student-detail/${studentId}/`)
        .then(response => response.json())
        .then(data => {
          if (modalLogTableBody) {
            modalLogTableBody.innerHTML = "";
            if (data.records && data.records.length > 0) {
              data.records.forEach(rec => {
                const tr = document.createElement("tr");
                const badgeClass = rec.status === "Present" ? "badge-num present" : "badge-num absent";
                tr.innerHTML = `
                  <td>${rec.date}</td>
                  <td>${rec.slot}</td>
                  <td>${rec.domain}</td>
                  <td>${rec.trainer}</td>
                  <td><span class="${badgeClass}">${rec.status}</span></td>
                `;
                modalLogTableBody.appendChild(tr);
              });
            } else {
              modalLogTableBody.innerHTML = '<tr><td colspan="5" class="no-records-cell">No date-wise attendance records logged yet.</td></tr>';
            }
          }
        })
        .catch(err => {
          console.error("Failed to load student detail log:", err);
          if (modalLogTableBody) modalLogTableBody.innerHTML = '<tr><td colspan="5" class="no-records-cell">Error loading records.</td></tr>';
        });
    });
  });

  // ---------- 6. Stats Button Redirect Handler ----------
  document.querySelectorAll(".stats-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      const usn = this.getAttribute("data-usn");
      if (usn) {
        window.location.href = `/tpo/performance/?search=${encodeURIComponent(usn)}`;
      }
    });
  });

  if (closeModalBtn && modalBackdrop) {
    closeModalBtn.addEventListener("click", function () {
      modalBackdrop.classList.remove("active");
    });
    modalBackdrop.addEventListener("click", function (e) {
      if (e.target === modalBackdrop) {
        modalBackdrop.classList.remove("active");
      }
    });
  }
});
