// static/js/admin_student_resume.js

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
      emptyMsg.style.color = 'var(--text-light)';
      emptyMsg.textContent = `No ${label}s available`;
      this.optionsContainer.appendChild(emptyMsg);
      this.updateBadge();
      return;
    }

    data.forEach(item => {
      const val = (item && typeof item === 'object') ? (item.id ?? item.value ?? item) : item;
      const text = (item && typeof item === 'object') ? (item.name ?? String(val)) : String(item);
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
      this.badgeText.style.color = 'var(--text-light)';
    } else if (this.selectedValues.size === this.options.length && this.options.length > 0) {
      this.badgeText.textContent = `All ${this.placeholder}s Selected`;
      this.badgeText.style.color = 'var(--text-dark)';
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
      this.badgeText.style.color = 'var(--text-dark)';
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

document.addEventListener('DOMContentLoaded', () => {
  const pageEl = document.getElementById('studentResumePage');
  if (!pageEl) return;

  const apiUrls = {
    colleges: pageEl.dataset.collegesUrl,
    courses: pageEl.dataset.coursesUrl,
    filters: pageEl.dataset.filtersUrl,
    resumes: pageEl.dataset.resumesUrl,
    downloadZip: pageEl.dataset.downloadZipUrl,
  };

  const collegeContainer = document.getElementById('collegeSelectContainer');
  const courseContainer = document.getElementById('courseSelectContainer');
  const semesterContainer = document.getElementById('semesterSelectContainer');
  const yearContainer = document.getElementById('yearSelectContainer');

  const selects = {
    college: collegeContainer ? new MultiSelectDropdown(collegeContainer, 'College', onFilterChange) : null,
    course: courseContainer ? new MultiSelectDropdown(courseContainer, 'Course', onFilterChange) : null,
    semester: semesterContainer ? new MultiSelectDropdown(semesterContainer, 'Semester', onFilterChange) : null,
    year: yearContainer ? new MultiSelectDropdown(yearContainer, 'Year', onFilterChange) : null,
  };

  function onFilterChange() {
    selectedUSNs.clear();
    loadResumes();
  }

  const searchInput = document.getElementById('resumeSearch');
  const clearBtn = document.getElementById('clearSearch');
  const tbody = document.querySelector('#resumeTable tbody');
  
  const toggleAllCheckboxes = document.getElementById('toggleAllCheckboxes');
  const selectCountLabel = document.getElementById('select-count');
  const studentCountBadge = document.getElementById('student-count-badge');
  const downloadSelectedBtn = document.getElementById('download-selected-btn');
  const downloadAllMatchingBtn = document.getElementById('download-all-matching-btn');

  // ---------- Selection State ----------
  let selectedUSNs = new Set();
  let visibleUSNs = []; // USNs currently displayed in the table

  // ---------- Helpers ----------
  function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  function setLoadingRow(text = 'Querying resume databases...') {
    if (!tbody) return;
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'loading-td';
    td.innerHTML = `
      <div class="loader-wrapper">
        <div class="spinner"></div>
        <p>${text}</p>
      </div>
    `;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const ct = res.headers.get('Content-Type') || '';
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      if (!ct.includes('application/json')) {
        throw new Error('Unexpected response (not JSON). Are you logged in?');
      }
      return await res.json();
    } catch (err) {
      showToast(`Failed to load data: ${err.message}`, 'error');
      return null;
    }
  }

  function updateSelectionUI() {
    const totalSelected = selectedUSNs.size;
    if (selectCountLabel) {
      selectCountLabel.textContent = totalSelected;
    }

    if (downloadSelectedBtn) {
      if (totalSelected > 0) {
        downloadSelectedBtn.classList.remove('disabled');
        downloadSelectedBtn.disabled = false;
      } else {
        downloadSelectedBtn.classList.add('disabled');
        downloadSelectedBtn.disabled = true;
      }
    }

    // Update master toggle state
    if (toggleAllCheckboxes && visibleUSNs.length > 0) {
      const allVisibleSelected = visibleUSNs.every(usn => selectedUSNs.has(usn));
      toggleAllCheckboxes.checked = allVisibleSelected;
    } else if (toggleAllCheckboxes) {
      toggleAllCheckboxes.checked = false;
    }
  }

  function buildRow(student) {
    const tr = document.createElement('tr');
    tr.className = 'hover-row-effect';
    if (selectedUSNs.has(student.usn)) {
      tr.classList.add('row-selected');
    }

    // Checkbox Column
    const tdCheck = document.createElement('td');
    tdCheck.style.textAlign = 'center';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'custom-checkbox student-checkbox';
    chk.checked = selectedUSNs.has(student.usn);
    chk.addEventListener('change', () => {
      if (chk.checked) {
        selectedUSNs.add(student.usn);
        tr.classList.add('row-selected');
      } else {
        selectedUSNs.delete(student.usn);
        tr.classList.remove('row-selected');
      }
      updateSelectionUI();
    });
    tdCheck.appendChild(chk);
    tr.appendChild(tdCheck);

    // USN Column
    const tdUsn = document.createElement('td');
    tdUsn.className = 'td-bold';
    tdUsn.textContent = student.usn || '—';
    tr.appendChild(tdUsn);

    // Name Column
    const tdName = document.createElement('td');
    tdName.textContent = student.name || '—';
    tr.appendChild(tdName);

    // Email Column
    const tdEmail = document.createElement('td');
    tdEmail.textContent = student.email || '—';
    tr.appendChild(tdEmail);

    // Resume Link Column
    const tdResume = document.createElement('td');
    tdResume.style.textAlign = 'center';
    if (student.resume_url) {
      const a = document.createElement('a');
      a.href = student.resume_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = '';
      a.className = 'btn btn-primary-sm btn-icon-left';
      a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Download`;
      tdResume.appendChild(a);
    } else {
      tdResume.innerHTML = `<span class="badge" style="background:#fef2f2; color:#ef4444;">No Resume</span>`;
    }
    tr.appendChild(tdResume);

    return tr;
  }

  // Debounce utility
  function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ---------- Loads ----------
  async function loadInitialFilters() {
    setLoadingRow();
    const [colleges, courses, dyn] = await Promise.all([
      fetchJSON(apiUrls.colleges),
      fetchJSON(apiUrls.courses),
      fetchJSON(apiUrls.filters),
    ]);

    if (!colleges || !courses || !dyn) {
      setLoadingRow('Failed to load profile databases.');
      return;
    }

    if (selects.college) selects.college.populate(colleges, 'College');
    if (selects.course) selects.course.populate(courses, 'Course');
    if (selects.semester) selects.semester.populate(dyn.semesters, 'Semester');
    if (selects.year) selects.year.populate(dyn.years, 'Year');

    await loadResumes();
  }

  async function loadResumes() {
    setLoadingRow();

    const params = new URLSearchParams();
    if (selects.college) {
      const vals = selects.college.getValues();
      if (vals.length > 0) params.set('college', vals.join(','));
    }
    if (selects.course) {
      const vals = selects.course.getValues();
      if (vals.length > 0) params.set('course', vals.join(','));
    }
    if (selects.semester) {
      const vals = selects.semester.getValues();
      if (vals.length > 0) params.set('semester', vals.join(','));
    }
    if (selects.year) {
      const vals = selects.year.getValues();
      if (vals.length > 0) params.set('year', vals.join(','));
    }
    params.set('q', (searchInput?.value || '').trim());

    const url = `${apiUrls.resumes}?${params.toString()}`;
    const data = await fetchJSON(url);

    tbody.innerHTML = '';
    visibleUSNs = [];

    if (!data || !Array.isArray(data) || data.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'no-data-td';
      td.innerHTML = `
        <div class="no-data-wrapper">
          <span class="no-data-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></span>
          <p>No student resumes match your selection.</p>
        </div>
      `;
      tr.appendChild(td);
      tbody.appendChild(tr);
      
      if (studentCountBadge) studentCountBadge.textContent = '0 Students';
      updateSelectionUI();
      return;
    }

    if (studentCountBadge) {
      studentCountBadge.textContent = `${data.length} Student${data.length === 1 ? '' : 's'}`;
    }

    data.forEach(student => {
      visibleUSNs.push(student.usn);
      tbody.appendChild(buildRow(student));
    });

    updateSelectionUI();
  }

  const debouncedSearch = debounce(loadResumes, 350);

  // ---------- Bulk Actions Handlers ----------
  toggleAllCheckboxes?.addEventListener('change', () => {
    const isChecked = toggleAllCheckboxes.checked;
    
    // Select/deselect checkboxes in DOM
    const checkboxes = tbody.querySelectorAll('.student-checkbox');
    checkboxes.forEach(chk => {
      chk.checked = isChecked;
      
      // Update row class
      const tr = chk.closest('tr');
      if (tr) {
        tr.classList.toggle('row-selected', isChecked);
      }
    });

    // Update state set
    visibleUSNs.forEach(usn => {
      if (isChecked) {
        selectedUSNs.add(usn);
      } else {
        selectedUSNs.delete(usn);
      }
    });

    updateSelectionUI();
  });

  downloadSelectedBtn?.addEventListener('click', () => {
    if (selectedUSNs.size === 0) return;
    const usnsList = Array.from(selectedUSNs).join(',');
    const downloadUrl = `${apiUrls.downloadZip}?usns=${encodeURIComponent(usnsList)}`;
    
    showToast(`Generating ZIP for ${selectedUSNs.size} selected resumes...`, 'info');
    window.location.href = downloadUrl;
  });

  downloadAllMatchingBtn?.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (selects.college) {
      const vals = selects.college.getValues();
      if (vals.length > 0) params.set('college', vals.join(','));
    }
    if (selects.course) {
      const vals = selects.course.getValues();
      if (vals.length > 0) params.set('course', vals.join(','));
    }
    if (selects.semester) {
      const vals = selects.semester.getValues();
      if (vals.length > 0) params.set('semester', vals.join(','));
    }
    if (selects.year) {
      const vals = selects.year.getValues();
      if (vals.length > 0) params.set('year', vals.join(','));
    }
    params.set('q', (searchInput?.value || '').trim());
    
    const downloadUrl = `${apiUrls.downloadZip}?${params.toString()}`;
    showToast('Generating ZIP for all matching criteria...', 'info');
    window.location.href = downloadUrl;
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      selectedUSNs.clear();
      debouncedSearch();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        selectedUSNs.clear();
        loadResumes();
      }
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedUSNs.clear();
      if (selects.college) selects.college.clear();
      if (selects.course) selects.course.clear();
      if (selects.semester) selects.semester.clear();
      if (selects.year) selects.year.clear();
      if (searchInput) searchInput.value = '';
      
      loadResumes();
      searchInput?.focus();
    });
  }

  // ---------- Init ----------
  loadInitialFilters();
});
