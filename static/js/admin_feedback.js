// ========================================================================
// admin_feedback.js — Advanced Multi-Select, Cascading & Feedback Analytics
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Admin Feedback Analytics JS initialized");

  // ----------- 1. ELEMENT REFERENCES -----------
  const apiNode = document.getElementById("feedback-api-urls");
  if (!apiNode) {
    console.error("ERROR: #feedback-api-urls configuration node not found.");
    return;
  }

  // Retrieve URLs from data attributes
  const apiListUrl = apiNode.dataset.listUrl || "/api/admin/admin/feedback/list/";
  const apiDownloadUrl = apiNode.dataset.downloadUrl || "/api/admin/admin/feedback/download/";
  const collegesUrl = apiNode.dataset.collegesUrl;
  const coursesUrl = apiNode.dataset.coursesUrl;
  const sectionsUrl = apiNode.dataset.sectionsUrl;
  const trainersUrl = apiNode.dataset.trainersUrl;
  const yearsUrl = apiNode.dataset.yearsUrl;
  const semestersUrl = apiNode.dataset.semestersUrl;
  const sessionDetailUrl = apiNode.dataset.sessionDetailUrl || "/feedback/session/";

  const summaryBox = document.getElementById("summary-box");
  const feedbackTableBody = document.querySelector("#feedback-table tbody");
  const tableSearch = document.getElementById("table-search");
  const sessionCountBadge = document.getElementById("session-count-badge");
  const paginationInfo = document.getElementById("pagination-info");
  const paginationControls = document.getElementById("pagination-controls");
  const startInp = document.getElementById("start");
  const endInp = document.getElementById("end");
  const resetBtn = document.getElementById("reset-btn");
  const downloadBtn = document.getElementById("download-btn");

  // ----------- 2. STATE MANAGEMENT -----------
  let allRows = []; // Full loaded dataset from backend
  let filteredRows = []; // Search/local filtered dataset
  let currentPage = 1;
  const rowsPerPage = 10;

  // Active filters selection arrays
  const filters = {
    colleges: [],
    courses: [],
    sections: [],
    trainers: [],
    years: [],
    semesters: [],
    start: "",
    end: "",
    search: ""
  };

  // ----------- 3. MULTI-SELECT DROPDOWN SYSTEM -----------
  function setupDropdowns() {
    const dropdowns = document.querySelectorAll(".custom-dropdown");

    dropdowns.forEach(dropdown => {
      const trigger = dropdown.querySelector(".dropdown-trigger");
      const popover = dropdown.querySelector(".dropdown-popover");
      const search = dropdown.querySelector(".popover-search-input");
      const selectAllBtn = dropdown.querySelector(".select-all");
      const clearAllBtn = dropdown.querySelector(".clear-all");
      const type = dropdown.id.replace("dropdown-", "");

      // Toggle dropdown open/close
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const active = dropdown.classList.contains("open");
        closeAllDropdowns();
        if (!active) {
          dropdown.classList.add("open");
          trigger.setAttribute("aria-expanded", "true");
          if (search) search.focus();
        }
      });

      // Filter search inside popover
      if (search) {
        search.addEventListener("input", () => {
          const val = search.value.toLowerCase();
          const items = dropdown.querySelectorAll(".option-item");
          items.forEach(item => {
            const label = item.textContent.toLowerCase();
            item.style.display = label.includes(val) ? "" : "none";
          });
        });
      }

      // Bulk Select All
      if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
          const checkboxes = dropdown.querySelectorAll(".option-checkbox");
          checkboxes.forEach(cb => {
            if (cb.closest(".option-item").style.display !== "none") {
              cb.checked = true;
            }
          });
          syncDropdownFilterValues(type);
        });
      }

      // Bulk Clear
      if (clearAllBtn) {
        clearAllBtn.addEventListener("click", () => {
          const checkboxes = dropdown.querySelectorAll(".option-checkbox");
          checkboxes.forEach(cb => cb.checked = false);
          syncDropdownFilterValues(type);
        });
      }
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".custom-dropdown")) {
        closeAllDropdowns();
      }
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".custom-dropdown").forEach(dropdown => {
      dropdown.classList.remove("open");
      dropdown.querySelector(".dropdown-trigger").setAttribute("aria-expanded", "false");
    });
  }

  // Sync checkboxes values to filter state and trigger cascades / table updates
  function syncDropdownFilterValues(type) {
    const dropdown = document.getElementById(`dropdown-${type}`);
    if (!dropdown) return;

    const checkedBoxes = dropdown.querySelectorAll(".option-checkbox:checked");
    const selectedValues = Array.from(checkedBoxes).map(cb => cb.value);

    filters[type + "s"] = selectedValues; // e.g. trainers, colleges, etc.
    updateDropdownLabel(type, selectedValues);

    // Dynamic Cascading Behavior
    if (type === "college" || type === "course") {
      // Reload sections based on college and course choices
      loadSectionsCascade(filters.colleges, filters.courses);
    }

    // Refresh feedbacks via AJAX
    currentPage = 1;
    loadFeedback();
  }

  // Update button trigger labels with count
  function updateDropdownLabel(type, selectedValues) {
    const dropdown = document.getElementById(`dropdown-${type}`);
    if (!dropdown) return;

    const labelNode = dropdown.querySelector(".trigger-label");
    const labelSingular = type.charAt(0).toUpperCase() + type.slice(1);
    const labelPlural = labelSingular + "s";

    if (selectedValues.length === 0) {
      labelNode.textContent = `${labelPlural} (All)`;
      dropdown.classList.remove("has-selection");
    } else {
      labelNode.textContent = `${labelSingular} (${selectedValues.length} selected)`;
      dropdown.classList.add("has-selection");
    }
  }

  // Render options list inside popovers
  function renderDropdownOptions(type, dataList, nameFieldSingular) {
    const optionsContainer = document.getElementById(`options-${type}`);
    if (!optionsContainer) return;

    if (!dataList || dataList.length === 0) {
      optionsContainer.innerHTML = `<div class="popover-placeholder">No ${type}s found</div>`;
      return;
    }

    optionsContainer.innerHTML = "";
    dataList.forEach(item => {
      const itemNode = document.createElement("label");
      itemNode.className = "option-item";

      const isChecked = filters[type + "s"].includes(String(item.id));

      itemNode.innerHTML = `
        <input type="checkbox" class="option-checkbox" value="${escapeHtml(item.id)}" ${isChecked ? 'checked' : ''}>
        <span class="option-checkmark"></span>
        <span class="option-text">${escapeHtml(item.name)}</span>
      `;

      optionsContainer.appendChild(itemNode);

      // Event listener for checkbox change
      itemNode.querySelector(".option-checkbox").addEventListener("change", () => {
        syncDropdownFilterValues(type);
      });
    });
  }

  // ----------- 4. CASCADING FETCH ACTIONS -----------

  // Cascading College / Course -> Section
  async function loadSectionsCascade(collegeIds, courseIds) {
    const secOptionsContainer = document.getElementById("options-section");
    
    // Pass the first selected college ID if any (since views.py expects 'college' parameter as a single ID)
    const collegeParam = collegeIds.length > 0 ? collegeIds[0] : "";
    const courseParam = courseIds.join(",");

    secOptionsContainer.innerHTML = '<div class="popover-loading">Loading sections...</div>';
    try {
      const url = `${sectionsUrl}?college=${collegeParam}&course=${courseParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Sections fetch error");
      const data = await res.json();

      // Deduplicate and format
      const sectionList = (data || []).map(s => ({
        id: s.id,
        name: s.name
      }));

      // Prune outdated selections
      const validSecNames = sectionList.map(s => String(s.id));
      filters.sections = filters.sections.filter(name => validSecNames.includes(name));
      updateDropdownLabel("section", filters.sections);

      renderDropdownOptions("section", sectionList, "Section");
    } catch (err) {
      console.error("ERROR loading cascaded sections:", err);
      secOptionsContainer.innerHTML = '<div class="popover-error">Error loading sections</div>';
    }
  }

  // ----------- 5. INITIAL POPULATE DROPDOWNS -----------
  async function loadInitialFilterChoices() {
    try {
      // Async fetching from Django DB APIs
      const [trainersRes, collegesRes, coursesRes, yearsRes, semestersRes] = await Promise.all([
        fetch(trainersUrl).then(r => r.json()),
        fetch(collegesUrl).then(r => r.json()),
        fetch(coursesUrl).then(r => r.json()),
        fetch(yearsUrl).then(r => r.json()),
        fetch(semestersUrl).then(r => r.json())
      ]);

      // Helper to safely parse array from response
      const getArray = (res, key) => {
        if (!res) return [];
        if (Array.isArray(res)) return res;
        if (key && Array.isArray(res[key])) return res[key];
        return [];
      };

      // Populating
      renderDropdownOptions("trainer", getArray(trainersRes, "trainers").map(t => ({ id: t.id, name: t.name })), "Trainer");
      renderDropdownOptions("college", getArray(collegesRes).map(c => ({ id: c.id, name: c.name })), "College");
      renderDropdownOptions("course", getArray(coursesRes).map(co => ({ id: co.id, name: co.name })), "Course");
      renderDropdownOptions("year", getArray(yearsRes).map(y => ({ id: y.id, name: y.label })), "Year");
      renderDropdownOptions("semester", getArray(semestersRes).map(s => ({ id: s.id, name: s.label })), "Semester");

      // Load all sections initially (without specific college/course selection)
      const sectionsRes = await fetch(sectionsUrl).then(r => r.json());
      renderDropdownOptions("section", getArray(sectionsRes).map(s => ({ id: s.id, name: s.name })), "Section");

    } catch (err) {
      console.error("CRITICAL ERROR populating dashboard filters from DB:", err);
      showToast("Failed to fetch filter options from server.", "error");
    }
  }

  // ----------- 6. PARAMETERS BUILDER -----------
  function buildParams() {
    const params = new URLSearchParams();
    if (filters.start) params.append("start", filters.start);
    if (filters.end) params.append("end", filters.end);
    if (filters.trainers.length) params.append("trainer", filters.trainers.join(","));
    if (filters.colleges.length) params.append("college", filters.colleges.join(","));
    if (filters.courses.length) params.append("course", filters.courses.join(","));
    if (filters.sections.length) params.append("section", filters.sections.join(","));
    if (filters.years.length) params.append("year", filters.years.join(","));
    if (filters.semesters.length) params.append("semester", filters.semesters.join(","));
    return params;
  }

  // ----------- 7. FETCH & BIND FEEDBACK DATA -----------
  async function loadFeedback() {
    const url = `${apiListUrl}?${buildParams().toString()}`;

    try {
      feedbackTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="loading-state">
            <div class="loading-spinner"></div>
            <span>Querying feedback records...</span>
          </td>
        </tr>
      `;

      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Feedback list returned ${res.status}`);

      const data = await res.json();
      allRows = data.rows || [];
      currentPage = 1;

      // Animate summary metrics cards
      renderSummary(data.summary);
      
      // Render charts and table
      filterAndPaginate();
      renderCharts(data);

    } catch (err) {
      console.error("ERROR loading feedback records:", err);
      summaryBox.innerHTML = `
        <div class="error-banner">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Failed to fetch feedback summary: ${err.message}
        </div>
      `;
      feedbackTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="error-state">
             <span class="error-icon"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>
            <span>Failed to load feedback sessions from database.</span>
          </td>
        </tr>
      `;
      showToast("Error retrieving feedback sessions.", "error");
    }
  }

  // ----------- 8. SUMMARY ANALYTICS METRICS CARDS -----------
  function renderSummary(summary = {}) {
    const avgContent = Number(summary.avg_content_rating || 0);
    const avgSatisfaction = Number(summary.avg_satisfaction || 0);
    const avgKnowledge = Number(summary.avg_trainer_knowledge || 0);
    const totalFeedback = summary.total_feedback || 0;

    summaryBox.innerHTML = `
      <div class="summary-card glass-panel animate-fade-in" id="card-content">
        <div class="summary-card-header">
          <div class="card-icon-wrapper bg-emerald-glow"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>
          <span class="card-title">Course Content</span>
        </div>
        <div class="card-value-wrapper">
          <h3 class="card-value" id="val-avg-content">0</h3>
          <span class="value-max">/ 5.0</span>
        </div>
        <div class="rating-progress-bar">
          <div class="rating-progress-fill fill-emerald" id="progress-avg-content" style="width: 0%"></div>
        </div>
      </div>
      
      <div class="summary-card glass-panel animate-fade-in" id="card-satisfaction" style="animation-delay: 0.05s;">
        <div class="summary-card-header">
           <div class="card-icon-wrapper bg-blue-glow"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; color:#eab308;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
          <span class="card-title">Satisfaction Level</span>
        </div>
        <div class="card-value-wrapper">
          <h3 class="card-value" id="val-avg-satisfaction">0</h3>
          <span class="value-max">/ 5.0</span>
        </div>
        <div class="rating-progress-bar">
          <div class="rating-progress-fill fill-blue" id="progress-avg-satisfaction" style="width: 0%"></div>
        </div>
      </div>
      
      <div class="summary-card glass-panel animate-fade-in" id="card-knowledge" style="animation-delay: 0.1s;">
        <div class="summary-card-header">
          <div class="card-icon-wrapper bg-purple-glow"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" /></svg></div>
          <span class="card-title">Trainer Knowledge</span>
        </div>
        <div class="card-value-wrapper">
          <h3 class="card-value" id="val-avg-knowledge">0</h3>
          <span class="value-max">/ 5.0</span>
        </div>
        <div class="rating-progress-bar">
          <div class="rating-progress-fill fill-purple" id="progress-avg-knowledge" style="width: 0%"></div>
        </div>
      </div>
      
      <div class="summary-card glass-panel animate-fade-in" id="card-total" style="animation-delay: 0.15s;">
        <div class="summary-card-header">
          <div class="card-icon-wrapper bg-orange-glow"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div>
          <span class="card-title">Total Feedbacks</span>
        </div>
        <div class="card-value-wrapper">
          <h3 class="card-value" id="val-total-feedbacks">0</h3>
        </div>
        <div class="card-meta-text">Completed Student Surveys</div>
      </div>
    `;

    // Trigger animations
    animateDecimalCounter("val-avg-content", avgContent);
    animateDecimalCounter("val-avg-satisfaction", avgSatisfaction);
    animateDecimalCounter("val-avg-knowledge", avgKnowledge);
    animateCounter("val-total-feedbacks", totalFeedback);

    // Animate progress fills
    setTimeout(() => {
      const pContent = document.getElementById("progress-avg-content");
      const pSatisfaction = document.getElementById("progress-avg-satisfaction");
      const pKnowledge = document.getElementById("progress-avg-knowledge");
      if (pContent) pContent.style.width = `${(avgContent / 5) * 100}%`;
      if (pSatisfaction) pSatisfaction.style.width = `${(avgSatisfaction / 5) * 100}%`;
      if (pKnowledge) pKnowledge.style.width = `${(avgKnowledge / 5) * 100}%`;
    }, 100);
  }

  function animateDecimalCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let start = 0;
    const duration = 800;
    const increment = targetValue / (duration / 25) || 0.1;

    clearInterval(el.timer);
    if (targetValue === 0) {
      el.textContent = "0.00";
      return;
    }

    el.timer = setInterval(() => {
      start += increment;
      if (start >= targetValue) {
        start = targetValue;
        clearInterval(el.timer);
      }
      el.textContent = start.toFixed(2);
    }, 25);
  }

  function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let start = 0;
    const duration = 800;
    const increment = Math.ceil(targetValue / (duration / 25)) || 1;

    clearInterval(el.timer);
    if (targetValue === 0) {
      el.textContent = "0";
      return;
    }

    el.timer = setInterval(() => {
      start += increment;
      if (start >= targetValue) {
        start = targetValue;
        clearInterval(el.timer);
      }
      el.textContent = start.toLocaleString();
    }, 25);
  }

  // ----------- 9. SEARCH & PAGINATED TABLE RENDER -----------
  function filterAndPaginate() {
    const searchVal = (tableSearch?.value || "").toLowerCase().trim();

    if (searchVal) {
      filteredRows = allRows.filter(row => {
        return (
          (row.trainer || "").toLowerCase().includes(searchVal) ||
          (row.college || "").toLowerCase().includes(searchVal) ||
          (row.course || "").toLowerCase().includes(searchVal) ||
          (row.section || "").toLowerCase().includes(searchVal) ||
          (row.date || "").toLowerCase().includes(searchVal)
        );
      });
    } else {
      filteredRows = [...allRows];
    }

    if (sessionCountBadge) {
      sessionCountBadge.textContent = `${filteredRows.length} Session${filteredRows.length === 1 ? "" : "s"}`;
    }

    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
    if (currentPage > totalPages) {
      currentPage = 1;
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, filteredRows.length);
    const pageRows = filteredRows.slice(startIndex, endIndex);

    renderTableRows(pageRows);
    renderPaginationControls(filteredRows.length, totalPages, startIndex + 1, endIndex);
  }

  function renderTableRows(rows = []) {
    feedbackTableBody.innerHTML = "";

    if (!rows.length) {
      feedbackTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="no-data-td">
            <div class="no-data-wrapper">
              <span class="no-data-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></span>
              <p>No feedback sessions match your parameters.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");

      // Format dynamic badge for feedback counts
      let countClass = "badge-neutral";
      if (row.feedback_count > 15) {
        countClass = "badge-high";
      } else if (row.feedback_count >= 5) {
        countClass = "badge-mid";
      }

      tr.innerHTML = `
        <td class="td-bold">${safe(row.trainer)}</td>
        <td>${safe(row.college)}</td>
        <td><span class="text-tag">${safe(row.course)}</span></td>
        <td class="text-center">Year ${safe(row.year)}</td>
        <td class="text-center">Sem ${safe(row.semester)}</td>
        <td class="text-center"><span class="section-tag">${safe(row.section)}</span></td>
        <td class="td-date">${safe(row.date)}</td>
        <td class="text-center"><span class="slot-pill">Slot ${safe(row.slot)}</span></td>
        <td class="text-center">
          <span class="count-badge ${countClass}">${safe(row.feedback_count)}</span>
        </td>
        <td class="text-center">
          <button
            class="view-feedback-btn btn btn-icon-only"
            data-college="${safe(row.college_id)}"
            data-course="${safe(row.course_id)}"
            data-year="${safe(row.year)}"
            data-semester="${safe(row.semester)}"
            data-section="${safe(row.section_id)}"
            data-trainer="${safe(row.trainer_id)}"
            data-date="${safe(row.date)}"
            data-slot="${safe(row.slot)}"
            title="View Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </td>
      `;

      feedbackTableBody.appendChild(tr);
    });

    // Add listeners to actions
    document.querySelectorAll(".view-feedback-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const params = new URLSearchParams({
          college: btn.dataset.college,
          course: btn.dataset.course,
          year: btn.dataset.year,
          semester: btn.dataset.semester,
          section: btn.dataset.section,
          trainer: btn.dataset.trainer,
          date: btn.dataset.date,
          slot: btn.dataset.slot,
        });
        window.location.href = `${sessionDetailUrl}?${params.toString()}`;
      });
    });
  }

  function renderPaginationControls(totalItems, totalPages, startNum, endNum) {
    if (paginationInfo) {
      if (totalItems === 0) {
        paginationInfo.textContent = "Showing 0 to 0 of 0 sessions";
      } else {
        paginationInfo.textContent = `Showing ${startNum} to ${endNum} of ${totalItems} sessions`;
      }
    }

    if (!paginationControls) return;
    paginationControls.innerHTML = "";

    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement("button");
    prevBtn.className = `pagination-btn ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.innerHTML = `
      <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        filterAndPaginate();
      }
    });
    paginationControls.appendChild(prevBtn);

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 6 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
        if (i === 2 || i === totalPages - 1) {
          const dot = document.createElement("span");
          dot.className = "pagination-dots";
          dot.textContent = "...";
          paginationControls.appendChild(dot);
        }
        continue;
      }

      const numBtn = document.createElement("button");
      numBtn.className = `pagination-btn page-num ${i === currentPage ? 'active' : ''}`;
      numBtn.textContent = i;
      numBtn.addEventListener("click", () => {
        currentPage = i;
        filterAndPaginate();
      });
      paginationControls.appendChild(numBtn);
    }

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = `pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.innerHTML = `
      <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        filterAndPaginate();
      }
    });
    paginationControls.appendChild(nextBtn);
  }

  // ----------- 10. VISUAL GRADIENT RATINGS CHARTS -----------
  let studentChart;
  let trainerChart;

  function renderCharts(data = {}) {
    const s = data.summary || {};
    const studentCanvas = document.getElementById("studentChart");
    const trainerCanvas = document.getElementById("trainerChart");

    if (!studentCanvas || !trainerCanvas || typeof Chart === "undefined") {
      return;
    }

    if (studentChart) studentChart.destroy();
    if (trainerChart) trainerChart.destroy();

    const fontConfig = {
      family: "'Century Gothic', sans-serif",
      size: 11,
      weight: '600'
    };

    const ctxStudent = studentCanvas.getContext("2d");
    const ctxTrainer = trainerCanvas.getContext("2d");

    // Creating glowing linear gradients
    const gradStudent1 = ctxStudent.createLinearGradient(0, 0, 0, 300);
    gradStudent1.addColorStop(0, "rgba(16, 185, 129, 0.95)"); // Emerald
    gradStudent1.addColorStop(1, "rgba(16, 185, 129, 0.2)");

    const gradStudent2 = ctxStudent.createLinearGradient(0, 0, 0, 300);
    gradStudent2.addColorStop(0, "rgba(59, 130, 246, 0.95)"); // Blue
    gradStudent2.addColorStop(1, "rgba(59, 130, 246, 0.2)");

    const gradTrainer = ctxTrainer.createLinearGradient(0, 0, 0, 300);
    gradTrainer.addColorStop(0, "rgba(139, 92, 246, 0.95)"); // Purple
    gradTrainer.addColorStop(1, "rgba(139, 92, 246, 0.2)");

    // Course Content & Satisfaction
    studentChart = new Chart(studentCanvas, {
      type: "bar",
      data: {
        labels: ["Course Content", "Satisfaction Level"],
        datasets: [{
          label: "Average Rating",
          data: [
            Number(s.avg_content_rating || 0),
            Number(s.avg_satisfaction || 0)
          ],
          backgroundColor: [gradStudent1, gradStudent2],
          borderColor: ["#10b981", "#3b82f6"],
          borderWidth: 2,
          borderRadius: 8,
          barThickness: 45
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            padding: 10,
            cornerRadius: 8,
            titleFont: fontConfig
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 5,
            grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
            ticks: { color: '#64748b', font: fontConfig }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: fontConfig }
          }
        }
      }
    });

    // Trainer Knowledge Mastery
    trainerChart = new Chart(trainerCanvas, {
      type: "bar",
      data: {
        labels: ["Trainer Knowledge Mastery"],
        datasets: [{
          label: "Average Rating",
          data: [Number(s.avg_trainer_knowledge || 0)],
          backgroundColor: [gradTrainer],
          borderColor: ["#8b5cf6"],
          borderWidth: 2,
          borderRadius: 8,
          barThickness: 45
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            padding: 10,
            cornerRadius: 8,
            titleFont: fontConfig
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 5,
            grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
            ticks: { color: '#64748b', font: fontConfig }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: fontConfig }
          }
        }
      }
    });
  }

  // ----------- 11. DOWNLOAD CSV ACTIONS -----------
  downloadBtn.addEventListener("click", () => {
    const url = `${apiDownloadUrl}?${buildParams().toString()}`;
    console.log("Exporting CSV feedback data:", url);
    showToast("Preparing feedback CSV download...", "info");
    window.location.href = url;
  });

  // ----------- 12. SEARCH INPUT AND DATES LISTENERS -----------
  let searchTimeout;
  tableSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      filterAndPaginate();
    }, 300);
  });

  startInp.addEventListener("change", () => {
    filters.start = startInp.value;
    currentPage = 1;
    loadFeedback();
  });

  endInp.addEventListener("change", () => {
    filters.end = endInp.value;
    currentPage = 1;
    loadFeedback();
  });

  // ----------- 13. RESET BUTTON ACTION -----------
  resetBtn.addEventListener("click", () => {
    tableSearch.value = "";
    startInp.value = "";
    endInp.value = "";

    filters.colleges = [];
    filters.courses = [];
    filters.sections = [];
    filters.trainers = [];
    filters.years = [];
    filters.semesters = [];
    filters.start = "";
    filters.end = "";
    filters.search = "";

    // Clear checkboxes and labels
    document.querySelectorAll(".option-checkbox").forEach(cb => cb.checked = false);
    const types = ["college", "course", "section", "trainer", "year", "semester"];
    types.forEach(t => updateDropdownLabel(t, []));

    // Reset cascades
    loadSectionsCascade([], []);

    currentPage = 1;
    loadFeedback();
    showToast("Feedback filters reset successfully.");
  });

  // ----------- 14. TOAST NOTIFICATIONS -----------
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type} animate-slide-in`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-indicator"></span>
        <span class="toast-message">${escapeHtml(message)}</span>
      </div>
      <button class="toast-close" type="button" aria-label="Close message">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.classList.add("animate-fade-out");
      setTimeout(() => toast.remove(), 350);
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("animate-fade-out");
        setTimeout(() => toast.remove(), 350);
      }
    }, 4500);
  }

  // ----------- 15. UTILS -----------
  function safe(val) {
    if (val === null || val === undefined || val === "") return "-";
    return escapeHtml(val);
  }

  function escapeHtml(text) {
    if (text === null || text === undefined || text === "") return "-";
    if (typeof text !== "string") return String(text);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ----------- 16. INITIALIZATION -----------
  setupDropdowns();
  loadInitialFilterChoices();
  loadFeedback();
});
