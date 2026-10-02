// static/js/admin_attendance.js

class MultiSelectDropdown {
  constructor(container, placeholder, onChangeCallback) {
    this.container = container;
    this.placeholder = placeholder;
    this.onChangeCallback = onChangeCallback;

    this.trigger = container.querySelector('.multiselect-trigger');
    this.badgeText = container.querySelector('.multiselect-badge-text');
    this.dropdown = container.querySelector('.multiselect-dropdown');
    this.searchInput = container.querySelector('.multiselect-search');
    this.optionsContainer = container.querySelector('.multiselect-options');
    this.selectAllBtn = container.querySelector('.select-all');
    this.clearAllBtn = container.querySelector('.clear-all');

    this.options = []; // Array of { value, text, element, checkbox }
    this.selectedValues = new Set();

    this.initEvents();
  }

  initEvents() {
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other dropdowns first
      document.querySelectorAll('.multiselect-dropdown.open').forEach(d => {
        if (d !== this.dropdown) d.classList.remove('open');
      });
      this.dropdown.classList.toggle('open');
      if (this.dropdown.classList.contains('open') && this.searchInput) {
        this.searchInput.focus();
      }
    });

    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        // Close other dropdowns first
        document.querySelectorAll('.multiselect-dropdown.open').forEach(d => {
          if (d !== this.dropdown) d.classList.remove('open');
        });
        this.dropdown.classList.add('open');
        if (this.searchInput) this.searchInput.focus();
      }
      if (e.key === 'Escape') {
        this.dropdown.classList.remove('open');
      }
    });

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        const query = this.searchInput.value.toLowerCase().trim();
        this.options.forEach(opt => {
          const match = opt.text.toLowerCase().includes(query);
          opt.element.style.display = match ? 'flex' : 'none';
        });
      });
    }

    if (this.selectAllBtn) {
      this.selectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.options.forEach(opt => {
          if (opt.element.style.display !== 'none') {
            opt.checkbox.checked = true;
            this.selectedValues.add(opt.value);
          }
        });
        this.updateBadge();
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.options.forEach(opt => {
          opt.checkbox.checked = false;
          this.selectedValues.delete(opt.value);
        });
        this.updateBadge();
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.dropdown.classList.remove('open');
      }
    });

    // Handle Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.dropdown.classList.remove('open');
      }
    });
  }

  populate(data, label) {
    this.optionsContainer.innerHTML = '';
    this.options = [];
    this.selectedValues.clear();

    if (!data || data.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '8px 12px';
      emptyMsg.style.fontSize = '12px';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.textContent = `No ${label}s available`;
      this.optionsContainer.appendChild(emptyMsg);
      this.updateBadge();
      return;
    }

    data.forEach(item => {
      const val = (item && typeof item === 'object') ? (item.id ?? item.value ?? item) : item;
      const text = (item && typeof item === 'object') ? (item.name ?? item.label ?? String(val)) : String(item);
      const strVal = String(val);

      const labelEl = document.createElement('label');
      labelEl.className = 'multiselect-option';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = strVal;

      chk.addEventListener('change', () => {
        if (chk.checked) {
          this.selectedValues.add(strVal);
        } else {
          this.selectedValues.delete(strVal);
        }
        this.updateBadge();
        if (this.onChangeCallback) this.onChangeCallback();
      });

      const span = document.createElement('span');
      span.textContent = String(text);

      labelEl.appendChild(chk);
      labelEl.appendChild(span);
      this.optionsContainer.appendChild(labelEl);

      this.options.push({
        value: strVal,
        text: String(text),
        element: labelEl,
        checkbox: chk
      });
    });

    this.updateBadge();
  }

  updateBadge() {
    if (this.selectedValues.size === 0) {
      this.badgeText.textContent = `All ${this.placeholder}s`;
    } else if (this.selectedValues.size === this.options.length && this.options.length > 0) {
      this.badgeText.textContent = `All ${this.placeholder}s Selected`;
    } else {
      const names = [];
      this.options.forEach(opt => {
        if (this.selectedValues.has(opt.value)) {
          names.push(opt.text);
        }
      });
      if (names.length <= 2) {
        this.badgeText.textContent = names.join(', ');
      } else {
        this.badgeText.textContent = `${this.selectedValues.size} ${this.placeholder}s Selected`;
      }
    }
  }

  getValues() {
    return Array.from(this.selectedValues);
  }

  clear() {
    this.options.forEach(opt => {
      opt.checkbox.checked = false;
    });
    this.selectedValues.clear();
    this.updateBadge();
    if (this.searchInput) {
      this.searchInput.value = '';
      this.options.forEach(opt => opt.element.style.display = 'flex');
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.querySelector("#attendance-table tbody");
    const studentTableBody = document.querySelector("#student-summary-table tbody");
    const filterBtn = document.getElementById("filter-btn");
    const downloadBtn = document.getElementById("download-btn");
    
    // KPI elements
    const kpiTotal = document.getElementById("kpi-total");
    const kpiPresent = document.getElementById("kpi-present");
    const kpiAbsent = document.getElementById("kpi-absent");
    const kpiPercentage = document.getElementById("kpi-percentage");

    let pieChart, barChart;

    // ---------------------------- Tab Switching ----------------------------
    const tabs = document.querySelectorAll(".tab-trigger");
    const panels = document.querySelectorAll(".tab-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const targetTab = tab.dataset.tab;

            // Remove active classes
            tabs.forEach(t => t.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));

            // Add active class to clicked tab and its content panel
            tab.classList.add("active");
            document.getElementById(`tab-${targetTab}`).classList.add("active");
        });
    });

    // ---------------------------- Init Dropdown Instances ----------------------------
    const collegeContainer = document.getElementById('collegeSelectContainer');
    const courseContainer = document.getElementById('courseSelectContainer');
    const yearContainer = document.getElementById('yearSelectContainer');
    const semesterContainer = document.getElementById('semesterSelectContainer');
    const sectionContainer = document.getElementById('sectionSelectContainer');

    const selects = {
        college: collegeContainer ? new MultiSelectDropdown(collegeContainer, 'College') : null,
        course: courseContainer ? new MultiSelectDropdown(courseContainer, 'Course') : null,
        year: yearContainer ? new MultiSelectDropdown(yearContainer, 'Year') : null,
        semester: semesterContainer ? new MultiSelectDropdown(semesterContainer, 'Semester') : null,
        section: sectionContainer ? new MultiSelectDropdown(sectionContainer, 'Section') : null,
    };

    // ---------------------------- Fetch Attendance ----------------------------
    async function loadAttendance() {
        const params = new URLSearchParams();
        if (selects.college) {
            const vals = selects.college.getValues();
            if (vals.length > 0) params.set('college', vals.join(','));
        }
        if (selects.course) {
            const vals = selects.course.getValues();
            if (vals.length > 0) params.set('course', vals.join(','));
        }
        if (selects.year) {
            const vals = selects.year.getValues();
            if (vals.length > 0) params.set('year', vals.join(','));
        }
        if (selects.semester) {
            const vals = selects.semester.getValues();
            if (vals.length > 0) params.set('semester', vals.join(','));
        }
        if (selects.section) {
            const vals = selects.section.getValues();
            if (vals.length > 0) params.set('section', vals.join(','));
        }
        params.set('start', document.getElementById("start-date").value);
        params.set('end', document.getElementById("end-date").value);

        try {
            const res = await fetch(`/api/admin/admin/attendance/list/?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();

            renderTable(payload.records);
            renderSummary(payload.summary);
            renderStudentSummary(payload.per_student);
            renderCharts(payload.summary, payload.per_student);
        } catch (err) {
            console.error("ERROR Failed to load attendance:", err);
            alert("Could not load attendance data. Check console for details.");
        }
    }

    // ---------------------------- Renderers ----------------------------
    function renderTable(data) {
        tableBody.innerHTML = "";
        if (!data.length) {
            tableBody.innerHTML = "<tr><td colspan='10' style='text-align:center; padding: 30px; color: var(--text-secondary);'>No records found matching filters.</td></tr>";
            return;
        }
        data.forEach(r => {
            const tr = document.createElement("tr");
            const isPresent = r.status.toLowerCase() === "present";
            const badgeClass = isPresent ? "badge-present" : "badge-absent";
            
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-primary);">${r.student_usn}</td>
                <td>${r.student_name}</td>
                <td>${r.college}</td>
                <td>${r.course}</td>
                <td>${r.year}</td>
                <td>Sem ${r.semester}</td>
                <td>${r.section}</td>
                <td>${r.date}</td>
                <td>Slot ${r.slot}</td>
                <td><span class="badge ${badgeClass}">${r.status}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    function renderSummary(summary) {
        if (kpiTotal) kpiTotal.textContent = summary.total_records;
        if (kpiPresent) kpiPresent.textContent = summary.present;
        if (kpiAbsent) kpiAbsent.textContent = summary.absent;
        if (kpiPercentage) kpiPercentage.textContent = `${summary.attendance_percentage}%`;
    }

    function renderStudentSummary(data) {
        studentTableBody.innerHTML = "";
        if (!data.length) {
            studentTableBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding: 30px; color: var(--text-secondary);'>No per-student data.</td></tr>";
            return;
        }
        data.forEach(s => {
            const tr = document.createElement("tr");
            const lowAttendance = s.attendance_percentage < 75;
            const statusLabel = lowAttendance ? "Low (< 75%)" : "Good";
            const statusClass = lowAttendance ? "badge-warning" : "badge-present";
            
            tr.innerHTML = `
                <td style="font-weight: 600;">${s.student_usn}</td>
                <td>${s.student_name}</td>
                <td>${s.present}</td>
                <td>${s.absent}</td>
                <td style="font-weight: 700; color: ${lowAttendance ? 'var(--warning)' : 'var(--success)'};">${s.attendance_percentage}%</td>
                <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            `;
            studentTableBody.appendChild(tr);
        });
    }

    function renderCharts(summary, perStudent) {
        const pieCanvas = document.getElementById("pieChart");
        const barCanvas = document.getElementById("barChart");
        if (!pieCanvas || !barCanvas) return;

        const isDarkMode = document.body.classList.contains("dark-mode");
        const textLabelColor = isDarkMode ? "#94a3b8" : "#475569";
        const gridBorderColor = isDarkMode ? "#27272a" : "#e2e8f0";

        const pieCtx = pieCanvas.getContext("2d");
        const barCtx = barCanvas.getContext("2d");
        if (pieChart) pieChart.destroy();
        if (barChart) barChart.destroy();

        // 1. Overall Ratio Pie Chart
        pieChart = new Chart(pieCtx, {
            type: "pie",
            data: {
                labels: ["Present", "Absent"],
                datasets: [{
                    data: [summary.present, summary.absent],
                    backgroundColor: ["#16a34a", "  #64748B"],
                    borderColor: isDarkMode ? "#18181b" : "#ffffff",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textLabelColor,
                            font: { family: 'Century Gothic', size: 12 }
                        }
                    }
                }
            }
        });

        // 2. Attendance Distribution Ranges (Group by ranges for a cleaner graph)
        const ranges = { "90-100%": 0, "75-89%": 0, "50-74%": 0, "<50%": 0 };
        perStudent.forEach(s => {
            const pct = s.attendance_percentage;
            if (pct >= 90) ranges["90-100%"]++;
            else if (pct >= 75) ranges["75-89%"]++;
            else if (pct >= 50) ranges["50-74%"]++;
            else ranges["<50%"]++;
        });

        barChart = new Chart(barCtx, {
            type: "bar",
            data: {
                labels: Object.keys(ranges),
                datasets: [{
                    label: "Students count",
                    data: Object.values(ranges),
                    backgroundColor: "#008037",
                    borderRadius: 6,
                    maxBarThickness: 45
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textLabelColor,
                            font: { family: 'Century Gothic', size: 12 }
                        }
                    },
                    y: {
                        grid: { color: gridBorderColor },
                        ticks: {
                            color: textLabelColor,
                            font: { family: 'Century Gothic', size: 12 },
                            precision: 0
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // ---------------------------- Dropdowns ----------------------------
    async function loadDropdowns() {
        try {
            const [colleges, courses, sections, years, semesters] = await Promise.all([
                fetch("/api/admin/api/colleges/").then(r => r.json()),
                fetch("/api/admin/api/courses/").then(r => r.json()),
                fetch("/api/admin/api/sections/").then(r => r.json()),
                fetch("/api/admin/api/years/").then(r => r.json()),
                fetch("/api/admin/api/semesters/").then(r => r.json()),
            ]);

            if (selects.college) selects.college.populate(colleges, "College");
            if (selects.course) selects.course.populate(courses, "Course");
            if (selects.section) selects.section.populate(sections, "Section");
            if (selects.year) selects.year.populate(years, "Year");
            if (selects.semester) selects.semester.populate(semesters, "Semester");
        } catch (err) {
            console.error("ERROR Dropdown load error:", err);
            alert("Failed to load dropdown data. Check console for details.");
        }
    }

    // ---------------------------- Live Client-side Search ----------------------------
    const detailedSearch = document.getElementById("detailed-search");
    const studentSearch = document.getElementById("student-search");

    if (detailedSearch) {
        detailedSearch.addEventListener("input", () => {
            const query = detailedSearch.value.toLowerCase().trim();
            const rows = document.querySelectorAll("#attendance-table tbody tr");
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? "" : "none";
            });
        });
    }

    if (studentSearch) {
        studentSearch.addEventListener("input", () => {
            const query = studentSearch.value.toLowerCase().trim();
            const rows = document.querySelectorAll("#student-summary-table tbody tr");
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? "" : "none";
            });
        });
    }

    // ---------------------------- Event Listeners ----------------------------
    filterBtn.addEventListener("click", loadAttendance);

    downloadBtn.addEventListener("click", () => {
        const params = new URLSearchParams();
        if (selects.college) {
            const vals = selects.college.getValues();
            if (vals.length > 0) params.set('college', vals.join(','));
        }
        if (selects.course) {
            const vals = selects.course.getValues();
            if (vals.length > 0) params.set('course', vals.join(','));
        }
        if (selects.year) {
            const vals = selects.year.getValues();
            if (vals.length > 0) params.set('year', vals.join(','));
        }
        if (selects.semester) {
            const vals = selects.semester.getValues();
            if (vals.length > 0) params.set('semester', vals.join(','));
        }
        if (selects.section) {
            const vals = selects.section.getValues();
            if (vals.length > 0) params.set('section', vals.join(','));
        }
        params.set('start', document.getElementById("start-date").value);
        params.set('end', document.getElementById("end-date").value);

        window.location = `/api/admin/admin/attendance/download/?${params}`;
    });

    // ---------------------------- Init ----------------------------
    loadDropdowns().then(loadAttendance);
});
