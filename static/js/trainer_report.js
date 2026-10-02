// trainer_report.js — Final version

document.addEventListener("DOMContentLoaded", () => {
  // ------------------ GET ALL API URLS ------------------
  const urls = {
    collegesUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.collegesUrl),
    coursesUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.coursesUrl),
    semestersUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.semestersUrl),
    domainsUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.domainsUrl),
    subdomainsUrl: "/trainer/api/subdomains/",
    sectionsUrl: "/trainer/api/sections/",
    yearsUrl: "/trainer/api/years/",
    submitUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.submitUrl),
    listUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.listUrl),
    markedSessionsUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.markedSessionsUrl),
    modulesUrl: normalizeUrl(document.getElementById("report-api-urls").dataset.modulesUrl),
  };

  console.log("OK Loaded API URLs:", urls);

  let markedSessionsList = [];

  // ------------------ FETCH DROPDOWN DATA ------------------
  fetchDropdownData(urls);
  loadReportList(urls.listUrl);
  loadMarkedSessions(urls.markedSessionsUrl);

  // ------------------ HANDLE SESSION SELECT AUTO-POPULATE ------------------
  const moduleSelect = document.getElementById("moduleDropdown");
  const moduleCustomInput = document.getElementById("moduleTextInput");

  if (moduleSelect) {
    moduleSelect.addEventListener("change", (e) => {
      if (e.target.value === "__OTHER__") {
        moduleCustomInput.style.display = "block";
        moduleCustomInput.required = true;
        moduleCustomInput.focus();
      } else {
        moduleCustomInput.style.display = "none";
        moduleCustomInput.required = false;
        moduleCustomInput.value = "";
      }
    });
  }

  function fetchAndPopulateModules(domainId, subdomainId, selectedModuleName = "") {
    if (!domainId) {
      if (moduleSelect) {
        moduleSelect.innerHTML = '<option value="">-- Select domain first --</option>';
      }
      if (moduleCustomInput) {
        moduleCustomInput.style.display = "none";
        moduleCustomInput.required = false;
        moduleCustomInput.value = "";
      }
      return;
    }

    let url = `${urls.modulesUrl}?domain_id=${domainId}`;
    if (subdomainId) {
      url += `&subdomain_id=${subdomainId}`;
    }

    if (moduleSelect) {
      moduleSelect.innerHTML = '<option value="">-- Loading modules... --</option>';
    }

    fetch(url)
      .then(res => tryParseJSON(res))
      .then(modules => {
        if (moduleSelect) {
          moduleSelect.innerHTML = '<option value="">-- Select module --</option>';
        }
        if (moduleCustomInput) {
          moduleCustomInput.style.display = "none";
          moduleCustomInput.required = false;
          moduleCustomInput.value = "";
        }

        if (modules && modules.length > 0) {
          let matchFound = false;
          modules.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.name;
            opt.textContent = m.name;
            if (moduleSelect) moduleSelect.appendChild(opt);
            if (selectedModuleName && m.name === selectedModuleName) {
              matchFound = true;
            }
          });
          // Add Other option
          const otherOpt = document.createElement("option");
          otherOpt.value = "__OTHER__";
          otherOpt.textContent = "-- Other (Type custom module) --";
          if (moduleSelect) moduleSelect.appendChild(otherOpt);

          if (selectedModuleName) {
            if (matchFound) {
              moduleSelect.value = selectedModuleName;
            } else {
              moduleSelect.value = "__OTHER__";
              if (moduleCustomInput) {
                moduleCustomInput.style.display = "block";
                moduleCustomInput.required = true;
                moduleCustomInput.value = selectedModuleName;
              }
            }
          }
        } else {
          // Fall back to custom text field directly
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "__OTHER__";
          emptyOpt.textContent = "-- No modules found (Type below) --";
          if (moduleSelect) {
            moduleSelect.appendChild(emptyOpt);
            moduleSelect.value = "__OTHER__";
          }
          if (moduleCustomInput) {
            moduleCustomInput.style.display = "block";
            moduleCustomInput.required = true;
            if (selectedModuleName) {
              moduleCustomInput.value = selectedModuleName;
            }
          }
        }
      })
      .catch(err => {
        console.error("Modules fetch error:", err);
        if (moduleSelect) {
          moduleSelect.innerHTML = '<option value="">-- Error loading modules --</option>';
        }
      });
  }

  const markedSelect = document.getElementById("markedSessionSelect");
  if (markedSelect) {
    markedSelect.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      
      // Reset module select/input
      if (moduleSelect) {
        moduleSelect.innerHTML = '<option value="">-- Select module --</option>';
      }
      if (moduleCustomInput) {
        moduleCustomInput.style.display = "none";
        moduleCustomInput.required = false;
        moduleCustomInput.value = "";
      }

      if (!selectedId) {
        // Reset all fields
        document.getElementById("date").value = "";
        document.getElementById("collegeDropdown").value = "";
        document.getElementById("courseDropdown").value = "";
        document.getElementById("yearDropdown").value = "";
        document.getElementById("semesterDropdown").value = "";
        document.getElementById("sectionDropdown").value = "";
        document.getElementById("domainDropdown").value = "";
        document.getElementById("subdomainDropdown").value = "";
        document.getElementById("total_students").value = "";
        document.getElementById("present_students").value = "";
        document.getElementById("absent_students").value = "";
        return;
      }
      
      const session = markedSessionsList.find(s => s.session_id === selectedId);
      if (session) {
        document.getElementById("date").value = session.date;
        document.getElementById("collegeDropdown").value = session.college_id;
        document.getElementById("courseDropdown").value = session.course_id;
        document.getElementById("yearDropdown").value = session.year;
        document.getElementById("semesterDropdown").value = session.semester;
        document.getElementById("sectionDropdown").value = session.section_id || "";
        document.getElementById("domainDropdown").value = session.domain_id;
        
        // Fetch subdomains
        if (session.domain_id) {
          fetch(`/trainer/api/subdomains/?domain_id=${session.domain_id}`)
            .then(res => tryParseJSON(res))
            .then(subdomains => {
              populateOptions("subdomainDropdown", subdomains);
              document.getElementById("subdomainDropdown").value = session.subdomain_id || "";
            })
            .catch(err => console.error("Subdomain load error:", err));
        } else {
          document.getElementById("subdomainDropdown").value = "";
        }
        
        // Fetch modules matching session's domain and subdomain
        fetchAndPopulateModules(session.domain_id, session.subdomain_id, session.module_name);
        
        document.getElementById("total_students").value = session.total_students;
        document.getElementById("present_students").value = session.present_students;
        document.getElementById("absent_students").value = session.absent_students;
      }
    });
  }

  // ------------------ HANDLE FORM SUBMISSION ------------------
  const reportForm = document.getElementById("reportForm");
  if (reportForm) {
    reportForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const payload = {};
      formData.forEach((value, key) => (payload[key] = value));

      // Overwrite custom module if specified
      if (payload["module"] === "__OTHER__") {
        payload["module"] = payload["module_custom"] || "";
      }
      delete payload["module_custom"];

      try {
        const response = await fetch(urls.submitUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify(payload),
        });

        const result = await tryParseJSON(response);
        if (!response.ok || !result.success) {
          alert("ERROR " + (result.error || result.message || "Submission failed."));
          return;
        }

        alert("OK Report submitted successfully!");
        this.reset();
        
        // Explicitly clear select options
        if (moduleSelect) {
          moduleSelect.innerHTML = '<option value="">-- Select training session first --</option>';
        }
        if (moduleCustomInput) {
          moduleCustomInput.style.display = "none";
          moduleCustomInput.required = false;
        }

        // Toggle back to list view
        const fWrapper = document.querySelector(".report-form-wrapper");
        const lWrapper = document.querySelector(".report-list-wrapper");
        const hActions = document.getElementById("headerActionsPane");
        if (fWrapper && lWrapper) {
          fWrapper.style.display = "none";
          lWrapper.style.display = "block";
          if (hActions) hActions.style.display = "block";
        }

        loadReportList(urls.listUrl);
        loadMarkedSessions(urls.markedSessionsUrl);
      } catch (err) {
        console.error("ERROR Submission error:", err);
        alert("Error submitting report. Check console for details.");
      }
    });
  }

  // Helper to load marked sessions dropdown options
  async function loadMarkedSessions(markedSessionsUrl) {
    const select = document.getElementById("markedSessionSelect");
    if (!select) return;
    
    try {
      const res = await fetch(markedSessionsUrl);
      const data = await tryParseJSON(res);
      
      if (data && Array.isArray(data.sessions)) {
        markedSessionsList = data.sessions;
        select.innerHTML = '<option value="">-- Select a session with marked attendance --</option>';
        if (markedSessionsList.length === 0) {
          select.innerHTML = '<option value="">No pending marked sessions found</option>';
          return;
        }
        markedSessionsList.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s.session_id;
          opt.textContent = s.label;
          select.appendChild(opt);
        });

        // Auto-select session if session_id query parameter is in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdParam = urlParams.get("session_id");
        if (sessionIdParam) {
          select.value = sessionIdParam;
          select.dispatchEvent(new Event("change"));

          // Open the form view in-place
          const btnShow = document.getElementById("btnShowReportForm");
          if (btnShow) {
            btnShow.click();
          }
        }
      }
    } catch (err) {
      console.error("Error loading marked sessions:", err);
      select.innerHTML = '<option value="">Failed to load marked sessions</option>';
    }
  }

  // ------------------ DYNAMIC SUBDOMAIN & MODULE LOADING ------------------
  const domainDropdown = document.getElementById("domainDropdown");
  const subdomainDropdown = document.getElementById("subdomainDropdown");

  if (domainDropdown) {
    domainDropdown.addEventListener("change", async (e) => {
      const domainId = e.target.value;
      if (!domainId) {
        if (subdomainDropdown) {
          subdomainDropdown.innerHTML = '<option value="">-- Select Domain first --</option>';
        }
        fetchAndPopulateModules("", "");
        return;
      }
      try {
        const res = await fetch(`/trainer/api/subdomains/?domain_id=${domainId}`);
        const data = await tryParseJSON(res);
        populateOptions("subdomainDropdown", data);
        
        // Dynamic fetch of modules for selected domain
        fetchAndPopulateModules(domainId, "");
      } catch (err) {
        console.error("Subdomain fetch error:", err);
      }
    });
  }

  if (subdomainDropdown) {
    subdomainDropdown.addEventListener("change", (e) => {
      const subdomainId = e.target.value;
      const domainId = domainDropdown ? domainDropdown.value : "";
      fetchAndPopulateModules(domainId, subdomainId);
    });
  }

  // ------------------ FORM TOGGLE ACTIONS ------------------
  const btnShow = document.getElementById("btnShowReportForm");
  const btnHide = document.getElementById("btnHideReportForm");
  const formWrapper = document.querySelector(".report-form-wrapper");
  const listWrapper = document.querySelector(".report-list-wrapper");
  const headerActions = document.getElementById("headerActionsPane");

  if (btnShow && formWrapper && listWrapper) {
    btnShow.addEventListener("click", () => {
      formWrapper.style.display = "block";
      listWrapper.style.display = "none";
      if (headerActions) headerActions.style.display = "none";
      formWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (btnHide && formWrapper && listWrapper) {
    btnHide.addEventListener("click", () => {
      formWrapper.style.display = "none";
      listWrapper.style.display = "block";
      if (headerActions) headerActions.style.display = "block";
    });
  }
});

// ------------------ HELPER FUNCTIONS ------------------

// OK Normalize URL paths (fixes /api/admin/api/colleges/ problem)
function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("/api/admin/")) {
    return url.replace("/api/admin/", "/trainer/");
  }
  if (!url.startsWith("/trainer/")) {
    if (url.startsWith("/api/")) {
      return url.replace("/api/", "/trainer/api/");
    }
  }
  return url;
}

// OK Safe JSON parser
async function tryParseJSON(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`ERROR Invalid JSON from ${response.url}:`, text.slice(0, 200));
    return {};
  }
}

// OK Fetch dropdowns
function fetchDropdownData(urls) {
  Promise.allSettled([
    fetch(urls.collegesUrl).then((res) => tryParseJSON(res)),
    fetch(urls.coursesUrl).then((res) => tryParseJSON(res)),
    fetch(urls.semestersUrl).then((res) => tryParseJSON(res)),
    fetch(urls.domainsUrl).then((res) => tryParseJSON(res)),
    fetch(urls.sectionsUrl).then((res) => tryParseJSON(res)),
    fetch(urls.yearsUrl).then((res) => tryParseJSON(res)),
  ])
    .then((results) => {
      const [colleges, courses, semesters, domains, sections, years] = results.map(
        (r) => (r.status === "fulfilled" ? r.value : [])
      );

      populateOptions("collegeDropdown", colleges);
      populateOptions("courseDropdown", courses.courses || courses);
      populateOptions("semesterDropdown", semesters.semesters || semesters);
      populateOptions("domainDropdown", domains.domains || domains);
      populateOptions("sectionDropdown", sections);
      populateOptions("yearDropdown", years.years || years);
    })
    .catch((err) => {
      console.error("Dropdown load error:", err);
      alert("WARNING Failed to load dropdown data. Please refresh the page.");
    });
}

// OK Populate dropdowns
function populateOptions(id, list) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = '<option value="">-- Select --</option>';
  if (!list || !Array.isArray(list)) return;

  list.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id || item.value || item.name;
    option.textContent =
      item.name || item.label || item.domain_name || item.subdomain_name || item;
    select.appendChild(option);
  });
}

// OK Load submitted report list
function loadReportList(url) {
  fetch(url)
    .then((res) => tryParseJSON(res))
    .then((data) => {
      const tbody = document.querySelector("#reportTable tbody");
      if (!tbody) return;
      tbody.innerHTML = "";

      // Update badge count
      const countBadge = document.getElementById("reportCountBadge");
      if (countBadge) {
        const count = (data.reports && Array.isArray(data.reports)) ? data.reports.length : 0;
        countBadge.innerText = `${count} submitted`;
      }

      if (!data.reports || data.reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No reports submitted yet.</td></tr>`;
        return;
      }

      data.reports.forEach((r) => {
        const row = `
          <tr>
            <td>${r.date}</td>
            <td>${r.college}</td>
            <td>${r.course}</td>
            <td>${r.semester}</td>
            <td>${r.domain}</td>
            <td>${r.module}</td>
            <td>${r.present_students}</td>
            <td>${r.absent_students}</td>
            <td>${r.materials_shared}</td>
            <td>${r.assignments_given}</td>
          </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
      });
    })
    .catch((err) => console.error("Report list error:", err));
}

// OK Read CSRF cookie
function getCookie(name) {
  if (name === "csrftoken") {
    const domToken = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value;
    if (domToken) return domToken;
  }
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + "=")) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}
