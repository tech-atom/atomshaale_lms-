/* static/js/tpo_reports.js */

document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.querySelector("#reportTable tbody");
  const filterDate = document.getElementById("filterDate");
  const filterTrainer = document.getElementById("filterTrainer");
  const filterCourse = document.getElementById("filterCourse");
  const filterYear = document.getElementById("filterYear");
  const filterSemester = document.getElementById("filterSemester");
  const searchBox = document.getElementById("searchBox");
  const resetBtn = document.getElementById("resetFiltersBtn");

  const modal = document.getElementById("reportModal");
  const closeBtn = document.querySelector(".modal-close");

  function loadReports() {
    const params = new URLSearchParams({
      date: filterDate?.value || "",
      trainer: filterTrainer?.value || "",
      course: filterCourse?.value || "",
      year: filterYear?.value || "",
      semester: filterSemester?.value || "",
      search: searchBox?.value || "",
    });

    fetch(`/tpo/trainer-daily-reports/data/?${params}`)
      .then(res => res.json())
      .then(data => renderTable(data.reports || []))
      .catch(err => console.error("Error loading trainer daily reports:", err));
  }

  function renderTable(reports) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (!reports || !reports.length) {
      tableBody.innerHTML = `<tr><td colspan="11" class="no-records-cell" style="text-align:center; padding: 24px;">No trainer daily reports found matching criteria.</td></tr>`;
      return;
    }

    reports.forEach(r => {
      const row = `
        <tr>
          <td><span class="date-pill">${r.date}</span></td>
          <td class="font-bold-name">${r.trainer}</td>
          <td>${r.course}</td>
          <td><span class="level-pill">Y${r.year} S${r.semester}</span></td>
          <td><span class="section-pill">${r.section}</span></td>
          <td><strong>${r.domain}</strong></td>
          <td>${r.module || "—"}</td>
          <td><span class="attn-badge present"><i class="fas fa-user-check"></i> ${r.present}</span></td>
          <td><span class="attn-badge absent"><i class="fas fa-user-xmark"></i> ${r.absent}</span></td>
          <td>
            <button class="view-btn" data-report='${JSON.stringify(r).replace(/'/g, "&apos;")}'>
              <i class="fas fa-eye"></i> Details
            </button>
          </td>
        </tr>`;
      tableBody.insertAdjacentHTML("beforeend", row);
    });

    // Attach click listeners to view buttons
    tableBody.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const rawData = this.getAttribute("data-report");
        if (rawData) {
          try {
            const reportData = JSON.parse(rawData.replace(/&apos;/g, "'"));
            openReportModal(reportData);
          } catch(e) {
            console.error("Error parsing report modal JSON:", e);
          }
        }
      });
    });
  }

  function openReportModal(data) {
    if (!modal) return;
    document.getElementById("modalTrainer").textContent = data.trainer || "Trainer";
    document.getElementById("modalDate").textContent = data.date || "";
    
    // Bind newly added detailed fields
    const headerCourse = document.getElementById("modalHeaderCourse");
    if (headerCourse) {
      headerCourse.innerHTML = `<i class="fas fa-graduation-cap"></i> ${data.course || "—"}`;
    }
    document.getElementById("modalCourse").textContent = data.course || "—";
    document.getElementById("modalYearSem").textContent = `Year ${data.year} Semester ${data.semester}`;
    document.getElementById("modalSection").textContent = data.section || "—";
    document.getElementById("modalModule").textContent = data.module || "—";
    
    const attendanceEl = document.getElementById("modalAttendance");
    if (attendanceEl) {
      attendanceEl.innerHTML = `
        <span class="attn-badge present" style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 2px 8px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-user-check"></i> ${data.present}</span> 
        <span style="color:#cbd5e1; margin:0 2px;">/</span>
        <span class="attn-badge absent" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 2px 8px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-user-xmark"></i> ${data.absent}</span>
      `;
    }

    document.getElementById("modalDomain").textContent = data.domain || "—";
    document.getElementById("modalSubdomain").textContent = data.subdomain || "—";

    // Update Checklist Badges
    const updateChecklistBadge = (badgeId, isYes) => {
      const el = document.getElementById(badgeId);
      if (!el) return;
      if (isYes === "Yes" || isYes === true) {
        el.innerHTML = '<i class="fas fa-check" style="font-size: 11px;"></i>';
        el.style.background = '#dcfce7';
        el.style.color = '#15803d';
      } else {
        el.innerHTML = '<i class="fas fa-times" style="font-size: 11px;"></i>';
        el.style.background = '#fee2e2';
        el.style.color = '#b91c1c';
      }
    };
    updateChecklistBadge("modalExercisesBadge", data.exercises_solved);
    updateChecklistBadge("modalNotesBadge", data.materials_shared);
    updateChecklistBadge("modalAssignmentsBadge", data.assignments_given);

    document.getElementById("modalSummary").textContent = data.summary || "No summary provided.";

    modal.style.display = "flex";
  }

  // Event Listeners for filters
  [filterDate, filterTrainer, filterCourse, filterYear, filterSemester].forEach(input => {
    input?.addEventListener("change", loadReports);
  });

  if (searchBox) {
    let timeout = null;
    searchBox.addEventListener("input", function() {
      clearTimeout(timeout);
      timeout = setTimeout(loadReports, 250);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      if (filterDate) filterDate.value = "";
      if (filterTrainer) filterTrainer.value = "";
      if (filterCourse) filterCourse.value = "";
      if (filterYear) filterYear.value = "";
      if (filterSemester) filterSemester.value = "";
      if (searchBox) searchBox.value = "";
      loadReports();
    });
  }

  // Modal Close Listeners
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (modal) modal.style.display = "none";
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) {
        modal.style.display = "none";
      }
    });
  }

  // Initial Load
  loadReports();
});
