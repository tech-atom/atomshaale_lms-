/* admin_student_performance.js
   Futuristic analytics console — fully dynamic and database-driven.
   Author: Code GPT
*/

// Custom Multiselect implementation
class CustomMultiselect {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.trigger = this.container.querySelector(".multiselect-trigger");
    this.selectedText = this.container.querySelector(".multiselect-selected-text");
    this.dropdown = this.container.querySelector(".multiselect-dropdown");
    this.searchInput = this.container.querySelector(".multiselect-search-input");
    this.optionsContainer = this.container.querySelector(".multiselect-options");
    this.placeholder = options.placeholder || "Select Option";
    this.emptyMessage = options.emptyMessage || "No options found";
    this.onChange = options.onChange || (() => {});
    
    this.items = [];
    this.disabled = this.container.classList.contains("disabled");

    this.initEvents();
  }

  setDisabled(disabled) {
    this.disabled = disabled;
    if (disabled) {
      this.container.classList.add("disabled");
      this.close();
    } else {
      this.container.classList.remove("disabled");
    }
  }

  initEvents() {
    this.trigger.addEventListener("click", (e) => {
      if (this.disabled) return;
      e.stopPropagation();
      this.toggle();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener("click", (e) => e.stopPropagation());
      this.searchInput.addEventListener("input", () => this.filterOptions());
    }

    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });
  }

  toggle() {
    if (this.container.classList.contains("open")) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    document.querySelectorAll(".multiselect-container.open").forEach(c => {
      if (c !== this.container) c.classList.remove("open");
    });
    this.container.classList.add("open");
    if (this.searchInput) {
      this.searchInput.value = "";
      this.filterOptions();
      this.searchInput.focus();
    }
  }

  close() {
    this.container.classList.remove("open");
  }

  setOptions(dataOptions) {
    this.items = (dataOptions || []).map(opt => ({
      id: opt.id,
      name: opt.name,
      checked: false
    }));
    
    this.render();
    this.updateTriggerText();
  }

  render() {
    this.optionsContainer.innerHTML = "";
    if (this.items.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "multiselect-empty";
      emptyDiv.textContent = this.emptyMessage;
      this.optionsContainer.appendChild(emptyDiv);
      return;
    }

    // Add Select All Option at the top
    const selectAllDiv = document.createElement("div");
    selectAllDiv.className = "multiselect-option select-all-option";
    selectAllDiv.style.borderBottom = "1px solid #e2e8f0";
    selectAllDiv.style.paddingBottom = "6px";
    selectAllDiv.style.marginBottom = "4px";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    const allChecked = this.items.length > 0 && this.items.every(i => i.checked);
    selectAllCheckbox.checked = allChecked;

    const selectAllLabel = document.createElement("span");
    selectAllLabel.className = "multiselect-option-label";
    selectAllLabel.style.fontWeight = "bold";
    selectAllLabel.style.color = "#008037";
    selectAllLabel.textContent = "Select All";

    selectAllDiv.appendChild(selectAllCheckbox);
    selectAllDiv.appendChild(selectAllLabel);

    const updateSelectAllState = () => {
      const currentlyAllChecked = this.items.length > 0 && this.items.every(i => i.checked);
      selectAllCheckbox.checked = currentlyAllChecked;
    };

    const handleSelectAllToggle = (e) => {
      e.stopPropagation();
      const nextChecked = !selectAllCheckbox.checked;
      selectAllCheckbox.checked = nextChecked;

      const term = this.searchInput ? this.searchInput.value.toLowerCase() : "";

      this.items.forEach(item => {
        if (!term || item.name.toLowerCase().includes(term)) {
          item.checked = nextChecked;
        }
      });

      // Update checkboxes in DOM
      const optionDivs = this.optionsContainer.querySelectorAll(".multiselect-option:not(.select-all-option)");
      optionDivs.forEach(div => {
        const labelText = div.querySelector(".multiselect-option-label").textContent.toLowerCase();
        if (!term || labelText.includes(term)) {
          div.querySelector("input[type='checkbox']").checked = nextChecked;
        }
      });

      this.updateTriggerText();
      this.onChange(this.getValues());
    };

    selectAllDiv.addEventListener("click", handleSelectAllToggle);
    selectAllCheckbox.addEventListener("click", (e) => {
      e.stopPropagation();
      const nextChecked = selectAllCheckbox.checked;
      const term = this.searchInput ? this.searchInput.value.toLowerCase() : "";

      this.items.forEach(item => {
        if (!term || item.name.toLowerCase().includes(term)) {
          item.checked = nextChecked;
        }
      });

      const optionDivs = this.optionsContainer.querySelectorAll(".multiselect-option:not(.select-all-option)");
      optionDivs.forEach(div => {
        const labelText = div.querySelector(".multiselect-option-label").textContent.toLowerCase();
        if (!term || labelText.includes(term)) {
          div.querySelector("input[type='checkbox']").checked = nextChecked;
        }
      });

      this.updateTriggerText();
      this.onChange(this.getValues());
    });

    this.optionsContainer.appendChild(selectAllDiv);

    // Render other options
    this.items.forEach(item => {
      const optionDiv = document.createElement("div");
      optionDiv.className = "multiselect-option";
      optionDiv.dataset.id = item.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.checked;
      
      const label = document.createElement("span");
      label.className = "multiselect-option-label";
      label.textContent = item.name;

      optionDiv.appendChild(checkbox);
      optionDiv.appendChild(label);

      optionDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        checkbox.checked = !checkbox.checked;
        item.checked = checkbox.checked;
        updateSelectAllState();
        this.updateTriggerText();
        this.onChange(this.getValues());
      });

      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        item.checked = checkbox.checked;
        updateSelectAllState();
        this.updateTriggerText();
        this.onChange(this.getValues());
      });

      this.optionsContainer.appendChild(optionDiv);
    });
  }

  filterOptions() {
    const term = this.searchInput.value.toLowerCase();
    const options = this.optionsContainer.querySelectorAll(".multiselect-option:not(.select-all-option)");
    options.forEach(opt => {
      const labelText = opt.querySelector(".multiselect-option-label").textContent.toLowerCase();
      if (labelText.includes(term)) {
        opt.classList.remove("hidden");
      } else {
        opt.classList.add("hidden");
      }
    });
  }

  updateTriggerText() {
    const selected = this.items.filter(i => i.checked);
    if (selected.length === 0) {
      this.selectedText.textContent = this.placeholder;
    } else if (selected.length === this.items.length) {
      this.selectedText.textContent = "All Selected";
    } else if (selected.length <= 2) {
      this.selectedText.textContent = selected.map(s => s.name).join(", ");
    } else {
      this.selectedText.textContent = `${selected.length} Selected`;
    }
  }

  getValues() {
    return this.items.filter(i => i.checked).map(i => i.id);
  }
  
  clearSelection() {
    this.items.forEach(i => i.checked = false);
    this.render();
    this.updateTriggerText();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const api = document.getElementById("admin-perf-api").dataset;

  let courseMultiselect = null;
  let sectionMultiselect = null;
  let yearMultiselect = null;
  let semesterMultiselect = null;

  const selects = {
    college: document.getElementById("collegeSelect"),
    type: document.getElementById("typeSelect"),
    test: document.getElementById("testSelect"),
  };

  const loadBtn = document.getElementById("loadBtn");
  const searchInput = document.getElementById("searchInput");
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  const toastContainer = document.querySelector(".toast-container") || document.body;
  const topicPanel = document.getElementById("topicStudentPanel");
  const topicPanelBackdrop = document.getElementById("topicPanelBackdrop");
  const topicPanelTitle = document.getElementById("topicPanelTitle");
  const topicPanelCount = document.getElementById("topicPanelCount");
  const topicPanelList = document.getElementById("topicPanelList");
  const topicPanelCloseBtn = document.getElementById("topicPanelCloseBtn");

  let charts = {};

  /* ---------------- TOASTS ---------------- */
  const toast = (msg, type = "info") => {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  /* ---------------- INITIALIZE MULTISELECTS ---------------- */
  courseMultiselect = new CustomMultiselect("courseMultiselect", {
    placeholder: "Select Course",
    emptyMessage: "No courses found",
    onChange: (values) => {
      loadSectionOptions(values);
      triggerTestLoad();
    }
  });

  sectionMultiselect = new CustomMultiselect("sectionMultiselect", {
    placeholder: "Select Section",
    emptyMessage: "No sections found",
    onChange: () => {
      triggerTestLoad();
    }
  });

  yearMultiselect = new CustomMultiselect("yearMultiselect", {
    placeholder: "Select Year",
    emptyMessage: "No years found",
    onChange: () => {
      triggerTestLoad();
    }
  });

  semesterMultiselect = new CustomMultiselect("semesterMultiselect", {
    placeholder: "Select Semester",
    emptyMessage: "No semesters found",
    onChange: () => {
      triggerTestLoad();
    }
  });

  /* ---------------- LOAD FILTER OPTIONS ---------------- */
  Promise.all([
    fetch(api.dropdownsUrl).then(res => res.json()),
    fetch(api.semestersUrl).then(res => res.json())
  ])
    .then(([base, semesters]) => {
      base.colleges.forEach(c => selects.college.append(new Option(c.name, c.id)));
      
      const yearOptions = (base.years || []).map(y => ({ id: String(y.value), name: y.label }));
      yearMultiselect.setOptions(yearOptions);

      const semesterOptions = (semesters || []).map(s => ({ id: String(s.id), name: s.label }));
      semesterMultiselect.setOptions(semesterOptions);
    })
    .catch(() => toast("WARNING Failed to load dropdown filters", "error"));

  /* ---------------- LOAD COURSES BASED ON COLLEGE ---------------- */
  selects.college.addEventListener("change", () => {
    courseMultiselect.setDisabled(true);
    sectionMultiselect.setDisabled(true);
    courseMultiselect.clearSelection();
    sectionMultiselect.clearSelection();

    if (!selects.college.value) {
      courseMultiselect.setOptions([]);
      return;
    }

    fetch(`${api.dropdownsUrl}?college=${selects.college.value}`)
      .then(res => res.json())
      .then(data => {
        courseMultiselect.setOptions(data.courses);
        courseMultiselect.setDisabled(false);
      })
      .catch(() => toast("WARNING Error fetching courses", "error"));
  });

  /* ---------------- LOAD SECTIONS BASED ON COLLEGE & COURSES ---------------- */
  const loadSectionOptions = (courseIds) => {
    if (!selects.college.value || courseIds.length === 0) {
      sectionMultiselect.setOptions([]);
      sectionMultiselect.setDisabled(true);
      return;
    }
    sectionMultiselect.setDisabled(true);
    fetch(`${api.sectionsUrl}?college=${selects.college.value}&course=${courseIds.join(",")}`)
      .then(res => res.json())
      .then(data => {
        sectionMultiselect.setOptions(data);
        sectionMultiselect.setDisabled(false);
      })
      .catch(() => toast("WARNING Error fetching sections", "error"));
  };

  /* ---------------- LOAD TEST LIST ---------------- */
  const triggerTestLoad = () => {
    const { college, type, test } = selects;
    const selectedCourses = courseMultiselect ? courseMultiselect.getValues() : [];
    const selectedSections = sectionMultiselect ? sectionMultiselect.getValues() : [];
    const selectedYears = yearMultiselect ? yearMultiselect.getValues() : [];
    const selectedSemesters = semesterMultiselect ? semesterMultiselect.getValues() : [];

    const isPre = type.value === "pre_assessment";
    const hasRequiredFilters = isPre 
      ? (college.value && selectedCourses.length > 0 && selectedYears.length > 0)
      : (college.value && selectedCourses.length > 0 && selectedYears.length > 0 && selectedSemesters.length > 0 && selectedSections.length > 0);

    if (!type.value || !hasRequiredFilters) {
      test.innerHTML = "<option value=''>Select Test</option>";
      test.disabled = true;
      return;
    }

    fetch(`${api.testsUrl}?type=${type.value}&college=${college.value}&course=${selectedCourses.join(",")}&year=${selectedYears.join(",")}&semester=${selectedSemesters.join(",")}&section=${selectedSections.join(",")}`)
      .then(res => res.json())
      .then(data => {
        test.innerHTML = "<option value=''>Select Test</option>";
        if (!data.tests?.length) {
          toast("No tests found for these filters", "info");
          test.disabled = true;
          return;
        }
        data.tests.forEach(t => test.append(new Option(t.title, t.id)));
        test.disabled = false;
      })
      .catch(() => toast("WARNING Failed to fetch tests", "error"));
  };

  [selects.college, selects.type].forEach(sel => {
    sel.addEventListener("change", triggerTestLoad);
  });

  selects.type.addEventListener("change", function() {
    const isPre = this.value === "pre_assessment";
    const sectionEl = document.getElementById("sectionMultiselect");
    const semesterEl = document.getElementById("semesterMultiselect");
    
    if (isPre) {
      if (sectionEl) sectionEl.closest(".filter-group").style.opacity = "0.4";
      if (semesterEl) semesterEl.closest(".filter-group").style.opacity = "0.4";
      if (window.sectionMultiselect) window.sectionMultiselect.setDisabled(true);
      if (window.semesterMultiselect) window.semesterMultiselect.setDisabled(true);
    } else {
      if (sectionEl) sectionEl.closest(".filter-group").style.opacity = "1";
      if (semesterEl) semesterEl.closest(".filter-group").style.opacity = "1";
      if (window.sectionMultiselect) window.sectionMultiselect.setDisabled(false);
      if (window.semesterMultiselect) window.semesterMultiselect.setDisabled(false);
    }
  });

  /* ---------------- UTILITY FUNCTIONS ---------------- */
  const safeSetCard = (id, value) => {
    const el = document.querySelector(`#${id} .val`);
    if (el) el.textContent = value;
  };

  const destroyChart = id => {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  };

  const setTopicPanelState = (isOpen) => {
    if (!topicPanel || !topicPanelBackdrop) return;
    topicPanel.classList.toggle("hidden", !isOpen);
    topicPanelBackdrop.classList.toggle("hidden", !isOpen);
    topicPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  const openTopicPanel = (topic, students) => {
    if (!topicPanel || !topicPanelTitle || !topicPanelCount || !topicPanelList) return;

    const list = Array.isArray(students) ? students : [];
    topicPanelTitle.textContent = `${topic} - Students`;
    topicPanelCount.textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
    topicPanelList.innerHTML = "";

    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "No students found.";
      topicPanelList.appendChild(li);
    } else {
      list.forEach((name, index) => {
        const li = document.createElement("li");
        li.textContent = `${index + 1}. ${name}`;
        topicPanelList.appendChild(li);
      });
    }

    setTopicPanelState(true);
  };

  const closeTopicPanel = () => setTopicPanelState(false);

  if (topicPanelCloseBtn) {
    topicPanelCloseBtn.addEventListener("click", closeTopicPanel);
  }
  if (topicPanelBackdrop) {
    topicPanelBackdrop.addEventListener("click", closeTopicPanel);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTopicPanel();
    }
  });

  /* ---------------- CHART RENDERING ---------------- */
  const palette = ["#f3a651", "#28556f", "#9ddbf0"];

  function renderBar(chartData) {
    destroyChart("barChart");

    const topicLabels = Array.isArray(chartData?.topic_labels) ? chartData.topic_labels : [];
    const topicValues = Array.isArray(chartData?.topic_values) ? chartData.topic_values : [];
    const topicStudents = chartData?.topic_students || {};

    const useTopicMode = topicLabels.length > 0;
    const labels = useTopicMode ? topicLabels : (Array.isArray(chartData?.labels) ? chartData.labels : []);
    const values = useTopicMode ? topicValues : (Array.isArray(chartData?.values) ? chartData.values : []);

    if (!labels.length) return;

    charts.barChart = new Chart(document.getElementById("barChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: useTopicMode ? "Students per Section/Topic" : "Performance (%)",
          data: values,
          backgroundColor: palette,
          borderWidth: 1.2,
          borderColor: "rgba(0,0,0,0.08)"
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: useTopicMode ? undefined : 100,
            ticks: {
              precision: 0
            },
            title: {
              display: true,
              text: useTopicMode ? "No. of Students" : "Performance (%)"
            },
            grid: { color: "rgba(0,0,0,0.05)" }
          },
          x: { grid: { display: false } }
        },
        onClick: (_event, elements) => {
          if (!useTopicMode || !elements?.length) return;

          const first = elements[0];
          const topic = labels[first.index];
          const students = Array.isArray(topicStudents[topic]) ? topicStudents[topic] : [];
          openTopicPanel(topic, students);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            borderColor: "#fff",
            borderWidth: 1,
            titleColor: "#fff",
            bodyColor: "#fff",
            callbacks: {
              label: (ctx) => {
                if (!useTopicMode) {
                  return `Performance: ${ctx.parsed.y}%`;
                }
                return `Students: ${ctx.parsed.y}`;
              },
              afterBody: (items) => {
                if (!useTopicMode || !items.length) return [];

                const topic = items[0].label;
                const students = Array.isArray(topicStudents[topic]) ? topicStudents[topic] : [];
                if (!students.length) return ["Students: -"];

                const maxNamesInTooltip = 15;
                const shown = students.slice(0, maxNamesInTooltip);
                const hiddenCount = Math.max(students.length - shown.length, 0);

                const lines = ["Students:", ...shown.map(name => `- ${name}`)];
                if (hiddenCount > 0) {
                  lines.push(`... and ${hiddenCount} more`);
                }
                return lines;
              }
            }
          }
        },
        animation: { duration: 1600, easing: "easeOutElastic" }
      }
    });
  }

  function renderOverviewGauge(avgScore) {
    destroyChart("overviewGauge");
    const score = parseFloat(avgScore) || 0;
    const remaining = Math.max(0, 100 - score);
    
    let color = "#ef4444";
    if (score >= 90) color = "#10b981";
    else if (score >= 75) color = "#059669";
    else if (score >= 50) color = "#f59e0b";
    else if (score >= 25) color = "#f97316";
    
    charts.overviewGauge = new Chart(document.getElementById("overviewGauge"), {
      type: "doughnut",
      data: {
        datasets: [{
          data: [score, remaining],
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

  /* ---------------- LOAD AND DISPLAY RESULTS ---------------- */
  loadBtn.addEventListener("click", () => {
    const { college, type, test } = selects;
    const selectedCourses = courseMultiselect ? courseMultiselect.getValues() : [];
    const selectedSections = sectionMultiselect ? sectionMultiselect.getValues() : [];
    const selectedYears = yearMultiselect ? yearMultiselect.getValues() : [];
    const selectedSemesters = semesterMultiselect ? semesterMultiselect.getValues() : [];

    const isPre = type.value === "pre_assessment";
    const hasRequired = isPre 
      ? (college.value && selectedCourses.length > 0 && selectedYears.length > 0)
      : (college.value && selectedCourses.length > 0 && selectedYears.length > 0 && selectedSemesters.length > 0 && selectedSections.length > 0);

    if (!type.value || !hasRequired) {
      toast("Please select all filters to load results", "warning");
      return;
    }

    const params = new URLSearchParams({
      type: type.value,
      college: college.value,
      course: selectedCourses.join(","),
      year: selectedYears.join(","),
      semester: selectedSemesters.join(","),
      section: selectedSections.join(","),
      test: test.value
    });

    fetch(`${api.resultsUrl}?${params}`)
      .then(res => res.json())
      .then(data => {
        if (!data.results?.length) {
          toast("No results found for this selection", "info");
          closeTopicPanel();
          return;
        }

        const { summary, chart, domains } = data;
        const percentages = data.results.map(r => r.percentage);

        const avg = percentages.length ? (percentages.reduce((a, b) => a + b, 0) / percentages.length).toFixed(1) : 0;
        const best = percentages.length ? Math.max(...percentages).toFixed(1) : 0;
        const worst = percentages.length ? Math.min(...percentages).toFixed(1) : 0;

        safeSetCard("card-total", data.results.length);
        safeSetCard("card-pass", summary.pass || 0);
        safeSetCard("card-fail", summary.fail || 0);
        safeSetCard("card-avg", `${avg}%`);
        safeSetCard("card-best", `${best}%`);
        safeSetCard("card-worst", `${worst}%`);

        // Render Performance Overview gauge
        renderOverviewGauge(avg);

        // Update Average score in gauge center
        document.getElementById("overview-avg-score").textContent = `${avg}%`;

        // Calculate and update tier statistics
        const results = data.results || [];
        const totalResults = results.length;

        const excellentCount = results.filter(r => r.percentage >= 90).length;
        const goodCount = results.filter(r => r.percentage >= 75 && r.percentage < 90).length;
        const averageCount = results.filter(r => r.percentage >= 50 && r.percentage < 75).length;
        const poorCount = results.filter(r => r.percentage >= 25 && r.percentage < 50).length;
        const veryPoorCount = results.filter(r => r.percentage < 25).length;

        const excellentPct = totalResults ? Math.round((excellentCount / totalResults) * 100) : 0;
        const goodPct = totalResults ? Math.round((goodCount / totalResults) * 100) : 0;
        const averagePct = totalResults ? Math.round((averageCount / totalResults) * 100) : 0;
        const poorPct = totalResults ? Math.round((poorCount / totalResults) * 100) : 0;
        const veryPoorPct = totalResults ? Math.round((veryPoorCount / totalResults) * 100) : 0;

        document.getElementById("tier-excellent-val").textContent = `${excellentCount} (${excellentPct}%)`;
        document.getElementById("tier-good-val").textContent = `${goodCount} (${goodPct}%)`;
        document.getElementById("tier-average-val").textContent = `${averageCount} (${averagePct}%)`;
        document.getElementById("tier-poor-val").textContent = `${poorCount} (${poorPct}%)`;
        document.getElementById("tier-very-poor-val").textContent = `${veryPoorCount} (${veryPoorPct}%)`;

        // Calculate average attempted/unattempted
        const avgAttempted = totalResults ? (results.reduce((sum, r) => sum + (parseInt(r.attempted) || 0), 0) / totalResults).toFixed(1) : 0;
        const avgUnattempted = totalResults ? (results.reduce((sum, r) => sum + (parseInt(r.unattempted) || 0), 0) / totalResults).toFixed(1) : 0;

        // Populate Test Summary
        const meta = summary.test_metadata || {};
        document.getElementById("summary-total-questions").textContent = meta.total_questions || 0;
        document.getElementById("summary-attempted").textContent = avgAttempted;
        document.getElementById("summary-unattempted").textContent = avgUnattempted;
        document.getElementById("summary-total-marks").textContent = meta.max_marks || 0;
        document.getElementById("summary-negative-marking").textContent = meta.negative_marking || "No";
        document.getElementById("summary-total-time").textContent = `${meta.duration || 0} mins`;

        // Populate Performance Insights
        const below50Count = results.filter(r => r.percentage < 50).length;
        const below50Pct = totalResults ? Math.round((below50Count / totalResults) * 100) : 0;
        
        document.getElementById("insight-improvement-title").textContent = `${below50Pct}% students need improvement`;
        if (below50Pct === 100) {
          document.getElementById("insight-improvement-desc").textContent = "All students scored below 50%. Additional support recommended.";
        } else if (below50Pct > 0) {
          document.getElementById("insight-improvement-desc").textContent = `${below50Pct}% of students scored below 50%. Focus reviews recommended.`;
        } else {
          document.getElementById("insight-improvement-desc").textContent = "Great job! All students scored above 50%.";
        }
        document.getElementById("insight-time-desc").textContent = `Average time taken is ${summary.avg_time_taken_formatted || "00:00"} minutes.`;

        // Populate Top Performers list
        const topPerformersList = document.getElementById("top-performers-list");
        topPerformersList.innerHTML = "";
        const topSorted = [...results].sort((a, b) => b.percentage - a.percentage).filter(r => r.percentage >= 50);
        if (topSorted.length) {
          topSorted.forEach(r => {
            const item = document.createElement("div");
            item.className = "performer-item";
            item.innerHTML = `<span>${r.student_name}</span> <span class="success-color" style="font-weight:700;">${r.percentage}%</span>`;
            topPerformersList.appendChild(item);
          });
        } else {
          topPerformersList.innerHTML = `<div class="performer-item empty-state">No top performers (≥ 50%)</div>`;
        }

        // Populate Needs Improvement list
        const needsImprovementList = document.getElementById("needs-improvement-list");
        needsImprovementList.innerHTML = "";
        const poorSorted = [...results].sort((a, b) => a.percentage - b.percentage).filter(r => r.percentage < 50);
        if (poorSorted.length) {
          poorSorted.forEach(r => {
            const item = document.createElement("div");
            item.className = "performer-item";
            item.innerHTML = `<span>${r.student_name}</span> <span class="danger-color" style="font-weight:700;">${r.percentage}%</span>`;
            needsImprovementList.appendChild(item);
          });
        } else {
          needsImprovementList.innerHTML = `<div class="performer-item empty-state">None (All passed)</div>`;
        }

        // Populate results table
        const tbody = document.querySelector("#resultsTable tbody");
        tbody.innerHTML = "";
        data.results.forEach(r => {
          const tr = document.createElement("tr");
          
          // Highlights
          if ((r.status || "").toLowerCase() === "fail") {
            tr.classList.add("highlight-fail");
          } else if ((r.status || "").toLowerCase() === "pass" || (r.status || "").toLowerCase() === "passed") {
            tr.classList.add("highlight-pass");
          }
          if ((r.submission_mode || "").toLowerCase().includes("auto")) {
            tr.classList.add("highlight-autosubmit");
          }

          [
            { val: r.student_name, type: 'text' },
            { val: r.title, type: 'text' },
            { val: r.marks_obtained, type: 'text' },
            { val: `${r.percentage}%`, type: 'text' },
            { val: r.status, type: 'status' },
            { val: r.attempted, type: 'text' },
            { val: r.correct, type: 'text' },
            { val: r.wrong, type: 'text' },
            { val: r.unattempted, type: 'text' },
            { val: r.tab_switch_count, type: 'text' },
            { val: r.time_spent_each_question, type: 'text' },
            { val: r.submission_mode, type: 'submission_mode' },
            { val: r.topic_analysis, type: 'text' },
            { val: r.submitted_at, type: 'text' }
          ].forEach(item => {
            const td = document.createElement("td");
            if (item.type === 'status') {
              const statusClass = (item.val || "").toLowerCase();
              td.innerHTML = `<span class="table-status-badge ${statusClass}">${item.val}</span>`;
            } else if (item.type === 'submission_mode') {
              let badgeClass = "mode-default";
              const mode = item.val || "";
              if (mode === "Limit Exceeded Submit" || mode.toLowerCase().includes("auto")) {
                badgeClass = "mode-limit-exceeded";
              } else if (mode === "Self Submitted" || mode === "Submitted") {
                badgeClass = "mode-self-submitted";
              } else if (mode === "Active" || mode === "In Progress") {
                badgeClass = "mode-active";
              } else if (mode === "Suspicious") {
                badgeClass = "mode-suspicious";
              }
              td.innerHTML = `<span class="submission-badge ${badgeClass}">${mode}</span>`;
            } else {
              td.textContent = item.val;
            }
            tr.appendChild(td);
          });
          
          // Action button cell
          const actionTd = document.createElement("td");
          actionTd.innerHTML = `<button class="btn-detail-action" data-id="${r.result_id}"><i class="fas fa-search-plus"></i> View Details</button>`;
          tr.appendChild(actionTd);
          
          tbody.appendChild(tr);
        });

        // Combined Filter logic
        const filterRows = () => {
          const term = searchInput.value.toLowerCase();
          const statusFilter = document.getElementById("statusFilterSelect")?.value || "";
          
          Array.from(tbody.children).forEach(row => {
            const textMatch = row.textContent.toLowerCase().includes(term);
            
            let statusMatch = true;
            if (statusFilter === "failed") {
              statusMatch = row.classList.contains("highlight-fail");
            } else if (statusFilter === "passed") {
              statusMatch = row.classList.contains("highlight-pass");
            } else if (statusFilter === "autosubmit") {
              statusMatch = row.classList.contains("highlight-autosubmit");
            }
            
            row.style.display = (textMatch && statusMatch) ? "" : "none";
          });
        };

        searchInput.addEventListener("input", filterRows);
        const statusFilterSelect = document.getElementById("statusFilterSelect");
        if (statusFilterSelect) {
          statusFilterSelect.addEventListener("change", filterRows);
        }
        
        // Re-apply filters for loaded dataset
        filterRows();

        // Populate PDF Report template data
        populatePdfReport(data, selects);
      })
      .catch((err) => {
        console.error(err);
        toast("WARNING Error loading performance data", "error");
      });
  });
  
  // Event Delegation for detailed report drawer
  const resultsTable = document.getElementById("resultsTable");
  if (resultsTable) {
    resultsTable.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-detail-action");
      if (btn) {
        const resultId = btn.dataset.id;
        const testType = selects.type.value;
        if (resultId && testType) {
          fetchAndShowDetail(resultId, testType);
        }
      }
    });
  }

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

  function fetchAndShowDetail(resultId, testType) {
    if (!api.resultDetailUrl) {
      toast("Error: Detail API URL not configured", "error");
      return;
    }
    
    const container = document.getElementById("drawerQuestionContainer");
    container.innerHTML = `<div class="drawer-loading"><i class="fas fa-spinner fa-spin"></i> Fetching detailed report from database...</div>`;
    
    if (detailDrawer && detailBackdrop) {
      detailDrawer.classList.remove("hidden");
      detailBackdrop.classList.remove("hidden");
      detailDrawer.setAttribute("aria-hidden", "false");
    }

    fetch(`${api.resultDetailUrl}?type=${testType}&id=${resultId}`)
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
              <pre class="code-preview"><code>${escapeHtml(q.parsed_code.code)}</code></pre>
            `;
          } else {
            answerHtml = `<p class="response-text">${escapeHtml(q.student_answer || "— (No Answer)")}</p>`;
          }

          let verdictHtml = "";
          if (q.type === "CODE" || q.type === "Code") {
            const passed = q.passed || 0;
            const total = q.total || 0;
            const badgeColor = q.correct ? "badge-success" : "badge-danger";
            verdictHtml = `
              <div class="code-metrics">
                <strong>Verdict:</strong> <span class="badge ${badgeColor}">${escapeHtml(q.verdict)}</span>
                <strong>Test Cases:</strong> <span class="badge badge-info">${passed} / ${total} Passed</span>
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
              <p class="question-text-view">${escapeHtml(q.question_text)}</p>
              
              <div class="response-section">
                <h5>Student Response:</h5>
                ${answerHtml}
              </div>

              <div class="answer-key-section">
                <h5>Correct Answer / Criteria:</h5>
                <p class="correct-text">${escapeHtml(q.correct_answer || "—")}</p>
              </div>

              ${verdictHtml}
            </div>
          `;
          container.appendChild(itemDiv);
        });
      })
      .catch(err => {
        console.error(err);
        container.innerHTML = `<div class="drawer-error"><i class="fas fa-exclamation-triangle"></i> Failed to retrieve detailed metrics from backend.</div>`;
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
  
  /* ---------------- CSV DOWNLOAD ---------------- */
  downloadBtn.addEventListener("click", () => {
    const { college, type, test } = selects;
    const selectedCourses = courseMultiselect ? courseMultiselect.getValues() : [];
    const selectedSections = sectionMultiselect ? sectionMultiselect.getValues() : [];
    const selectedYears = yearMultiselect ? yearMultiselect.getValues() : [];
    const selectedSemesters = semesterMultiselect ? semesterMultiselect.getValues() : [];

    const isPre = type.value === "pre_assessment";
    const hasRequired = isPre 
      ? (college.value && selectedCourses.length > 0 && selectedYears.length > 0)
      : (college.value && selectedCourses.length > 0 && selectedYears.length > 0 && selectedSemesters.length > 0 && selectedSections.length > 0);

    if (!type.value || !hasRequired) {
      toast("Please select all filters to export", "warning");
      return;
    }

    const params = new URLSearchParams({
      type: type.value,
      college: college.value,
      course: selectedCourses.join(","),
      year: selectedYears.join(","),
      semester: selectedSemesters.join(","),
      section: selectedSections.join(","),
      test: test.value
    });
    window.location.href = `${api.downloadUrl}?${params}`;
  });

  /* ---------------- PDF DOWNLOAD ---------------- */
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", () => {
      const { college, type } = selects;
      const selectedCourses = courseMultiselect ? courseMultiselect.getValues() : [];
      const selectedSections = sectionMultiselect ? sectionMultiselect.getValues() : [];
      const selectedYears = yearMultiselect ? yearMultiselect.getValues() : [];
      const selectedSemesters = semesterMultiselect ? semesterMultiselect.getValues() : [];

      const isPre = type.value === "pre_assessment";
      const hasRequired = isPre 
        ? (college.value && selectedCourses.length > 0 && selectedYears.length > 0)
        : (college.value && selectedCourses.length > 0 && selectedYears.length > 0 && selectedSemesters.length > 0 && selectedSections.length > 0);

      if (!type.value || !hasRequired) {
        toast("Please select all filters to export PDF", "warning");
        return;
      }

      const element = document.getElementById('pdfReportContainer');
      toast("Generating PDF report, please wait...", "info");

      const opt = {
        margin:       0,
        filename:     `${type.value}_student_performance_report.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      // Generate the PDF
      html2pdf().set(opt).from(element).save().then(() => {
        toast("PDF Report downloaded successfully", "success");
      }).catch(err => {
        console.error(err);
        toast("Failed to generate PDF report", "error");
      });
    });
  }

  /* ---------------- POPULATE PDF TEMPLATE ---------------- */
  function populatePdfReport(data, selects) {
    const results = data.results || [];
    const summary = data.summary || {};
    const meta = summary.test_metadata || {};
    
    // Header
    const typeLabel = selects.type.value === "exam" ? "Exam" : "Practice Test";
    document.getElementById("pdfExamType").textContent = typeLabel;
    
    const formattedDate = new Date().toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');
    document.getElementById("pdfGeneratedDate").textContent = formattedDate;

    // Metrics
    const percentages = results.map(r => r.percentage);
    const avg = percentages.length ? (percentages.reduce((a, b) => a + b, 0) / percentages.length).toFixed(1) : 0;
    const best = percentages.length ? Math.max(...percentages).toFixed(1) : 0;
    const worst = percentages.length ? Math.min(...percentages).toFixed(1) : 0;
    
    const totalCount = results.length;
    const passCount = summary.pass || 0;
    const failCount = summary.fail || 0;
    const passPct = totalCount ? ((passCount / totalCount) * 100).toFixed(1) : 0;
    const failPct = totalCount ? ((failCount / totalCount) * 100).toFixed(1) : 0;

    document.getElementById("pdfTotalStudents").textContent = totalCount;
    document.getElementById("pdfPassedVal").textContent = passCount;
    document.getElementById("pdfPassedPct").textContent = `${passPct}%`;
    document.getElementById("pdfFailedVal").textContent = failCount;
    document.getElementById("pdfFailedPct").textContent = `${failPct}%`;
    document.getElementById("pdfAvgScore").textContent = `${avg}%`;
    document.getElementById("pdfHighestScore").textContent = `${best}%`;
    document.getElementById("pdfLowestScore").textContent = `${worst}%`;

    // Distribution
    const excellentCount = results.filter(r => r.percentage >= 90).length;
    const goodCount = results.filter(r => r.percentage >= 75 && r.percentage < 90).length;
    const averageCount = results.filter(r => r.percentage >= 50 && r.percentage < 75).length;
    const poorCount = results.filter(r => r.percentage >= 25 && r.percentage < 50).length;
    const veryPoorCount = results.filter(r => r.percentage < 25).length;

    const excellentPct = totalCount ? ((excellentCount / totalCount) * 100).toFixed(1) : 0;
    const goodPct = totalCount ? ((goodCount / totalCount) * 100).toFixed(1) : 0;
    const averagePct = totalCount ? ((averageCount / totalCount) * 100).toFixed(1) : 0;
    const poorPct = totalCount ? ((poorCount / totalCount) * 100).toFixed(1) : 0;
    const veryPoorPct = totalCount ? ((veryPoorCount / totalCount) * 100).toFixed(1) : 0;

    document.getElementById("pdfExcellentBar").style.width = `${excellentPct}%`;
    document.getElementById("pdfExcellentText").textContent = `${excellentCount} (${excellentPct}%)`;
    document.getElementById("pdfGoodBar").style.width = `${goodPct}%`;
    document.getElementById("pdfGoodText").textContent = `${goodCount} (${goodPct}%)`;
    document.getElementById("pdfAverageBar").style.width = `${averagePct}%`;
    document.getElementById("pdfAverageText").textContent = `${averageCount} (${averagePct}%)`;
    document.getElementById("pdfPoorBar").style.width = `${poorPct}%`;
    document.getElementById("pdfPoorText").textContent = `${poorCount} (${poorPct}%)`;
    document.getElementById("pdfVeryPoorBar").style.width = `${veryPoorPct}%`;
    document.getElementById("pdfVeryPoorText").textContent = `${veryPoorCount} (${veryPoorPct}%)`;

    // Test Summary
    const avgAttempted = totalCount ? (results.reduce((sum, r) => sum + (parseInt(r.attempted) || 0), 0) / totalCount).toFixed(1) : 0;
    const avgUnattempted = totalCount ? (results.reduce((sum, r) => sum + (parseInt(r.unattempted) || 0), 0) / totalCount).toFixed(1) : 0;

    document.getElementById("pdfSummaryQuestions").textContent = meta.total_questions || 0;
    document.getElementById("pdfSummaryAttempted").textContent = avgAttempted;
    document.getElementById("pdfSummaryUnattempted").textContent = avgUnattempted;
    document.getElementById("pdfSummaryTotalMarks").textContent = meta.max_marks || 0;
    document.getElementById("pdfSummaryNegative").textContent = meta.negative_marking || "No";
    document.getElementById("pdfSummaryTotalTime").textContent = `${meta.duration || 0} mins`;

    // Key Insights
    const below50Pct = totalCount ? Math.round((results.filter(r => r.percentage < 50).length / totalCount) * 100) : 0;
    document.getElementById("pdfInsightImprovementTitle").textContent = `${below50Pct}% students need improvement`;
    if (below50Pct === 100) {
      document.getElementById("pdfInsightImprovementDesc").textContent = "All students scored below 50%. Additional support recommended.";
    } else if (below50Pct > 0) {
      document.getElementById("pdfInsightImprovementDesc").textContent = `${below50Pct}% of students scored below 50%. Focus reviews recommended.`;
    } else {
      document.getElementById("pdfInsightImprovementDesc").textContent = "Great job! All students scored above 50%.";
    }
    document.getElementById("pdfInsightTimeDesc").textContent = `Average time taken is ${summary.avg_time_taken_formatted || "00:00"} minutes.`;

    const topSorted = [...results].sort((a, b) => b.percentage - a.percentage).filter(r => r.percentage >= 50);
    const topText = topSorted.slice(0, 3).map(r => `${r.student_name} (${r.percentage}%)`).join(", ");
    document.getElementById("pdfInsightTopPerformers").textContent = topText || "No top performers (≥ 50%)";

    const poorSorted = [...results].sort((a, b) => a.percentage - b.percentage).filter(r => r.percentage < 50);
    const poorText = poorSorted.slice(0, 3).map(r => `${r.student_name} (${r.percentage}%)`).join(", ");
    document.getElementById("pdfInsightNeedsImprovement").textContent = poorText || "None (All passed)";

    // Table
    const tbody = document.querySelector("#pdfResultsTable tbody");
    tbody.innerHTML = "";
    results.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #e2e8f0";
      tr.style.pageBreakInside = "avoid";
      tr.style.breakInside = "avoid";
      if (idx % 2 === 1) {
        tr.style.background = "#f8fafc";
      }

      const resultBadge = r.status.toLowerCase().includes("pass")
        ? `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; border: 1px solid #16a34a; color: #16a34a; font-weight: bold; background: #f0fdf4;">Pass</span>`
        : `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; border: 1px solid #dc2626; color: #dc2626; font-weight: bold; background: #fef2f2;">Fail</span>`;

      tr.innerHTML = `
        <td style="padding: 10px 10px;">${idx + 1}</td>
        <td style="padding: 10px 10px; font-weight: bold; color: #334155;">${escapeHtml(r.student_name)}</td>
        <td style="padding: 10px 10px;">${r.marks_obtained} / ${r.total_marks}</td>
        <td style="padding: 10px 10px; font-weight: bold;">${r.percentage}%</td>
        <td style="padding: 10px 10px;">${resultBadge}</td>
        <td style="padding: 10px 10px;">${r.attempted}</td>
        <td style="padding: 10px 10px; color: #16a34a; font-weight: bold;">${r.correct}</td>
        <td style="padding: 10px 10px; color: #dc2626; font-weight: bold;">${r.wrong}</td>
        <td style="padding: 10px 10px;">${r.unattempted}</td>
        <td style="padding: 10px 10px;">${r.time_taken || "-"}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("pdfFooterDate1").textContent = formattedDate;
    document.getElementById("pdfFooterDate2").textContent = formattedDate;
  }
});
