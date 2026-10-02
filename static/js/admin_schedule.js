/**
 * admin_schedule.js
 * Full CRUD + Bulk Grid Scheduler + Excel Upload Scheduler + Module support
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("📡 Admin Schedule JS Loaded");

  // -------------------------------
  // 1️⃣ Base URL & CSRF Helpers
  // -------------------------------
  let BASE_URL = document.getElementById("apiBase")?.dataset?.baseUrl || "/api/admin/api/";
  if (!BASE_URL.endsWith("/")) BASE_URL += "/";
  BASE_URL = BASE_URL.replace(/(colleges|courses|domains|trainers|sections|subdomains|semesters|years)\/?$/, "");

  function getCSRFToken() {
    // 1. Try to get from hidden input in DOM (needed if CSRF_COOKIE_HTTPONLY is True)
    const domToken = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value;
    if (domToken) return domToken;

    // 2. Fallback to reading cookies
    let cookieValue = "";
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith("csrftoken=")) {
          cookieValue = decodeURIComponent(cookie.substring("csrftoken=".length));
          break;
        }
      }
    }
    return cookieValue;
  }

  // Cache object for dropdown options
  const cache = {
    colleges: [],
    courses: {},       // collegeId -> courses list
    sections: {},      // collegeId_courseId -> sections list
    domains: [],
    subdomains: {},    // domainId -> subdomains list
    modules: {},       // domainId_subdomainId -> modules list
    trainers: [],
    semesters: [],
    years: []
  };

  // -------------------------------
  // 2️⃣ Tab Control
  // -------------------------------
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(targetTab).classList.add("active");
      
      // Clear message box on tab change
      const msgBox = document.getElementById("messageBox");
      if (msgBox) {
        msgBox.textContent = "";
        msgBox.className = "message-box";
      }
    });
  });

  // -------------------------------
  // 3️⃣ DOM Elements & Initialization
  // -------------------------------
  const selects = {
    college: document.getElementById("college"),
    course: document.getElementById("course"),
    section: document.getElementById("section"),
    domain: document.getElementById("domain"),
    subdomain: document.getElementById("subdomain"),
    module: document.getElementById("module"),
    trainer: document.getElementById("trainer"),
    semester: document.getElementById("semester"),
    year: document.getElementById("year"),
  };

  const form = document.getElementById("sessionForm");
  const msgBox = document.getElementById("messageBox");

  async function fetchData(endpoint) {
    let url = endpoint.startsWith("/") || endpoint.includes("/api/") ? endpoint : `${BASE_URL}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // Pre-load data and build cache
  async function loadInitialData() {
    try {
      const [colleges, domains, trainers, semesters, years] = await Promise.all([
        fetchData("colleges/"),
        fetchData("domains/"),
        fetchData("trainers/"),
        fetchData("semesters/"),
        fetchData("years/")
      ]);

      cache.colleges = colleges;
      cache.domains = domains;
      cache.trainers = trainers;
      cache.semesters = semesters.semesters || semesters;
      cache.years = years.years || years;

      // Populate Single Scheduler dropdowns
      populateSelect(selects.college, cache.colleges, "name", "--Select College--");
      populateSelect(selects.domain, cache.domains, "domain_name", "--Select Domain--");
      populateSelect(selects.trainer, cache.trainers, "name", "--Select Trainer--");
      populateSelect(selects.semester, cache.semesters, "label", "--Select Semester--");
      populateSelect(selects.year, cache.years, "label", "--Select Year--");

      // Initialize the bulk grid with one row
      addBulkGridRow();

    } catch (err) {
      console.error("ERROR Loading initial data:", err);
    }
  }

  function populateSelect(select, list, labelKey = "name", placeholder = "--Select--") {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    list.forEach(item => {
      const label = item[labelKey] || item.name || item.domain_name || item.subdomain_name || item.label || item.id;
      const val = item.id !== undefined ? item.id : (item.value !== undefined ? item.value : (item.name !== undefined ? item.name : item));
      select.innerHTML += `<option value="${val}">${label}</option>`;
    });
    select.disabled = false;
  }

  loadInitialData();

  // -------------------------------
  // 4️⃣ Single Form Cascades
  // -------------------------------
  selects.college?.addEventListener("change", async (e) => {
    const collegeId = e.target.value;
    selects.course.disabled = true;
    selects.course.innerHTML = "<option value=''>--Select College First--</option>";
    selects.section.disabled = true;
    selects.section.innerHTML = "<option value=''>--Select Course First--</option>";

    if (!collegeId) return;

    if (!cache.courses[collegeId]) {
      selects.course.innerHTML = "<option value=''>Loading courses...</option>";
      const courses = await fetchData(`/college/courses/api/list/?college_id=${collegeId}`);
      cache.courses[collegeId] = courses;
    }
    populateSelect(selects.course, cache.courses[collegeId], "name", "--Select Course--");
  });

  selects.course?.addEventListener("change", async (e) => {
    const collegeId = selects.college.value;
    const courseId = e.target.value;
    selects.section.disabled = true;
    selects.section.innerHTML = "<option value=''>--Select Course First--</option>";

    if (!collegeId || !courseId) return;

    const cacheKey = `${collegeId}_${courseId}`;
    if (!cache.sections[cacheKey]) {
      selects.section.innerHTML = "<option value=''>Loading sections...</option>";
      const sections = await fetchData(`/college/get-sections/?college_id=${collegeId}&course_id=${courseId}`);
      cache.sections[cacheKey] = sections;
    }
    populateSelect(selects.section, cache.sections[cacheKey], "name", "--Select Section--");
  });

  selects.domain?.addEventListener("change", async (e) => {
    const domainId = e.target.value;
    selects.subdomain.innerHTML = "<option value=''>--Select Subdomain--</option>";
    selects.subdomain.disabled = true;
    selects.module.innerHTML = "<option value=''>--Select Domain First--</option>";
    selects.module.disabled = true;

    if (!domainId) return;

    // Fetch subdomains
    if (!cache.subdomains[domainId]) {
      const subdomains = await fetchData(`/api/admin/api/subdomains/${domainId}/`);
      cache.subdomains[domainId] = subdomains;
    }
    populateSelect(selects.subdomain, cache.subdomains[domainId], "subdomain_name", "--Select Subdomain--");

    // Fetch modules (without subdomain initially)
    const cacheKey = `${domainId}_all`;
    if (!cache.modules[cacheKey]) {
      const modules = await fetchData(`/api/admin/api/modules/?domain_id=${domainId}`);
      cache.modules[cacheKey] = modules;
    }
    populateSelect(selects.module, cache.modules[cacheKey], "name", "--Select Module--");
  });

  selects.subdomain?.addEventListener("change", async (e) => {
    const domainId = selects.domain.value;
    const subdomainId = e.target.value;

    if (!domainId) return;

    const cacheKey = subdomainId ? `${domainId}_${subdomainId}` : `${domainId}_all`;
    if (!cache.modules[cacheKey]) {
      selects.module.innerHTML = "<option value=''>Loading modules...</option>";
      let url = `/api/admin/api/modules/?domain_id=${domainId}`;
      if (subdomainId) url += `&subdomain_id=${subdomainId}`;
      const modules = await fetchData(url);
      cache.modules[cacheKey] = modules;
    }
    populateSelect(selects.module, cache.modules[cacheKey], "name", "--Select Module--");
  });

  // -------------------------------
  // 5️⃣ Single Scheduler Form Submission
  // -------------------------------
  form?.addEventListener("submit", async e => {
    e.preventDefault();
    msgBox.textContent = "Submitting...";
    msgBox.className = "message-box loading";

    const formData = new FormData(form);
    try {
      const res = await fetch(`${BASE_URL}schedule/create/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: formData,
        credentials: "include",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        msgBox.textContent = "OK Session Scheduled Successfully!";
        msgBox.className = "message-box success";
        form.reset();
        
        // Disable cascading dropdowns on reset
        selects.course.disabled = true;
        selects.section.disabled = true;
        selects.subdomain.disabled = true;
        selects.module.disabled = true;

        loadSessionTable();
      } else {
        msgBox.textContent = data.message || "WARNING Failed to schedule session.";
        msgBox.className = "message-box error";
      }
    } catch (err) {
      console.error("ERROR Submit failed:", err);
      msgBox.textContent = "Network error.";
      msgBox.className = "message-box error";
    }
  });

  // -------------------------------
  // 6️⃣ Interactive Bulk Grid Scheduler
  // -------------------------------
  const bulkGridBody = document.querySelector("#bulkGridTable tbody");
  const btnAddRow = document.getElementById("btnAddRow");
  const btnClearRows = document.getElementById("btnClearRows");
  const btnSubmitBulk = document.getElementById("btnSubmitBulk");

  let rowCounter = 0;

  function addBulkGridRow(cloneValues = false) {
    if (!bulkGridBody) return;

    rowCounter++;
    const rowId = `bulk-row-${rowCounter}`;
    const tr = document.createElement("tr");
    tr.id = rowId;

    tr.innerHTML = `
      <td><input type="date" class="grid-date" required></td>
      <td>
        <select class="grid-slot" required>
          <option value="">--Slot--</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </td>
      <td><select class="grid-college" required><option value="">--College--</option></select></td>
      <td><select class="grid-course" required disabled><option value="">--Select College First--</option></select></td>
      <td><select class="grid-section" required disabled><option value="">--Select Course First--</option></select></td>
      <td>
        <select class="grid-year" required>
          <option value="">--Year--</option>
        </select>
      </td>
      <td>
        <select class="grid-semester" required>
          <option value="">--Sem--</option>
        </select>
      </td>
      <td><select class="grid-domain" required><option value="">--Domain--</option></select></td>
      <td><select class="grid-subdomain" disabled><option value="">--Domain First--</option></select></td>
      <td><select class="grid-module" disabled><option value="">--Domain First--</option></select></td>
      <td><select class="grid-trainer" required><option value="">--Trainer--</option></select></td>
      <td>
          <button type="button" class="clone-row-btn" title="Clone Row"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
          <button type="button" class="delete-row-btn" title="Delete Row"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </td>
    `;

    bulkGridBody.appendChild(tr);

    // Grab elements in the new row
    const elCollege = tr.querySelector(".grid-college");
    const elCourse = tr.querySelector(".grid-course");
    const elSection = tr.querySelector(".grid-section");
    const elDomain = tr.querySelector(".grid-domain");
    const elSubdomain = tr.querySelector(".grid-subdomain");
    const elModule = tr.querySelector(".grid-module");
    const elTrainer = tr.querySelector(".grid-trainer");
    const elYear = tr.querySelector(".grid-year");
    const elSemester = tr.querySelector(".grid-semester");

    // Populate initial dropdowns from cache
    populateSelect(elCollege, cache.colleges, "name", "--College--");
    populateSelect(elDomain, cache.domains, "domain_name", "--Domain--");
    populateSelect(elTrainer, cache.trainers, "name", "--Trainer--");
    populateSelect(elYear, cache.years, "label", "--Year--");
    populateSelect(elSemester, cache.semesters, "label", "--Sem--");

    // Setup Row-specific cascades
    elCollege.addEventListener("change", async (e) => {
      const collegeId = e.target.value;
      elCourse.disabled = true;
      elCourse.innerHTML = "<option value=''>--Select College First--</option>";
      elSection.disabled = true;
      elSection.innerHTML = "<option value=''>--Select Course First--</option>";

      if (!collegeId) return;
      if (!cache.courses[collegeId]) {
        const courses = await fetchData(`/college/courses/api/list/?college_id=${collegeId}`);
        cache.courses[collegeId] = courses;
      }
      populateSelect(elCourse, cache.courses[collegeId], "name", "--Course--");
    });

    elCourse.addEventListener("change", async (e) => {
      const collegeId = elCollege.value;
      const courseId = e.target.value;
      elSection.disabled = true;
      elSection.innerHTML = "<option value=''>--Select Course First--</option>";

      if (!collegeId || !courseId) return;
      const cacheKey = `${collegeId}_${courseId}`;
      if (!cache.sections[cacheKey]) {
        const sections = await fetchData(`/college/get-sections/?college_id=${collegeId}&course_id=${courseId}`);
        cache.sections[cacheKey] = sections;
      }
      populateSelect(elSection, cache.sections[cacheKey], "name", "--Section--");
    });

    elDomain.addEventListener("change", async (e) => {
      const domainId = e.target.value;
      elSubdomain.innerHTML = "<option value=''>--Subdomain--</option>";
      elSubdomain.disabled = true;
      elModule.innerHTML = "<option value=''>--Domain First--</option>";
      elModule.disabled = true;

      if (!domainId) return;
      if (!cache.subdomains[domainId]) {
        const subdomains = await fetchData(`/api/admin/api/subdomains/${domainId}/`);
        cache.subdomains[domainId] = subdomains;
      }
      populateSelect(elSubdomain, cache.subdomains[domainId], "subdomain_name", "--Subdomain--");

      const cacheKey = `${domainId}_all`;
      if (!cache.modules[cacheKey]) {
        const modules = await fetchData(`/api/admin/api/modules/?domain_id=${domainId}`);
        cache.modules[cacheKey] = modules;
      }
      populateSelect(elModule, cache.modules[cacheKey], "name", "--Module--");
    });

    elSubdomain.addEventListener("change", async (e) => {
      const domainId = elDomain.value;
      const subdomainId = e.target.value;
      if (!domainId) return;

      const cacheKey = subdomainId ? `${domainId}_${subdomainId}` : `${domainId}_all`;
      if (!cache.modules[cacheKey]) {
        let url = `/api/admin/api/modules/?domain_id=${domainId}`;
        if (subdomainId) url += `&subdomain_id=${subdomainId}`;
        const modules = await fetchData(url);
        cache.modules[cacheKey] = modules;
      }
      populateSelect(elModule, cache.modules[cacheKey], "name", "--Module--");
    });

    // Wire clone / delete buttons
    tr.querySelector(".delete-row-btn").addEventListener("click", () => {
      tr.remove();
      if (bulkGridBody.children.length === 0) {
        addBulkGridRow();
      }
    });

    tr.querySelector(".clone-row-btn").addEventListener("click", () => {
      addBulkGridRow(true);
    });

    // If cloning values from the last row
    if (cloneValues && bulkGridBody.children.length > 1) {
      const sibling = tr.previousElementSibling;
      if (sibling) {
        tr.querySelector(".grid-date").value = sibling.querySelector(".grid-date").value;
        tr.querySelector(".grid-slot").value = sibling.querySelector(".grid-slot").value;
        elCollege.value = sibling.querySelector(".grid-college").value;
        
        // Trigger college course load
        if (elCollege.value) {
          elCollege.dispatchEvent(new Event("change"));
          setTimeout(() => {
            elCourse.value = sibling.querySelector(".grid-course").value;
            if (elCourse.value) {
              elCourse.dispatchEvent(new Event("change"));
              setTimeout(() => {
                elSection.value = sibling.querySelector(".grid-section").value;
              }, 100);
            }
          }, 100);
        }

        elYear.value = sibling.querySelector(".grid-year").value;
        elSemester.value = sibling.querySelector(".grid-semester").value;
        
        elDomain.value = sibling.querySelector(".grid-domain").value;
        if (elDomain.value) {
          elDomain.dispatchEvent(new Event("change"));
          setTimeout(() => {
            elSubdomain.value = sibling.querySelector(".grid-subdomain").value;
            if (elSubdomain.value) elSubdomain.dispatchEvent(new Event("change"));
            setTimeout(() => {
              elModule.value = sibling.querySelector(".grid-module").value;
            }, 100);
          }, 100);
        }

        elTrainer.value = sibling.querySelector(".grid-trainer").value;
      }
    }
  }

  btnAddRow?.addEventListener("click", () => addBulkGridRow(false));
  btnClearRows?.addEventListener("click", () => {
    if (bulkGridBody) {
      bulkGridBody.innerHTML = "";
      addBulkGridRow();
    }
  });

  // Submit Interactive Bulk Grid
  btnSubmitBulk?.addEventListener("click", async () => {
    const rows = bulkGridBody.querySelectorAll("tr");
    const schedules = [];
    let hasError = false;

    rows.forEach((row, index) => {
      const date = row.querySelector(".grid-date").value;
      const slot_no = row.querySelector(".grid-slot").value;
      const college = row.querySelector(".grid-college").value;
      const course = row.querySelector(".grid-course").value;
      const section = row.querySelector(".grid-section").value;
      const year = row.querySelector(".grid-year").value;
      const semester = row.querySelector(".grid-semester").value;
      const domain = row.querySelector(".grid-domain").value;
      const subdomain = row.querySelector(".grid-subdomain").value;
      const module = row.querySelector(".grid-module").value;
      const trainer = row.querySelector(".grid-trainer").value;

      if (!date || !slot_no || !college || !course || !section || !year || !semester || !domain) {
        alert(`Row ${index + 1} has empty required fields! Please check and fill them out.`);
        hasError = true;
        return;
      }

      schedules.push({
        date, slot_no, college, course, section, year, semester, domain, subdomain, module, trainer
      });
    });

    if (hasError || schedules.length === 0) return;

    msgBox.textContent = "Scheduling sessions in bulk...";
    msgBox.className = "message-box loading";

    try {
      const res = await fetch(`${BASE_URL}schedule/bulk-create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken()
        },
        body: JSON.stringify({ schedules })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        msgBox.textContent = data.message || "OK Bulk Sessions Scheduled Successfully!";
        msgBox.className = "message-box success";
        if (bulkGridBody) {
          bulkGridBody.innerHTML = "";
          addBulkGridRow();
        }
        loadSessionTable();
      } else {
        msgBox.textContent = data.message || "WARNING Failed to schedule sessions.";
        msgBox.className = "message-box error";
      }
    } catch (err) {
      console.error("ERROR Bulk Submit failed:", err);
      msgBox.textContent = "Network error while bulk scheduling.";
      msgBox.className = "message-box error";
    }
  });

  // -------------------------------
  // 7️⃣ Excel Upload Bulk Scheduler
  // -------------------------------
  const excelForm = document.getElementById("excelUploadForm");
  const fileInput = document.getElementById("excelFile");
  const fileNameDisplay = document.getElementById("fileNameDisplay");
  const btnDownloadTemplate = document.getElementById("btnDownloadTemplate");

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (fileNameDisplay) {
      fileNameDisplay.textContent = file ? file.name : "No file chosen";
    }
  });

  excelForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgBox.textContent = "Uploading and parsing file...";
    msgBox.className = "message-box loading";

    const formData = new FormData(excelForm);
    try {
      const res = await fetch(`${BASE_URL}schedule/bulk-excel-upload/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: formData,
        credentials: "include"
      });

      const data = await res.json();
      if (res.ok && data.success) {
        msgBox.textContent = data.message || "OK Excel Schedules Imported Successfully!";
        msgBox.className = "message-box success";
        excelForm.reset();
        if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
        loadSessionTable();
      } else {
        msgBox.textContent = data.message || "WARNING Failed to import schedules.";
        msgBox.className = "message-box error";
      }
    } catch (err) {
      console.error("ERROR Excel Upload failed:", err);
      msgBox.textContent = "Error uploading schedules.";
      msgBox.className = "message-box error";
    }
  });

  // Generate and download a CSV Template
  btnDownloadTemplate?.addEventListener("click", () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Slot,College,Course,Section,Year,Semester,Domain,Subdomain,Module,Trainer\r\n"
      + "2026-08-15,1,Kle,MCA,A,1,1,Technical Skills,Python,Lists & Tuples,Chaitra\r\n"
      + "2026-08-15,2,Kle,MCA,A,1,1,Technical Skills,Python,Strings Operations,Gouri\r\n";
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bulk_schedule_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // -------------------------------
  // 8️⃣ List Sessions
  // -------------------------------
  async function loadSessionTable() {
    const tableBody = document.querySelector("#sessionTable tbody");
    if (!tableBody) return;
    tableBody.innerHTML = "<tr><td colspan='13'>Loading...</td></tr>";

    try {
      const res = await fetch(`${BASE_URL}schedule/list/`);
      const data = await res.json();

      if (!data.success || !data.schedules.length) {
        tableBody.innerHTML = "<tr><td colspan='13'>No sessions found.</td></tr>";
        return;
      }

      tableBody.innerHTML = "";
      data.schedules.forEach(s => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${s.date}</td>
          <td>${s.slot_no}</td>
          <td>${s.college}</td>
          <td>${s.course}</td>
          <td>${s.section}</td>
          <td>${s.year}</td>
          <td>${s.semester}</td>
          <td>${s.domain}</td>
          <td>${s.subdomain || "-"}</td>
          <td>${s.module || "-"}</td>
          <td>${s.trainer}</td>
          <td>${s.done ? " Done" : " Pending"}</td>
          <td>
            <button class="edit-btn" data-session='${JSON.stringify(s).replace(/'/g, "&apos;")}'>Edit</button>
            <button class="delete-btn" data-id="${s.id}">Delete</button>
          </td>`;
        tableBody.appendChild(row);
      });
      attachRowActions();
    } catch (err) {
      console.error("ERROR Error loading sessions:", err);
      tableBody.innerHTML = "<tr><td colspan='13'>Error loading data</td></tr>";
    }
  }

  // Search Filter
  const searchInput = document.getElementById("sessionSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const filter = searchInput.value.toLowerCase();
      const table = document.getElementById("sessionTable");
      const rows = table.getElementsByTagName("tr");

      Array.from(rows).forEach((row, index) => {
        if (index === 0) return;
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(filter) ? "" : "none";
      });
    });
  }

  // -------------------------------
  // 9️⃣ Edit / Delete Action Listeners
  // -------------------------------
  function attachRowActions() {
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        const id = e.target.dataset.id;
        if (!confirm("Delete this session?")) return;

        await fetch(`${BASE_URL}schedule/delete/${id}/`, {
          method: "DELETE",
          headers: { "X-CSRFToken": getCSRFToken() },
          credentials: "include",
        });
        loadSessionTable();
      });
    });

    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        const session = JSON.parse(e.target.dataset.session);
        openEditModal(session);
      });
    });
  }

  // -------------------------------
  // 🔟 Edit Modal with Dropdowns
  // -------------------------------
  async function openEditModal(session) {
    const modal = document.createElement("div");
    modal.className = "edit-modal";
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Edit Session</h2>
        <form id="editForm">
          <label>Date <input type="date" name="date" value="${session.date}" required></label>
          <label>Slot <input type="number" name="slot_no" value="${session.slot_no}" min="1" max="5" required></label>
          
          <label>College <select name="college_id" id="editCollege"></select></label>
          <label>Course <select name="course_id" id="editCourse"></select></label>
          <label>Section <select name="section_id" id="editSection"></select></label>
          <label>Domain <select name="domain_id" id="editDomain"></select></label>
          <label>Subdomain <select name="subdomain_id" id="editSubdomain"></select></label>
          <label>Module <select name="module_id" id="editModule"></select></label>
          <label>Trainer <select name="trainer_id" id="editTrainer"></select></label>
          <label>Year <select name="year" id="editYear"></select></label>
          <label>Semester <select name="semester" id="editSemester"></select></label>

          <div class="modal-actions">
            <button type="submit">Save</button>
            <button type="button" id="closeModal">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const elements = {
      college: modal.querySelector("#editCollege"),
      course: modal.querySelector("#editCourse"),
      section: modal.querySelector("#editSection"),
      domain: modal.querySelector("#editDomain"),
      subdomain: modal.querySelector("#editSubdomain"),
      module: modal.querySelector("#editModule"),
      trainer: modal.querySelector("#editTrainer"),
      semester: modal.querySelector("#editSemester"),
      year: modal.querySelector("#editYear"),
    };

    // Populate initial selects from cache
    populateSelect(elements.college, cache.colleges, "name", "--Select College--");
    populateSelect(elements.domain, cache.domains, "domain_name", "--Select Domain--");
    populateSelect(elements.trainer, cache.trainers, "name", "--Select Trainer--");
    populateSelect(elements.semester, cache.semesters, "label", "--Select Semester--");
    populateSelect(elements.year, cache.years, "label", "--Select Year--");

    // Setup cascades for Edit Modal
    elements.college.addEventListener("change", async (e) => {
      const collegeId = e.target.value;
      elements.course.disabled = true;
      elements.course.innerHTML = "<option value=''>--Select College First--</option>";
      elements.section.disabled = true;
      elements.section.innerHTML = "<option value=''>--Select Course First--</option>";

      if (!collegeId) return;
      if (!cache.courses[collegeId]) {
        const courses = await fetchData(`/college/courses/api/list/?college_id=${collegeId}`);
        cache.courses[collegeId] = courses;
      }
      populateSelect(elements.course, cache.courses[collegeId], "name", "--Select Course--");
    });

    elements.course.addEventListener("change", async (e) => {
      const collegeId = elements.college.value;
      const courseId = e.target.value;
      elements.section.disabled = true;
      elements.section.innerHTML = "<option value=''>--Select Course First--</option>";

      if (!collegeId || !courseId) return;
      const cacheKey = `${collegeId}_${courseId}`;
      if (!cache.sections[cacheKey]) {
        const sections = await fetchData(`/college/get-sections/?college_id=${collegeId}&course_id=${courseId}`);
        cache.sections[cacheKey] = sections;
      }
      populateSelect(elements.section, cache.sections[cacheKey], "name", "--Select Section--");
    });

    elements.domain.addEventListener("change", async (e) => {
      const domainId = e.target.value;
      elements.subdomain.innerHTML = "<option value=''>--Select Subdomain--</option>";
      elements.subdomain.disabled = true;
      elements.module.innerHTML = "<option value=''>--Select Domain First--</option>";
      elements.module.disabled = true;

      if (!domainId) return;
      if (!cache.subdomains[domainId]) {
        const subdomains = await fetchData(`/api/admin/api/subdomains/${domainId}/`);
        cache.subdomains[domainId] = subdomains;
      }
      populateSelect(elements.subdomain, cache.subdomains[domainId], "subdomain_name", "--Select Subdomain--");

      const cacheKey = `${domainId}_all`;
      if (!cache.modules[cacheKey]) {
        const modules = await fetchData(`/api/admin/api/modules/?domain_id=${domainId}`);
        cache.modules[cacheKey] = modules;
      }
      populateSelect(elements.module, cache.modules[cacheKey], "name", "--Select Module--");
    });

    elements.subdomain.addEventListener("change", async (e) => {
      const domainId = elements.domain.value;
      const subdomainId = e.target.value;
      if (!domainId) return;

      const cacheKey = subdomainId ? `${domainId}_${subdomainId}` : `${domainId}_all`;
      if (!cache.modules[cacheKey]) {
        let url = `/api/admin/api/modules/?domain_id=${domainId}`;
        if (subdomainId) url += `&subdomain_id=${subdomainId}`;
        const modules = await fetchData(url);
        cache.modules[cacheKey] = modules;
      }
      populateSelect(elements.module, cache.modules[cacheKey], "name", "--Select Module--");
    });

    // Preselect current values by triggering change listeners
    if (session.college_id) {
      elements.college.value = session.college_id;
      if (!cache.courses[session.college_id]) {
        const courses = await fetchData(`/college/courses/api/list/?college_id=${session.college_id}`);
        cache.courses[session.college_id] = courses;
      }
      populateSelect(elements.course, cache.courses[session.college_id], "name", "--Select Course--");
      
      if (session.course_id) {
        elements.course.value = session.course_id;
        const cacheKey = `${session.college_id}_${session.course_id}`;
        if (!cache.sections[cacheKey]) {
          const sections = await fetchData(`/college/get-sections/?college_id=${session.college_id}&course_id=${session.course_id}`);
          cache.sections[cacheKey] = sections;
        }
        populateSelect(elements.section, cache.sections[cacheKey], "name", "--Select Section--");
        if (session.section_id) elements.section.value = session.section_id;
      }
    }

    if (session.domain_id) {
      elements.domain.value = session.domain_id;
      if (!cache.subdomains[session.domain_id]) {
        const subdomains = await fetchData(`/api/admin/api/subdomains/${session.domain_id}/`);
        cache.subdomains[session.domain_id] = subdomains;
      }
      populateSelect(elements.subdomain, cache.subdomains[session.domain_id], "subdomain_name", "--Select Subdomain--");
      
      const subId = session.subdomain_id;
      if (subId) elements.subdomain.value = subId;

      const cacheKey = subId ? `${session.domain_id}_${subId}` : `${session.domain_id}_all`;
      if (!cache.modules[cacheKey]) {
        let url = `/api/admin/api/modules/?domain_id=${session.domain_id}`;
        if (subId) url += `&subdomain_id=${subId}`;
        const modules = await fetchData(url);
        cache.modules[cacheKey] = modules;
      }
      populateSelect(elements.module, cache.modules[cacheKey], "name", "--Select Module--");
      if (session.module_id) elements.module.value = session.module_id;
    }

    if (session.trainer_id) elements.trainer.value = session.trainer_id;
    if (session.semester) elements.semester.value = session.semester;
    if (session.year) elements.year.value = session.year;

    // Close Modal handler
    modal.querySelector("#closeModal").addEventListener("click", () => modal.remove());

    // Submit Edit Form handler
    modal.querySelector("#editForm").addEventListener("submit", async e => {
      e.preventDefault();
      const formData = new FormData(e.target);
      try {
        const res = await fetch(`${BASE_URL}schedule/update/${session.id}/`, {
          method: "POST",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
          credentials: "include",
        });
        const data = await res.json();
        alert(data.message || "Updated successfully!");
        modal.remove();
        loadSessionTable();
      } catch (err) {
        console.error("ERROR Update failed:", err);
        alert("Error updating session.");
      }
    });
  }

  // Load Table initially
  loadSessionTable();
});
