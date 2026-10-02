// ========================================================================
// admin_trainer_reports.js — Advanced Multi-Select, Cascading & Futuristic Analytics
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Admin Trainer Reports JS initialized");

  // ----------- 1. ELEMENT REFERENCES -----------
  const reportApiDiv = document.getElementById("report-api");
  if (!reportApiDiv) {
    console.error("ERROR: #report-api configuration div not found.");
    return;
  }

  // Retrieve URLs from data attributes
  const apiUrl = reportApiDiv.dataset.url;
  const exportUrl = reportApiDiv.dataset.exportUrl;
  const trainerUrl = reportApiDiv.dataset.trainerUrl;
  const collegesUrl = reportApiDiv.dataset.collegesUrl;
  const coursesUrl = reportApiDiv.dataset.coursesUrl;
  const sectionsUrl = reportApiDiv.dataset.sectionsUrl;
  const domainsUrl = reportApiDiv.dataset.domainsUrl;
  const subdomainsBaseUrl = reportApiDiv.dataset.subdomainsBaseUrl;
  const yearsUrl = reportApiDiv.dataset.yearsUrl;
  const semestersUrl = reportApiDiv.dataset.semestersUrl;

  const tableBody = document.querySelector("#adminReportTable tbody");
  const searchInput = document.getElementById("searchInput");
  const fromDate = document.getElementById("fromDate");
  const toDate = document.getElementById("toDate");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const exportBtn = document.getElementById("exportExcelBtn");
  const selectAllCheckbox = document.getElementById("selectAllCheckbox");
  const selectedCounter = document.getElementById("selected-counter");
  const clearSelectionsBtn = document.getElementById("clear-selections-btn");
  const reportsShowingSummary = document.getElementById("reports-showing-summary");
  const paginationContainer = document.getElementById("paginationContainer");

  // Modal elements
  const detailModal = document.getElementById("reportDetailModal");
  const closeModalBtns = document.querySelectorAll("#closeModalBtn, #closeModalBtnFooter");

  // ----------- 2. STATE MANAGEMENT -----------
  let reportsData = []; // Full loaded dataset from backend
  let selectedReportIds = new Set(); // Multi-selection state
  let currentPage = 1;
  const pageSize = 10;

  // Active filters selection arrays
  const filters = {
    trainers: [],
    colleges: [],
    courses: [],
    sections: [],
    domains: [],
    subdomains: [],
    years: [],
    semesters: [],
    search: "",
    from: "",
    to: ""
  };

  // ----------- 3. MULTI-SELECT DROPDOWN SYSTEM -----------
  
  // Initialize dynamic popover display logic
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
    if (type === "domain") {
      // Reload subdomains based on domain choices
      loadSubdomainsCascade(selectedValues);
    } else if (type === "college" || type === "course") {
      // Reload sections based on college and course choices
      loadSectionsCascade(filters.colleges, filters.courses);
    }

    // Refresh reports
    currentPage = 1;
    fetchReports();
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

  // Render populated options list inside popovers
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

  // Cascading Domain -> Subdomain (multi-select promise resolution)
  async function loadSubdomainsCascade(domainIds) {
    const subOptionsContainer = document.getElementById("options-subdomain");
    if (!domainIds || domainIds.length === 0) {
      subOptionsContainer.innerHTML = '<div class="popover-placeholder">Select domain first</div>';
      updateDropdownLabel("subdomain", []);
      filters.subdomains = [];
      return;
    }

    subOptionsContainer.innerHTML = '<div class="popover-loading">Loading subdomains...</div>';
    try {
      const promises = domainIds.map(id => 
        fetch(`${subdomainsBaseUrl}${id}/`)
          .then(res => {
            if (!res.ok) throw new Error("Subdomain fetch error");
            return res.json();
          })
      );

      const results = await Promise.all(promises);
      let allSubdomains = [];
      results.forEach(list => {
        allSubdomains = allSubdomains.concat(list || []);
      });

      // Deduplicate subdomains
      const uniqueSubdomains = [];
      const seen = new Set();
      allSubdomains.forEach(sub => {
        if (sub && sub.id && !seen.has(sub.id)) {
          seen.add(sub.id);
          uniqueSubdomains.push(sub);
        }
      });

      // Format for options rendering
      const sublist = uniqueSubdomains.map(s => ({
        id: s.id,
        name: s.subdomain_name
      }));
      
      // Auto-prune previous subselection if they don't exist anymore in the new domain set
      const validSubIds = sublist.map(s => String(s.id));
      filters.subdomains = filters.subdomains.filter(id => validSubIds.includes(id));
      updateDropdownLabel("subdomain", filters.subdomains);

      renderDropdownOptions("subdomain", sublist, "Subdomain");
    } catch (err) {
      console.error("ERROR fetching cascaded subdomains:", err);
      subOptionsContainer.innerHTML = '<div class="popover-error">Error loading subdomains</div>';
    }
  }

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
      const [trainersRes, collegesRes, coursesRes, domainsRes, yearsRes, semestersRes] = await Promise.all([
        fetch(trainerUrl).then(r => r.json()),
        fetch(collegesUrl).then(r => r.json()),
        fetch(coursesUrl).then(r => r.json()),
        fetch(domainsUrl).then(r => r.json()),
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
      renderDropdownOptions("domain", getArray(domainsRes).map(d => ({ id: d.id, name: d.domain_name })), "Domain");
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

  // ----------- 6. FETCH & BIND REPORT DATA -----------
  async function fetchReports() {
    if (!apiUrl) return;

    // Show table loading state
    tableBody.innerHTML = `
      <tr>
        <td colspan="17" class="loading-state">
          <div class="loading-spinner"></div>
          <span>Retrieving report data...</span>
        </td>
      </tr>
    `;

    try {
      // Construct URL parameters
      const params = new URLSearchParams();
      if (filters.from) params.append("from", filters.from);
      if (filters.to) params.append("to", filters.to);
      if (filters.trainers.length) params.append("trainer", filters.trainers.join(","));
      if (filters.colleges.length) params.append("college", filters.colleges.join(","));
      if (filters.courses.length) params.append("course", filters.courses.join(","));
      if (filters.sections.length) params.append("section", filters.sections.join(","));
      if (filters.domains.length) params.append("domain", filters.domains.join(","));
      if (filters.subdomains.length) params.append("subdomain", filters.subdomains.join(","));
      if (filters.years.length) params.append("year", filters.years.join(","));
      if (filters.semesters.length) params.append("semester", filters.semesters.join(","));
      if (filters.search) params.append("search", filters.search);

      console.log("📡 Fetching reports URL:", `${apiUrl}?${params.toString()}`);
      
      const response = await fetch(`${apiUrl}?${params.toString()}`);
      if (!response.ok) throw new Error(`Reports API returned ${response.status}`);
      
      const data = await response.json();
      reportsData = data.reports || [];
      
      // Update Live UI Analytics Cards
      updateMetricsCards(reportsData);

      // Render first page
      renderReportsTable();

    } catch (err) {
      console.error("ERROR fetching trainer reports:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="17" class="error-state">
             <span class="error-icon"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>
            <span>Error loading reports from database. Please reload.</span>
          </td>
        </tr>
      `;
      showToast("Error retrieving session records.", "error");
    }
  }

  // ----------- 7. RENDER DATATABLE & PAGINATION -----------
  function renderReportsTable() {
    tableBody.innerHTML = "";

    if (reportsData.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="17" class="no-data-state">
            <span class="no-data-icon">📁</span>
            <span>No reports match the selection criteria.</span>
          </td>
        </tr>
      `;
      reportsShowingSummary.textContent = "Showing 0 to 0 of 0 reports";
      paginationContainer.innerHTML = "";
      selectAllCheckbox.checked = false;
      return;
    }

    // Slice for pagination
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, reportsData.length);
    const paginatedItems = reportsData.slice(startIdx, endIdx);

    reportsShowingSummary.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${reportsData.length} reports`;

    // Append Rows
    paginatedItems.forEach(r => {
      const isSelected = selectedReportIds.has(r.id);
      
      // Attendance percentage
      const attRate = r.total_students > 0 ? Math.round((r.present_students / r.total_students) * 100) : 0;
      
      const row = document.createElement("tr");
      row.className = isSelected ? "selected-row" : "";
      row.innerHTML = `
        <td class="col-checkbox">
          <label class="custom-checkbox-container">
            <input type="checkbox" class="row-checkbox" data-id="${r.id}" ${isSelected ? 'checked' : ''}>
            <span class="checkbox-checkmark"></span>
          </label>
        </td>
        <td class="col-date">${escapeHtml(r.date)}</td>
        <td class="col-trainer fw-600">${escapeHtml(r.trainer)}</td>
        <td class="col-college">${escapeHtml(r.college)}</td>
        <td class="col-course">${escapeHtml(r.course)}</td>
        <td class="col-class-meta">${escapeHtml(r.year)}</td>
        <td class="col-class-meta">${escapeHtml(r.semester)}</td>
        <td class="col-class-meta">${escapeHtml(r.section)}</td>
        <td class="col-domain">${escapeHtml(r.domain)}</td>
        <td class="col-subdomain">${escapeHtml(r.subdomain)}</td>
        <td class="col-module">${escapeHtml(r.module)}</td>
        <td class="col-attendance">
          <div class="table-attendance-bar-wrapper">
            <div class="table-attendance-bar" style="width: ${attRate}%"></div>
          </div>
          <span class="table-attendance-val">${attRate}%</span>
        </td>
        <td class="col-badge">${badge(r.exercises_solved)}</td>
        <td class="col-badge">${badge(r.materials_shared)}</td>
        <td class="col-badge">${badge(r.assignments_given)}</td>
        <td class="col-actions">
          <button class="btn btn-icon-only view-details-btn" data-id="${r.id}" title="View Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        </td>
      `;

      tableBody.appendChild(row);

      // Handle Row Checkbox Selection
      row.querySelector(".row-checkbox").addEventListener("change", (e) => {
        e.stopPropagation();
        toggleRowSelection(r.id, e.target.checked);
      });

      // Clicking row trigger modal details view
      row.querySelector(".view-details-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openReportDetailsModal(r);
      });
    });

    // Check if select-all checkbox header should be checked
    updateSelectAllCheckboxState(paginatedItems);

    // Render Pagination Controls
    renderPaginationControls();
  }

  function badge(val) {
    if (val === "Yes") {
      return '<span class="status-badge badge-yes">Yes</span>';
    }
    return '<span class="status-badge badge-no">No</span>';
  }

  function toggleRowSelection(reportId, select) {
    if (select) {
      selectedReportIds.add(reportId);
    } else {
      selectedReportIds.delete(reportId);
    }

    // Refresh row selected styles
    renderReportsTable();

    // Update Counter info bar
    updateSelectionCounterUI();
  }

  function updateSelectionCounterUI() {
    const totalSelected = selectedReportIds.size;
    selectedCounter.textContent = `${totalSelected} report${totalSelected !== 1 ? 's' : ''} selected`;
    
    if (totalSelected > 0) {
      clearSelectionsBtn.style.display = "inline-block";
      exportBtn.classList.add("btn-accent");
      exportBtn.querySelector("span").textContent = "Export Selected";
    } else {
      clearSelectionsBtn.style.display = "none";
      exportBtn.classList.remove("btn-accent");
      exportBtn.querySelector("span").textContent = "Export to Excel";
    }
  }

  function updateSelectAllCheckboxState(pageItems) {
    if (!pageItems || pageItems.length === 0) {
      selectAllCheckbox.checked = false;
      return;
    }
    
    const allSelected = pageItems.every(r => selectedReportIds.has(r.id));
    selectAllCheckbox.checked = allSelected;
  }

  // Checkbox Select All click
  selectAllCheckbox.addEventListener("change", () => {
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, reportsData.length);
    const paginatedItems = reportsData.slice(startIdx, endIdx);

    paginatedItems.forEach(r => {
      if (selectAllCheckbox.checked) {
        selectedReportIds.add(r.id);
      } else {
        selectedReportIds.delete(r.id);
      }
    });

    renderReportsTable();
    updateSelectionCounterUI();
  });

  // Clear selections action button
  clearSelectionsBtn.addEventListener("click", () => {
    selectedReportIds.clear();
    renderReportsTable();
    updateSelectionCounterUI();
    showToast("Selection cleared.");
  });

  // Render Pagination HTML
  function renderPaginationControls() {
    const totalPages = Math.ceil(reportsData.length / pageSize);
    paginationContainer.innerHTML = "";

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
        renderReportsTable();
      }
    });
    paginationContainer.appendChild(prevBtn);

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
      // Limit visible pages for tight UI
      if (totalPages > 6 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
        if (i === 2 || i === totalPages - 1) {
          const dot = document.createElement("span");
          dot.className = "pagination-dots";
          dot.textContent = "...";
          paginationContainer.appendChild(dot);
        }
        continue;
      }

      const numBtn = document.createElement("button");
      numBtn.className = `pagination-btn page-num ${i === currentPage ? 'active' : ''}`;
      numBtn.textContent = i;
      numBtn.addEventListener("click", () => {
        currentPage = i;
        renderReportsTable();
      });
      paginationContainer.appendChild(numBtn);
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
        renderReportsTable();
      }
    });
    paginationContainer.appendChild(nextBtn);
  }

  // ----------- 8. LIVE UI METRICS ANALYTICS -----------
  function updateMetricsCards(reports) {
    const totalReports = reports.length;
    
    // Set of trainers represented
    const trainersRepresented = new Set(reports.map(r => r.trainer)).size;

    // Average Presence rate across all reported stats
    let totalStudents = 0;
    let presentStudents = 0;
    let activeDeliverablesCount = 0;
    let totalDeliverablesChecks = 0;

    reports.forEach(r => {
      totalStudents += r.total_students || 0;
      presentStudents += r.present_students || 0;

      // Deliverables activity (Yes checks)
      if (r.exercises_solved === "Yes") activeDeliverablesCount++;
      if (r.materials_shared === "Yes") activeDeliverablesCount++;
      if (r.assignments_given === "Yes") activeDeliverablesCount++;
      totalDeliverablesChecks += 3;
    });

    const presenceRateVal = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;
    const engagementVal = totalDeliverablesChecks > 0 ? Math.round((activeDeliverablesCount / totalDeliverablesChecks) * 100) : 0;

    // Futuristic Counter count-up animations
    animateValueCounter("val-total-reports", totalReports);
    animateValueCounter("val-active-trainers", trainersRepresented);
    animateValuePercentage("val-avg-attendance", presenceRateVal);
    animateValuePercentage("val-activity-rate", engagementVal);
  }

  // Count up numbers
  function animateValueCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let start = 0;
    const duration = 800; // ms
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

  // Count up percentages
  function animateValuePercentage(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let start = 0;
    const duration = 800; // ms
    const increment = Math.ceil(targetValue / (duration / 25)) || 1;

    clearInterval(el.timer);

    if (targetValue === 0) {
      el.textContent = "0%";
      return;
    }

    el.timer = setInterval(() => {
      start += increment;
      if (start >= targetValue) {
        start = targetValue;
        clearInterval(el.timer);
      }
      el.textContent = `${start}%`;
    }, 25);
  }

  // ----------- 9. DETAILS GLASSMORPHISM MODAL -----------
  function openReportDetailsModal(r) {
    if (!detailModal) return;

    const rate = r.total_students > 0 ? Math.round((r.present_students / r.total_students) * 100) : 0;

    // Populate data nodes
    document.getElementById("modal-trainer").textContent = r.trainer;
    document.getElementById("modal-date").textContent = r.date;
    document.getElementById("modal-college").textContent = r.college;
    document.getElementById("modal-course").textContent = r.course;
    document.getElementById("modal-class-details").textContent = `Year ${r.year} | Sem ${r.semester} | Sec ${r.section}`;
    document.getElementById("modal-scope").textContent = `${r.domain} / ${r.subdomain} (Module: ${r.module})`;

    // Attendance stats
    document.getElementById("modal-total-students").textContent = r.total_students;
    document.getElementById("modal-present-students").textContent = r.present_students;
    document.getElementById("modal-absent-students").textContent = r.absent_students;
    document.getElementById("modal-attendance-text").textContent = `${rate}% (${r.present_students} / ${r.total_students})`;
    document.getElementById("modal-attendance-progress").style.width = `${rate}%`;

    // Deliverables checklists
    updateChecklistItem("modal-exercises", r.exercises_solved);
    updateChecklistItem("modal-materials", r.materials_shared);
    updateChecklistItem("modal-assignments", r.assignments_given);

    // Daily Summary text
    document.getElementById("modal-summary").textContent = r.summary || "No summary text submitted.";
    document.getElementById("modal-submitted-at").textContent = r.submitted_at;

    // Show modal nodes
    detailModal.classList.add("show");
    detailModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; // disable body scrolling

    // Keyboard focus trap helper
    detailModal.focus();
  }

  function updateChecklistItem(elemId, status) {
    const item = document.getElementById(elemId);
    if (!item) return;

    const dot = item.querySelector(".chk-status");
    if (status === "Yes") {
      item.className = "checklist-item completed";
      dot.innerHTML = `
        <svg class="chk-icon-svg text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else {
      item.className = "checklist-item missing";
      dot.innerHTML = `
        <svg class="chk-icon-svg text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    }
  }

  function closeReportDetailsModal() {
    if (!detailModal) return;
    detailModal.classList.remove("show");
    detailModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; // enable scrolling
  }

  // Bind close buttons
  closeModalBtns.forEach(btn => {
    btn.addEventListener("click", closeReportDetailsModal);
  });

  // Close on outside click
  detailModal?.addEventListener("click", (e) => {
    if (e.target === detailModal) {
      closeReportDetailsModal();
    }
  });

  // Close on keyboard Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && detailModal?.classList.contains("show")) {
      closeReportDetailsModal();
    }
  });

  // ----------- 10. EXPORT TO EXCEL ROUTE -----------
  exportBtn.addEventListener("click", () => {
    if (!exportUrl) return;

    let finalExportUrl = exportUrl;
    
    // Check if row selection is active
    if (selectedReportIds.size > 0) {
      const selectedIds = Array.from(selectedReportIds).join(",");
      finalExportUrl += `?report_ids=${selectedIds}`;
      showToast(`Exporting ${selectedReportIds.size} selected reports...`, "info");
    } else {
      // Export all matches currently filtered
      const params = new URLSearchParams();
      if (filters.from) params.append("from", filters.from);
      if (filters.to) params.append("to", filters.to);
      if (filters.trainers.length) params.append("trainer", filters.trainers.join(","));
      if (filters.colleges.length) params.append("college", filters.colleges.join(","));
      if (filters.courses.length) params.append("course", filters.courses.join(","));
      if (filters.sections.length) params.append("section", filters.sections.join(","));
      if (filters.domains.length) params.append("domain", filters.domains.join(","));
      if (filters.subdomains.length) params.append("subdomain", filters.subdomains.join(","));
      if (filters.years.length) params.append("year", filters.years.join(","));
      if (filters.semesters.length) params.append("semester", filters.semesters.join(","));
      if (filters.search) params.append("search", filters.search);

      finalExportUrl += `?${params.toString()}`;
      showToast("Generating spreadsheet for current filters...", "info");
    }

    console.log("Exporting Excel with URL:", finalExportUrl);
    window.location.href = finalExportUrl;
  });

  // ----------- 11. TOOLBAR FILTERS BINDING -----------

  // Client-side debounced search input query
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filters.search = searchInput.value.trim();
      currentPage = 1;
      fetchReports();
    }, 300);
  });

  // Date range picker listeners
  fromDate.addEventListener("change", () => {
    filters.from = fromDate.value;
    currentPage = 1;
    fetchReports();
  });

  toDate.addEventListener("change", () => {
    filters.to = toDate.value;
    currentPage = 1;
    fetchReports();
  });

  // Reset Filters Button Click
  resetFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    fromDate.value = "";
    toDate.value = "";

    // Clear active selections
    filters.trainers = [];
    filters.colleges = [];
    filters.courses = [];
    filters.sections = [];
    filters.domains = [];
    filters.subdomains = [];
    filters.years = [];
    filters.semesters = [];
    filters.search = "";
    filters.from = "";
    filters.to = "";

    // Clear checkbox statuses
    document.querySelectorAll(".option-checkbox").forEach(cb => cb.checked = false);

    // Reset dropdown trigger labels
    const types = ["trainer", "college", "course", "section", "domain", "subdomain", "year", "semester"];
    types.forEach(t => updateDropdownLabel(t, []));

    // Reset sections and subdomain cascades back to base options
    loadSubdomainsCascade([]);
    loadSectionsCascade([], []);

    selectedReportIds.clear();
    updateSelectionCounterUI();
    selectAllCheckbox.checked = false;

    currentPage = 1;
    fetchReports();
    showToast("Filters successfully reset.", "info");
  });

  // ----------- 12. TOAST NOTIFICATIONS POPUP -----------
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

    // Bind close trigger
    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.classList.add("animate-fade-out");
      setTimeout(() => toast.remove(), 350);
    });

    // Auto dismiss
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("animate-fade-out");
        setTimeout(() => toast.remove(), 350);
      }
    }, 4500);
  }

  // ----------- 13. HTML ESCAPE UTIL -----------
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

  // ----------- 14. INITIALIZATION START -----------
  setupDropdowns();
  loadInitialFilterChoices();
  fetchReports();
});
