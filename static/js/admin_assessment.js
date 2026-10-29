// static/js/admin_assessment.js
document.addEventListener('DOMContentLoaded', async function () {
  'use strict';

  // ─── Utility ───────────────────────────────────────────────────────────────
  const apiDiv = document.getElementById('assessment-api-urls');
  const urls = {
    listExams: apiDiv.dataset.listExams,
    addExam: apiDiv.dataset.addExam,
    updateExam: apiDiv.dataset.updateExam,
    deleteExam: apiDiv.dataset.deleteExam,
    getExamQuestions: apiDiv.dataset.getExamQuestions,
    addQuestion: apiDiv.dataset.addQuestion,
    updateQuestion: apiDiv.dataset.updateQuestion,
    deleteQuestion: apiDiv.dataset.deleteQuestion,
    scheduleExam: apiDiv.dataset.scheduleExam,
    listScheduledExams: apiDiv.dataset.listScheduledExams,
    updateSchedule: apiDiv.dataset.updateSchedule,
    deleteSchedule: apiDiv.dataset.deleteSchedule,
    dropdownsUrl: apiDiv.dataset.dropdownsUrl,

    // NEW endpoints (make sure admin_assessment.html provides these data-* attributes)
    downloadExamPaper: apiDiv.dataset.downloadExamPaper,
    bulkUpload: apiDiv.dataset.bulkUpload,
    viewSubmissions: apiDiv.dataset.viewSubmissions,
    allowRetake: apiDiv.dataset.allowRetake,
    removeAttempt: apiDiv.dataset.removeAttempt,
  };

  const placeholder = '00000000-0000-0000-0000-000000000000';
  let currentScheduleId = null;
  let submissionsRefreshTimer = null;
  let liveMonitorInterval = null;
  let liveMonitorFilter = 'all';
  let liveSectionFilter = '';
  let liveCourseFilter = '';
  let liveSearchText = '';
  let cachedExams = [];
  const csrfToken = (() => {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  })();

  const root = document.getElementById('assessment-root');

  function showToast(msg, success = true) {
    const t = document.getElementById('assessment-toast');
    t.textContent = msg;
    t.classList.remove('toast-success','toast-error','show');
    t.classList.add(success ? 'toast-success' : 'toast-error','show');
    setTimeout(()=> t.classList.remove('show'),2500);
  }

  function createModal(id, content, fullscreen = false) {
    const modal = document.createElement('div');
    modal.className = fullscreen ? 'modal fullscreen-modal' : 'modal';
    modal.id = id;

    const box = document.createElement('div');
    box.className = fullscreen ? 'modal-content fullscreen-content' : 'modal-content';
    box.appendChild(content);
    modal.appendChild(box);

    document.body.appendChild(modal);
    return modal;
  }
  function openModal(id) {
    const e = document.getElementById(id);
    if (e) { e.classList.add('modal-show'); document.body.classList.add('modal-open'); }
  }
  function closeModal(id) {
    const e = document.getElementById(id);
    if (e) {
      e.classList.remove('modal-show');
      setTimeout(()=> e.parentNode && e.parentNode.removeChild(e),300);
    }
    if ((id === 'submissions-modal' || id === 'live-monitor-modal') && submissionsRefreshTimer) {
      clearInterval(submissionsRefreshTimer);
      submissionsRefreshTimer = null;
      currentScheduleId = null;
    }
    if (liveMonitorInterval) {
      clearInterval(liveMonitorInterval);
      liveMonitorInterval = null;
    }
    document.body.classList.remove('modal-open');
  }

  async function fetchDropdowns() {
    const r = await fetch(urls.dropdownsUrl,{credentials:'same-origin'});
    const data = r.ok ? await r.json() : {};
    console.log('Loaded dropdowns:', data);
    return data;
  }
  const DROPDOWNS = await fetchDropdowns();

  // ─── Bulk Upload Format Modal ───────────────────────────────────────────────
  function showBulkUploadFormatModal(examId, endpoint) {
    const modalId = 'bulk-format-modal';
    closeModal(modalId);

    const cont = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-modal';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => closeModal(modalId);
    cont.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.textContent = 'Bulk Upload Format';
    cont.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'Before uploading, please ensure your CSV/XLSX file follows this format:';
    cont.appendChild(desc);

    // Example Table
    const table = document.createElement('table');
    table.className = 'exam-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['question_text', 'type', 'marks', 'negative_mark', 'options', 'correct_answer', 'test_cases'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const sampleRow = [
      'What is 2+2?',
      'MCQ',
      '2',
      '0',
      '["1","2","3","4"]',
      '4',
      '[]'
    ];
    sampleRow.forEach(txt => {
      const td = document.createElement('td');
      td.textContent = txt;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    table.appendChild(tbody);
    cont.appendChild(table);

    // Download Links
    const dlWrap = document.createElement('div');
    dlWrap.style.marginTop = '10px';
    const csv = document.createElement('a');
    csv.href = '/static/templates/bulk_upload_template.csv';
    csv.textContent = '⬇ Download CSV Template';
    csv.download = 'bulk_upload_template.csv';
    csv.style.display = 'block';
    const xlsx = document.createElement('a');
    xlsx.href = '/static/templates/bulk_upload_template.xlsx';
    xlsx.textContent = '⬇ Download XLSX Template';
    xlsx.download = 'bulk_upload_template.xlsx';
    xlsx.style.display = 'block';
    dlWrap.append(csv, xlsx);
    cont.appendChild(dlWrap);

    // Buttons
    const btnWrap = document.createElement('div');
    btnWrap.style.marginTop = '15px';
    btnWrap.style.textAlign = 'right';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => closeModal(modalId);

    const contBtn = document.createElement('button');
    contBtn.className = 'add-btn';
    contBtn.textContent = 'Continue to Upload';
    contBtn.onclick = () => {
      closeModal(modalId);
      startBulkUpload(endpoint, examId);
    };

    btnWrap.append(cancelBtn, contBtn);
    cont.appendChild(btnWrap);

    createModal(modalId, cont);
    openModal(modalId);
  }

  // ─── Bulk Upload Logic ─────────────────────────────────────────────────────
  async function startBulkUpload(endpoint, examId) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.xlsx,.xls';
    inp.onchange = async () => {
      if (!inp.files || !inp.files[0]) return;
      const fd = new FormData();
      fd.append('file', inp.files[0]);

      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRFToken': csrfToken },
          body: fd
        });
        const d = await r.json();
        const ok = r.ok && d.status === 'success';
        showToast(d.message || (ok ? 'Upload complete' : 'Upload failed'), ok);
        if (ok) {
          openQuestionsModal(examId);
        } else if (d.errors) {
          console.error('Bulk upload errors:', d.errors);
          alert('Some rows failed:\n' + d.errors.slice(0, 20).join('\n'));
        }
      } catch (err) {
        console.error(err);
        showToast('Upload failed', false);
      }
    };
    inp.click();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  async function renderAssessmentPage() {
    root.textContent = '';
    const main = document.createElement('div'); main.id = 'assessment-main';
    const sch  = document.createElement('div'); sch.id  = 'scheduled-exams-panel';
    root.append(main,sch);
    await Promise.all([renderExamTable(), renderScheduledExams()]);
    // After rendering, attach search inputs
    attachSearchControls();
  }

  async function renderExamTable() {
    const r = await fetch(urls.listExams,{credentials:'same-origin'});
    const { exams=[] } = await r.json();
    cachedExams = exams;
    const main = document.getElementById('assessment-main');
    main.textContent = '';

    // 1. Header Row (Title, Subtitle, + Add Exam button)
    const headerRow = document.createElement('div');
    headerRow.className = 'scheduled-header-row';

    const titleGroup = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.className = 'scheduled-header-title';
    h2.textContent = 'Exams';
    const sub = document.createElement('p');
    sub.className = 'scheduled-header-subtitle';
    sub.textContent = 'Create, manage, and configure all assessment exams.';
    titleGroup.append(h2, sub);

    const addExamBtn = document.createElement('button');
    addExamBtn.type = 'button';
    addExamBtn.className = 'btn-schedule-new-exam';
    addExamBtn.id = 'addExamBtn';
    addExamBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span style="pointer-events:none;">Add Exam</span>
    `;

    headerRow.append(titleGroup, addExamBtn);
    main.appendChild(headerRow);

    // 2. Search Bar
    const searchBar = document.createElement('div');
    searchBar.className = 'scheduled-search-bar';
    searchBar.innerHTML = `
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search Exams...';
    searchInput.id = 'examSearchInput';
    searchInput.autocomplete = 'off';
    searchBar.appendChild(searchInput);
    main.appendChild(searchBar);

    // 3. Cards Container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'scheduled-cards-container';
    cardsContainer.id = 'examCardsContainer';

    if (!exams.length) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'sch-empty-state';
      emptyDiv.textContent = 'No exams found.';
      cardsContainer.appendChild(emptyDiv);
      main.appendChild(cardsContainer);
      return;
    }

    exams.forEach(exam => {
      const card = document.createElement('div');
      card.className = 'scheduled-exam-card status-border-green';
      card.dataset.examId = exam.id;
      card.dataset.title = exam.title || '';
      card.dataset.domain = exam.domain || '';
      card.dataset.domainName = exam.domain_name || '';
      card.dataset.passingMarks = exam.passing_marks ?? 0;
      card.dataset.maxMarks = exam.max_marks ?? 0;
      card.dataset.duration = exam.duration_minutes ?? 0;
      card.dataset.questionsToDisplay = exam.questions_to_display || 0;

      const qCountDisplay = (exam.questions_to_display && exam.questions_to_display > 0)
        ? `${exam.questions_to_display} / student (Pool: ${exam.question_count})`
        : `${exam.question_count} (All)`;

      card.innerHTML = `
        <div class="card-header-row">
          <div class="card-title-group">
            <div class="card-doc-icon doc-icon-green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
              </svg>
            </div>
            <div class="card-title-meta">
              <h3 class="card-exam-title">${exam.title || 'Untitled Exam'}</h3>
              <div class="card-exam-sub">${exam.domain_name || 'General'} <span class="meta-pipe">|</span> ${exam.duration_minutes || 0} min <span class="meta-bullet">•</span> Passing: ${exam.passing_marks ?? 0} / ${exam.max_marks ?? 0}</div>
            </div>
          </div>

          <div class="card-actions-group">
            <button type="button" class="sch-card-btn sch-card-btn-schedule schedule-exam" data-id="${exam.id}" title="Schedule this exam">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span style="pointer-events:none;">Schedule</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-questions view-q" data-id="${exam.id}" title="View & Manage Questions">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span style="pointer-events:none;">Questions</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-preview preview-exam" data-id="${exam.id}" title="Preview Exam Paper">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span style="pointer-events:none;">Preview</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-upload bulk-upload" data-id="${exam.id}" title="Bulk Upload Questions">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span style="pointer-events:none;">Bulk Upload</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-download download-exam" data-id="${exam.id}" title="Download Exam Paper">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span style="pointer-events:none;">Download</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-edit edit-exam" data-id="${exam.id}" title="Edit Exam">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span style="pointer-events:none;">Edit</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-delete delete-exam" data-id="${exam.id}" title="Delete Exam">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span style="pointer-events:none;">Delete</span>
            </button>
          </div>
        </div>

        <div class="card-metrics-row exam-card-metrics-row">
          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Domain</span>
              <span class="sch-metric-value">${exam.domain_name || 'General'}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Duration</span>
              <span class="sch-metric-value">${exam.duration_minutes || 0} min</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Passing Marks</span>
              <span class="sch-metric-value">${exam.passing_marks ?? 0}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Total Marks</span>
              <span class="sch-metric-value">${exam.max_marks ?? 0}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Questions</span>
              <span class="sch-metric-value">${qCountDisplay}</span>
            </div>
          </div>
        </div>
      `;

      cardsContainer.appendChild(card);
    });

    main.appendChild(cardsContainer);
  }

  async function renderScheduledExams() {
    const r = await fetch(urls.listScheduledExams,{credentials:'same-origin'});
    const { schedules=[] } = await r.json();
    const panel = document.getElementById('scheduled-exams-panel');
    panel.textContent='';

    // 1. Header Row (Title, Subtitle, + Schedule New Exam button)
    const headerRow = document.createElement('div');
    headerRow.className = 'scheduled-header-row';

    const titleGroup = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.className = 'scheduled-header-title';
    h2.textContent = 'Scheduled Exams';
    const sub = document.createElement('p');
    sub.className = 'scheduled-header-subtitle';
    sub.textContent = 'Manage and monitor all scheduled exams.';
    titleGroup.append(h2, sub);

    const scheduleNewBtn = document.createElement('button');
    scheduleNewBtn.type = 'button';
    scheduleNewBtn.className = 'btn-schedule-new-exam';
    scheduleNewBtn.id = 'scheduleNewExamBtn';
    scheduleNewBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span style="pointer-events:none;">Schedule New Exam</span>
    `;

    headerRow.append(titleGroup, scheduleNewBtn);
    panel.appendChild(headerRow);

    // 2. Search Bar
    const searchBar = document.createElement('div');
    searchBar.className = 'scheduled-search-bar';
    searchBar.innerHTML = `
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search Exams...';
    searchInput.id = 'scheduledSearchInput';
    searchInput.autocomplete = 'off';
    searchBar.appendChild(searchInput);
    panel.appendChild(searchBar);

    // 3. Cards Container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'scheduled-cards-container';
    cardsContainer.id = 'scheduledCardsContainer';

    if (!schedules.length) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'sch-empty-state';
      emptyDiv.textContent = 'No scheduled exams found.';
      cardsContainer.appendChild(emptyDiv);
      panel.appendChild(cardsContainer);
      return;
    }

    schedules.forEach(s => {
      const card = document.createElement('div');
      card.dataset.schId = s.id;

      // Status resolution
      const rawStatus = String(s.status || 'pending').toLowerCase();
      let statusTheme = 'amber';
      let statusLabel = 'Pending';
      if (rawStatus === 'started' || rawStatus === 'active' || rawStatus === 'in_progress') {
        statusTheme = 'green';
        statusLabel = 'Started';
      } else if (rawStatus === 'completed' || rawStatus === 'finished') {
        statusTheme = 'blue';
        statusLabel = 'Completed';
      }

      card.className = `scheduled-exam-card status-border-${statusTheme}`;

      // Date parsing
      const formatDT = (dtStr) => {
        if (!dtStr || dtStr === 'N/A') return { date: 'N/A', time: '' };
        const parts = dtStr.trim().split(/\s+/);
        if (parts.length >= 3) {
          return { date: parts[0], time: `${parts[1]} ${parts[2]}` };
        } else if (parts.length === 2) {
          return { date: parts[0], time: parts[1] };
        }
        return { date: dtStr, time: '' };
      };

      const startDT = formatDT(s.start_datetime);
      const endDT = formatDT(s.end_datetime);

      const qCountDisplay = s.random_question_count
        ? `${s.random_question_count} (Override)`
        : (s.questions_to_display ? `${s.questions_to_display} (From Exam)` : 'All');

      const trainersText = (s.monitor_trainers_names && s.monitor_trainers_names.length)
        ? s.monitor_trainers_names.join(', ')
        : '-';

      const tposText = (s.monitor_tpos_names && s.monitor_tpos_names.length)
        ? s.monitor_tpos_names.join(', ')
        : '-';

      card.innerHTML = `
        <div class="card-header-row">
          <div class="card-title-group">
            <div class="card-doc-icon doc-icon-${statusTheme}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
              </svg>
            </div>
            <div class="card-title-meta">
              <h3 class="card-exam-title">${s.exam_title || 'Untitled Exam'}</h3>
              <div class="card-exam-sub">${s.college_name || 'N/A'} <span class="meta-pipe">|</span> ${s.course_name || 'N/A'} <span class="meta-bullet">•</span> Sem ${s.semester ?? 'N/A'} <span class="meta-pipe">|</span> Section: ${s.section_name || 'N/A'} <span class="meta-pipe">|</span> Year: ${s.year ?? 'N/A'}</div>
            </div>
          </div>

          <div class="card-actions-group">
            <span class="status-pill-${statusTheme}">
              <span class="status-dot"></span>
              ${statusLabel}
            </span>

            <button type="button" class="sch-card-btn sch-card-btn-edit edit-schedule" data-id="${s.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span style="pointer-events:none;">Edit</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-delete delete-schedule" data-id="${s.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span style="pointer-events:none;">Delete</span>
            </button>

            <button type="button" class="sch-card-btn sch-card-btn-monitor view-submissions" data-id="${s.id}" title="Submissions / Live Monitor">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span style="pointer-events:none;">Submissions / Live Monitor</span>
            </button>
          </div>
        </div>

        <div class="card-metrics-row">
          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Start Date & Time</span>
              <span class="sch-metric-value">${startDT.date} <span class="sch-metric-subtime">${startDT.time}</span></span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">End Date & Time</span>
              <span class="sch-metric-value">${endDT.date} <span class="sch-metric-subtime">${endDT.time}</span></span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Results Released</span>
              <span class="sch-metric-value">${s.result_released ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Attendance</span>
              <span class="sch-metric-value">${s.require_attendance ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Live Monitor</span>
              <span class="sch-metric-value">${s.live_exam_monitor ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Trainer Access</span>
              <span class="sch-metric-value">${trainersText}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">TPO Access</span>
              <span class="sch-metric-value">${tposText}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Tab Switch Limit</span>
              <span class="sch-metric-value">${s.allowed_tab_switches ?? 3}</span>
            </div>
          </div>

          <div class="sch-metric-item">
            <div class="sch-metric-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
              </svg>
            </div>
            <div class="sch-metric-body">
              <span class="sch-metric-label">Questions / Student</span>
              <span class="sch-metric-value">${qCountDisplay}</span>
            </div>
          </div>
        </div>
      `;

      cardsContainer.appendChild(card);
    });

    panel.appendChild(cardsContainer);
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  document.addEventListener('click', async e=>{
    if (e.target.id==='addExamBtn' || e.target.closest('#addExamBtn')) openExamModal();
    if (e.target.closest('#scheduleNewExamBtn')) openScheduleModal();
    const editExamBtn = e.target.closest('.edit-exam');
    if (editExamBtn) openExamModal(editExamBtn.dataset.id);
    const delExamBtn = e.target.closest('.delete-exam');
    if (delExamBtn) {
      if (confirm('Delete this exam?')) await doDeleteExam(delExamBtn.dataset.id);
    }
    const schExamBtn = e.target.closest('.schedule-exam');
    if (schExamBtn) openScheduleModal(null, schExamBtn.dataset.id);
    const editSchBtn = e.target.closest('.edit-schedule');
    if (editSchBtn) openScheduleModal(editSchBtn.dataset.id, null);
    const delSchBtn = e.target.closest('.delete-schedule');
    if (delSchBtn) {
      if (confirm('Delete this scheduled exam?')) await doDeleteSchedule(delSchBtn.dataset.id);
    }
    const viewQBtn = e.target.closest('.view-q');
    if (viewQBtn) openQuestionsModal(viewQBtn.dataset.id);
    const prevExamBtn = e.target.closest('.preview-exam');
    if (prevExamBtn) openExamPreviewModal(prevExamBtn.dataset.id);

    const viewSubmissionsBtn = e.target.closest('.view-submissions');
    if (viewSubmissionsBtn) {
      openLiveMonitor(viewSubmissionsBtn.dataset.id);
    }

    const retakeBtn = e.target.closest('.allow-retake-btn');
    if (retakeBtn) {
      allowRetake(retakeBtn.dataset.id || retakeBtn.dataset.result);
    }

    const downloadBtn = e.target.closest('.download-exam');
    if (downloadBtn) {
      const id = downloadBtn.dataset.id;
      const url = urls.downloadExamPaper?.replace(placeholder, id);
      if (!url) { showToast('Download URL not configured', false); return; }
      window.location.href = url;
    }

    // 🔹 UPDATED: Bulk upload questions
    const bulkUploadBtn = e.target.closest('.bulk-upload');
    if (bulkUploadBtn) {
      const id = bulkUploadBtn.dataset.id;
      const endpoint = urls.bulkUpload?.replace(placeholder, id);
      if (!endpoint) {
        showToast('Bulk upload URL not configured', false);
        return;
      }
      showBulkUploadFormatModal(id, endpoint);
    }
  });

  async function doDeleteExam(id) {
    const url = urls.deleteExam.replace(placeholder,id);
    const r = await fetch(url,{ method:'POST',credentials:'same-origin',headers:{'X-CSRFToken':csrfToken}});
    const resp = await r.json();
    showToast(resp.message,resp.status==='success');
    if (resp.status==='success') renderAssessmentPage();
  }

  async function doDeleteSchedule(id) {
    const url = urls.deleteSchedule.replace(placeholder,id);
    const r = await fetch(url,{ method:'POST',credentials:'same-origin',headers:{'X-CSRFToken':csrfToken}});
    const resp = await r.json();
    showToast(resp.message,resp.status==='success');
    if (resp.status==='success') renderScheduledExams();
  }
// retake logic
function getSubmissionStatusMeta(status) {
    const raw = String(status || '').toLowerCase().replace(/\s+/g, '_');
    if (raw === 'active' || raw === 'in_progress') {
      return { label: 'Active', className: 'status-active' };
    }
    if (raw === 'submitted' || raw === 'retaken') {
      return { label: 'Self Submitted', className: 'status-submitted' };
    }
    if (raw === 'accidental_submit') {
      return { label: 'Auto Submitted', className: 'status-suspicious' };
    }
    if (raw === 'suspicious') {
      return { label: 'Suspicious', className: 'status-suspicious' };
    }
    if (raw === 'retake_allowed') {
      return { label: 'Retake Allowed', className: 'status-not-started' };
    }
    if (raw === 'not_started') {
      return { label: 'Not Started', className: 'status-not-started' };
    }
    return { label: 'Not Started', className: 'status-not-started' };
  }

  async function loadLiveMonitorData(scheduleId) {
    if (!urls.viewSubmissions) {
      showToast('Submissions URL not configured', false);
      return;
    }

    const endpoint = urls.viewSubmissions.replace(placeholder, scheduleId);
    const response = await fetch(endpoint, { credentials: 'same-origin' });
    const data = await response.json();

    if (data.status !== 'success') {
      showToast(data.message || 'Failed to load submissions', false);
      return;
    }

    const container = document.getElementById('liveMonitorContent');
    if (!container) return;

    const summary = data.summary || {};
    const totalStudents = data.total_students ?? summary.total ?? 0;
    const activeStudents = data.active_students ?? summary.active ?? 0;
    const submittedStudents = data.submitted_students ?? summary.submitted ?? 0;
    const notStartedStudents = data.not_started_students ?? summary.not_started ?? 0;

    const students = Array.isArray(data.students) ? data.students : [];
    const sections = Array.from(new Set(students.map(s => (s.section || '').trim()).filter(Boolean))).sort();
    const courses = Array.from(new Set(students.map(s => (s.course || '').trim()).filter(Boolean))).sort();

    const filteredStudents = students.filter(student => {
      const raw = String(student.status_key || student.status || '').toLowerCase().replace(/\s+/g, '_');
      if (liveMonitorFilter === 'all') return true;
      if (liveMonitorFilter === 'submitted') return raw === 'submitted' || raw === 'accidental_submit' || raw === 'retaken';
      if (liveMonitorFilter === 'active') return raw === 'active' || raw === 'in_progress';
      if (liveMonitorFilter === 'not_started') return raw === 'not_started';
      if (liveMonitorFilter === 'retake') return raw === 'retake_allowed';
      return true;
    }).filter(student => {
      const section = String(student.section || '').trim();
      const course = String(student.course || '').trim();
      const searchBlob = `${student.usn || ''} ${student.name || ''}`.toLowerCase();

      if (liveSectionFilter && section !== liveSectionFilter) return false;
      if (liveCourseFilter && course !== liveCourseFilter) return false;
      if (liveSearchText && !searchBlob.includes(liveSearchText)) return false;
      return true;
    });

    const rows = filteredStudents.map(student => {
      const statusMeta = getSubmissionStatusMeta(student.status_key || student.status);
      const rawStatus = String(student.status_key || student.status || '').toLowerCase().replace(/\s+/g, '_');
      const tabSwitchCount = student.tab_switch_count ?? student.tab_switches ?? 0;
      const rowClass = rawStatus.replace(/\s+/g, '-');
      const totalQuestions = Number(student.total_questions || 0);
      const currentQuestion = Number(student.current_question || 0);
      const progressDisplay = currentQuestion > 0 && totalQuestions > 0
        ? `Q ${currentQuestion} / ${totalQuestions}`
        : '-';
      const timeSpentMap = student.time_spent && typeof student.time_spent === 'object' ? student.time_spent : {};
      const timeSpentEntries = Object.entries(timeSpentMap);
      const timeSpentDisplay = timeSpentEntries.length
        ? `<div class="time-spent-scroll">${timeSpentEntries.map(([q, sec]) => `Q${q}: ${sec}s`).join('<br>')}</div>`
        : '-';
      const riskScore = Number(student.risk_score || 0);

      let actionHtml = '-';
      if (student.result_id) {
        let retakeBtn = '';
        if (rawStatus === 'submitted' || rawStatus === 'accidental_submit' || rawStatus === 'retaken') {
          retakeBtn = `<button class="action-btn allow-retake-btn" data-result-id="${student.result_id}" style="margin-bottom: 4px;">Allow Retake</button>`;
        } else if (rawStatus === 'retake_allowed') {
          retakeBtn = '<span style="color: #666; font-size: 0.9em; display: block; margin-bottom: 4px;">Retake Allowed</span>';
        }
        
        actionHtml = `
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: stretch;">
            ${retakeBtn}
            <button class="action-btn remove-attempt-btn" style="background-color: #dc3545; border-color: #dc3545; color: white;" data-result-id="${student.result_id}">Remove Attempt</button>
          </div>
        `;
      }

      const devType = student.device_type || '-';
      const devOS = student.os_name || '-';
      const devBrowser = student.browser_name || '-';
      const devIP = student.ip_address || '-';
      const devLabel = devOS && devOS !== '-' && devOS !== 'Unknown OS' ? `${devOS} • ${devBrowser}`.replace(/\s*•\s*Unknown Browser$/, '').replace(/\s*•\s*-$/, '') : devType;
      const devTooltip = `Device: ${devType}\nOS: ${devOS}\nBrowser: ${devBrowser}\nIP: ${devIP}`;
      const deviceHtml = `<span style="font-size: 0.8rem; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0; display: inline-block; white-space: nowrap;" title="${devTooltip}">${devLabel}</span>`;

      return `
        <tr class="student-row ${rowClass}" data-section="${student.section || ''}" data-course="${student.course || ''}">
          <td>${student.usn}</td>
          <td>${student.name || '-'}</td>
          <td><span class="${statusMeta.className}">${statusMeta.label}</span></td>
          <td>${deviceHtml}</td>
          <td>${progressDisplay}</td>
          <td class="${student.tab_limit_crossed ? 'risk-alert' : ''}">${tabSwitchCount}</td>
          <td>${timeSpentDisplay}</td>
          <td class="${riskScore > 60 ? 'risk-high' : ''}">${riskScore}%</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');

    const liveBadge = `
      <div class="live-status-bar">
        <span class="live-dot"></span>
        Live Monitoring Active
      </div>
    `;

    container.innerHTML = `
      <!-- Exam Details Block -->
      <div class="exam-details-header" style="background: rgba(0, 0, 0, 0.03); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.08);">
        <h4 style="margin: 0 0 10px 0; color: #28556f; font-size: 1.1rem;"><i class="fas fa-file-alt"></i> Exam Details</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.9em;">
          <div><strong>Exam Title:</strong> ${data.exam_title || '-'}</div>
          <div><strong>Course:</strong> ${data.course_name || '-'}</div>
          <div><strong>Section:</strong> ${data.section_name || '-'}</div>
          <div><strong>Allowed Tab Switches:</strong> ${data.allowed_tab_switches ?? 3}</div>
        </div>
      </div>

      <div class="monitor-summary">
        <div>Total: ${totalStudents}</div>
        <div>Active: ${activeStudents}</div>
        <div>Submitted: ${submittedStudents}</div>
        <div>Not Started: ${notStartedStudents}</div>
      </div>

      ${liveBadge}

      <div class="monitor-filters">
        <select id="sectionFilter" class="monitor-select">
          <option value="">All Sections</option>
          ${sections.map(section => `<option value="${section}" ${liveSectionFilter === section ? 'selected' : ''}>${section}</option>`).join('')}
        </select>

        <select id="courseFilter" class="monitor-select">
          <option value="">All Courses</option>
          ${courses.map(course => `<option value="${course}" ${liveCourseFilter === course ? 'selected' : ''}>${course}</option>`).join('')}
        </select>

        <input type="search" id="studentSearch" placeholder="Search by USN / Name" class="search-input" value="${liveSearchText}">
      </div>

      <div class="monitor-filters">
        <button class="monitor-filter-btn ${liveMonitorFilter === 'all' ? 'active' : ''}" data-filter="all" type="button">All</button>
        <button class="monitor-filter-btn ${liveMonitorFilter === 'submitted' ? 'active' : ''}" data-filter="submitted" type="button">Submitted</button>
        <button class="monitor-filter-btn ${liveMonitorFilter === 'active' ? 'active' : ''}" data-filter="active" type="button">Active</button>
        <button class="monitor-filter-btn ${liveMonitorFilter === 'not_started' ? 'active' : ''}" data-filter="not_started" type="button">Not Started</button>
        <button class="monitor-filter-btn ${liveMonitorFilter === 'retake' ? 'active' : ''}" data-filter="retake" type="button">Retake</button>
      </div>

      <!-- Manual Refresh Button -->
      <div class="refresh-status" style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
        <button id="refreshLiveBtn" class="action-btn" type="button" style="padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-sync-alt"></i> Refresh Data</button>
      </div>

      <div class="exam-table-wrapper">
        <table class="exam-table">
          <thead>
            <tr>
              <th>USN</th>
              <th>Name</th>
              <th>Status</th>
              <th>Device / OS</th>
              <th>Current Question</th>
              <th>Tab Switch</th>
              <th>Time Spent</th>
              <th>Risk Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    const sectionFilter = container.querySelector('#sectionFilter');
    if (sectionFilter) {
      sectionFilter.addEventListener('change', () => {
        liveSectionFilter = sectionFilter.value || '';
        loadLiveMonitorData(scheduleId);
      });
    }

    const courseFilter = container.querySelector('#courseFilter');
    if (courseFilter) {
      courseFilter.addEventListener('change', () => {
        liveCourseFilter = courseFilter.value || '';
        loadLiveMonitorData(scheduleId);
      });
    }

    const studentSearch = container.querySelector('#studentSearch');
    if (studentSearch) {
      studentSearch.addEventListener('input', () => {
        liveSearchText = (studentSearch.value || '').toLowerCase().trim();
        loadLiveMonitorData(scheduleId);
      });
    }

    container.querySelectorAll('.monitor-filter-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const nextFilter = this.dataset.filter || 'all';
        if (liveMonitorFilter === nextFilter) return;
        liveMonitorFilter = nextFilter;
        loadLiveMonitorData(scheduleId);
      });
    });

    const refreshLiveBtn = container.querySelector('#refreshLiveBtn');
    if (refreshLiveBtn) {
      refreshLiveBtn.addEventListener('click', () => {
        loadLiveMonitorData(scheduleId);
      });
    }

    container.querySelectorAll('.allow-retake-btn').forEach(btn => {
      btn.addEventListener('click', async function () {
        const resultId = this.dataset.resultId;
        if (!resultId) return;
        await allowRetake(resultId);
      });
    });

    container.querySelectorAll('.remove-attempt-btn').forEach(btn => {
      btn.addEventListener('click', async function () {
        const resultId = this.dataset.resultId;
        if (!resultId) return;
        await removeAttempt(resultId);
      });
    });
  }

  async function openLiveMonitor(scheduleId) {
    currentScheduleId = scheduleId;
    liveMonitorFilter = 'all';
    liveSectionFilter = '';
    liveCourseFilter = '';
    liveSearchText = '';

    if (liveMonitorInterval) {
      clearInterval(liveMonitorInterval);
      liveMonitorInterval = null;
    }

    const root = document.getElementById('assessment-root');
    root.innerHTML = `
      <div id="live-monitor-page" class="live-monitor-page">
        <div class="page-header">
          <button id="backToAssessment" class="action-btn" type="button">← Back</button>
          <h2>Live Exam Monitor</h2>
          <button id="downloadLiveReportBtn" class="action-btn" type="button">Download Report</button>
        </div>

        <div id="liveMonitorContent">Loading monitor...</div>
      </div>
    `;

    document.getElementById('backToAssessment').onclick = () => {
      if (liveMonitorInterval) {
        clearInterval(liveMonitorInterval);
        liveMonitorInterval = null;
      }
      renderAssessmentPage();
    };

    const reportBtn = document.getElementById('downloadLiveReportBtn');
    if (reportBtn) {
      reportBtn.onclick = () => {
        window.location.href = `/exam/admin/live-report/${scheduleId}/`;
      };
    }

    await loadLiveMonitorData(scheduleId);
  }

  async function openSubmissionsModal(scheduleId) {
    return openLiveMonitor(scheduleId);
  }

  async function allowRetake(resultId) {
    if (!confirm('Allow this student to retake the exam?')) return;

    if (!urls.allowRetake) {
      showToast('Retake URL not configured', false);
      return;
    }
    const endpoint = urls.allowRetake.replace('/1/', `/${resultId}/`);

    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken
      },
      body: JSON.stringify({})
    });

    const data = await response.json();

    showToast(
      data.message,
      data.status === 'success'
    );

    if (data.status === 'success' && currentScheduleId) {
      loadLiveMonitorData(currentScheduleId);
    }
  }

  async function removeAttempt(resultId) {
    if (!confirm('Are you sure you want to remove/reset this student\'s attempt? This will delete their exam progress and result completely, allowing them to take the exam again.')) return;

    if (!urls.removeAttempt) {
      showToast('Remove attempt URL not configured', false);
      return;
    }
    const endpoint = urls.removeAttempt.replace('/1/', `/${resultId}/`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        }
      });
      const resp = await response.json();
      showToast(resp.message, resp.status === 'success');
      if (resp.status === 'success' && currentScheduleId) {
        loadLiveMonitorData(currentScheduleId);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to remove attempt', false);
    }
  }
  // ─── Exam Modal ────────────────────────────────────────────────────────────
  function openExamModal(id=null) {
    const modalId='exam-modal';
    closeModal(modalId);
    const cont=document.createElement('div');
    const x=document.createElement('button');
    x.className='close-modal'; x.type='button'; x.textContent='×'; x.onclick=()=>closeModal(modalId);
    cont.appendChild(x);

    const h3=document.createElement('h3');
    h3.textContent = id ? 'Edit Exam' : 'Add Exam';
    cont.appendChild(h3);

    const form=document.createElement('form');
    form.id='examForm'; form.autocomplete='off';

    const fields=[
      {label:'Title',type:'text',id:'examTitle',name:'title'},
      {label:'Domain',type:'select',id:'examDomain',name:'domain',options:(DROPDOWNS.domains||[]).map(d=>({v:d.id,t:d.domain_name}))},
      {label:'Passing Marks',type:'number',id:'examPassingMarks',name:'passing_marks'},
      {label:'Max Marks',    type:'number',id:'examMaxMarks',name:'max_marks'},
      {label:'Duration (min)',type:'number',id:'examDuration',name:'duration_minutes'},
      {label:'Questions per Student (0 = all)',type:'number',id:'examQuestionsToDisplay',name:'questions_to_display',min:0,placeholder:'0 for all questions in pool'},
    ];

    fields.forEach(f=>{
      const lab=document.createElement('label'); lab.textContent=f.label; form.appendChild(lab);
      if(f.type==='select'){
        const sel=document.createElement('select');
        sel.id=f.id; sel.name=f.name; sel.required=true;
        sel.appendChild(Object.assign(document.createElement('option'),{value:'',textContent:`Select ${f.label}`}));
        (f.options||[]).forEach(o=>{
          const op=document.createElement('option'); op.value=o.v; op.textContent=o.t; sel.appendChild(op);
        });
        form.appendChild(sel);
      } else {
        const inp=document.createElement('input');
        inp.type=f.type; inp.id=f.id; inp.name=f.name; inp.required=true;
        if(f.type==='number') inp.min=0;
        form.appendChild(inp);
      }
    });
    const sub=document.createElement('button');
    sub.type='submit'; sub.className='add-btn'; sub.textContent=id?'Update':'Add';
    form.appendChild(sub);

    cont.appendChild(form);
    createModal(modalId,cont);
    openModal(modalId);

    if(id){
      const examObj = (cachedExams || []).find(e => String(e.id) === String(id));
      const card = root.querySelector(`[data-exam-id="${id}"]`);
      if (examObj) {
        form.examTitle.value = examObj.title || '';
        if (examObj.domain) {
          form.examDomain.value = examObj.domain;
        } else if (examObj.domain_name) {
          const matchOption = Array.from(form.examDomain.options).find(o => o.textContent === examObj.domain_name);
          form.examDomain.value = matchOption ? matchOption.value : '';
        }
        form.examPassingMarks.value = examObj.passing_marks ?? 0;
        form.examMaxMarks.value = examObj.max_marks ?? 0;
        form.examDuration.value = examObj.duration_minutes ?? 0;
        form.examQuestionsToDisplay.value = examObj.questions_to_display ?? 0;
      } else if (card) {
        form.examTitle.value = card.dataset.title || '';
        form.examDomain.value = card.dataset.domain || '';
        form.examPassingMarks.value = card.dataset.passingMarks || 0;
        form.examMaxMarks.value = card.dataset.maxMarks || 0;
        form.examDuration.value = card.dataset.duration || 0;
        form.examQuestionsToDisplay.value = card.dataset.questionsToDisplay || 0;
      }
    }

    form.onsubmit=async ev=>{
      ev.preventDefault();
      const p={
        title:form.examTitle.value,
        domain:form.examDomain.value,
        passing_marks:Number(form.examPassingMarks.value),
        max_marks:Number(form.examMaxMarks.value),
        duration_minutes:Number(form.examDuration.value),
        questions_to_display:Number(form.examQuestionsToDisplay.value || 0),
      };
      const endpoint = id
        ? urls.updateExam.replace(placeholder,id)
        : urls.addExam;
      const r=await fetch(endpoint,{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},
        body:JSON.stringify(p)
      });
      const resp = await r.json();
      showToast(resp.message,resp.status==='success');
      if(resp.status==='success'){ closeModal(modalId); renderAssessmentPage(); }
    };
  }

  // ─── Schedule Modal ────────────────────────────────────────────────────────
  async function openScheduleModal(sid=null, ex=null) {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  OPENING SCHEDULE MODAL - v2.0       ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('Schedule ID (for edit):', sid);
    console.log('Exam ID (for new schedule):', ex);
    console.log('URLs available:', urls);
    console.log('CSRF Token:', csrfToken ? 'Present' : 'MISSING!');
    
    if (!ex && !sid) {
      if (!cachedExams || !cachedExams.length) {
        try {
          const r = await fetch(urls.listExams, { credentials: 'same-origin' });
          const d = await r.json();
          cachedExams = d.exams || [];
        } catch (err) {
          console.error('Failed to load exams list:', err);
        }
      }
      if (!cachedExams || !cachedExams.length) {
        showToast('No exams available to schedule. Please create an exam first.', false);
        return;
      }
    }
    
    const modalId='schedule-modal';
    closeModal(modalId);
    const cont=document.createElement('div');
    const x=document.createElement('button');
    x.className='close-modal'; x.type='button'; x.textContent='×'; x.onclick=()=>closeModal(modalId);
    cont.appendChild(x);
    const h3=document.createElement('h3');
    h3.textContent=sid?'Edit Exam Schedule':'Schedule Exam';
    cont.appendChild(h3);

    const form=document.createElement('form');
    form.id='scheduleForm'; form.autocomplete='off';
    form.classList.add('schedule-form');

    const grid = document.createElement('div');
    grid.className = 'schedule-grid';
    form.appendChild(grid);

    function makeFieldWrap(labelText, full = false) {
      const wrap = document.createElement('div');
      wrap.className = full ? 'schedule-field full' : 'schedule-field';
      const label = document.createElement('label');
      label.className = 'schedule-label';
      label.textContent = labelText;
      wrap.appendChild(label);
      return wrap;
    }

    function addSelectField(field, includePlaceholder = true) {
      const wrap = makeFieldWrap(field.label);
      const sel = document.createElement('select');
      sel.id = field.id;
      sel.name = field.name;
      sel.required = true;
      if (includePlaceholder) {
        sel.appendChild(Object.assign(document.createElement('option'), {
          value: '',
          textContent: `Select ${field.label}`
        }));
      }
      (field.options || []).forEach(o => {
        const op = document.createElement('option');
        op.value = o.v;
        op.textContent = o.t;
        sel.appendChild(op);
      });
      wrap.appendChild(sel);
      grid.appendChild(wrap);
      return sel;
    }

    function addInputField(field) {
      const wrap = makeFieldWrap(field.label);
      const inp = document.createElement('input');
      inp.type = field.type;
      inp.id = field.id;
      inp.name = field.name;
      inp.required = field.required !== false;
      if (field.placeholder) inp.placeholder = field.placeholder;
      if (field.value !== undefined && field.value !== null) inp.value = field.value;
      if (field.readonly) inp.readOnly = true;
      if (field.min !== undefined) inp.min = field.min;
      else if (field.type === 'number') inp.min = 1;
      wrap.appendChild(inp);
      grid.appendChild(wrap);
      return inp;
    }

    function addMultiSelectCheckboxField(field) {
      const wrap = makeFieldWrap(field.label, true);
      
      // Create dropdown container
      const dropdownContainer = document.createElement('div');
      dropdownContainer.className = 'dropdown-multi-select';
      dropdownContainer.style.position = 'relative';
      
      // Create dropdown button/header
      const dropdownButton = document.createElement('button');
      dropdownButton.type = 'button';
      dropdownButton.className = 'dropdown-button';
      dropdownButton.style.width = '100%';
      dropdownButton.style.padding = '10px 12px';
      dropdownButton.style.paddingRight = '32px';
      dropdownButton.style.border = '1px solid var(--table-border)';
      dropdownButton.style.borderRadius = '8px';
      dropdownButton.style.background = 'var(--card-bg)';
      dropdownButton.style.textAlign = 'left';
      dropdownButton.style.cursor = 'pointer';
      dropdownButton.style.transition = 'all 0.2s ease';
      dropdownButton.style.fontSize = '14px';
      dropdownButton.textContent = `Select ${field.label}`;
      
      // Create dropdown content (hidden by default)
      const dropdownContent = document.createElement('div');
      dropdownContent.id = field.id;
      dropdownContent.className = 'dropdown-content';
      dropdownContent.style.position = 'absolute';
      dropdownContent.style.top = '100%';
      dropdownContent.style.left = '0';
      dropdownContent.style.right = '0';
      dropdownContent.style.display = 'none';
      dropdownContent.style.background = 'var(--card-bg)';
      dropdownContent.style.border = '1px solid var(--table-border)';
      dropdownContent.style.borderRadius = '0 0 8px 8px';
      dropdownContent.style.borderTop = 'none';
      dropdownContent.style.marginTop = '0';
      dropdownContent.style.padding = '0';
      dropdownContent.style.zIndex = '1000';
      dropdownContent.style.maxHeight = '450px';
      dropdownContent.style.overflowY = 'auto';
      dropdownContent.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
      
      // Create search box for large lists
      const searchBox = document.createElement('input');
      searchBox.type = 'text';
      searchBox.placeholder = `Search ${field.label}...`;
      searchBox.style.width = '100%';
      searchBox.style.padding = '10px 12px';
      searchBox.style.border = 'none';
      searchBox.style.borderBottom = '1px solid var(--table-border)';
      searchBox.style.borderRadius = '0';
      searchBox.style.fontSize = '13px';
      searchBox.style.boxSizing = 'border-box';
      searchBox.style.background = 'rgba(0, 128, 55, 0.02)';
      dropdownContent.appendChild(searchBox);
      
      // Create wrapper for checkboxes with better padding
      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.style.padding = '12px';
      
      // Create checkbox grid inside dropdown (adaptive columns)
      const checkboxGrid = document.createElement('div');
      checkboxGrid.className = 'checkbox-grid-large';
      checkboxGrid.style.display = 'grid';
      checkboxGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
      checkboxGrid.style.gap = '8px';
      checkboxGrid.style.alignItems = 'start';
      
      let checkboxes = [];
      const allLabels = [];
      
      (field.options || []).forEach(opt => {
        const label = document.createElement('label');
        label.className = 'checkbox-option';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.cursor = 'pointer';
        label.style.padding = '8px';
        label.style.margin = '0';
        label.style.borderRadius = '6px';
        label.style.transition = 'all 0.2s ease';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.setAttribute('data-search', opt.t.toLowerCase());
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = opt.v;
        checkbox.className = `${field.id}-checkbox`;
        checkbox.style.cursor = 'pointer';
        checkbox.style.accentColor = '#008037';
        checkbox.style.flex = '0 0 16px';
        checkbox.style.minWidth = '16px';
        checkboxes.push(checkbox);
        
        const span = document.createElement('span');
        span.textContent = opt.t;
        span.style.flex = '1';
        span.style.fontSize = '13px';
        span.style.whiteSpace = 'nowrap';
        span.style.overflow = 'hidden';
        span.style.textOverflow = 'ellipsis';
        span.title = opt.t;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        checkboxGrid.appendChild(label);
        allLabels.push(label);
        
        // Update button text when checkbox changes
        checkbox.addEventListener('change', () => {
          const selected = checkboxes.filter(cb => cb.checked);
          if (selected.length === 0) {
            dropdownButton.textContent = `Select ${field.label}`;
          } else if (selected.length === 1) {
            const selectedLabel = selected[0].closest('label');
            const selectedText = selectedLabel ? selectedLabel.querySelector('span').textContent : selected[0].value;
            dropdownButton.textContent = selectedText;
          } else {
            dropdownButton.textContent = `${selected.length} selected`;
          }
        });
        
        label.addEventListener('mouseover', () => {
          label.style.background = 'rgba(0, 128, 55, 0.08)';
          label.style.boxShadow = '0 2px 6px rgba(0, 128, 55, 0.1)';
        });
        
        label.addEventListener('mouseout', () => {
          label.style.background = 'transparent';
          label.style.boxShadow = 'none';
        });
      });
      
      // Search functionality
      searchBox.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        allLabels.forEach(label => {
          const matches = !searchTerm || label.getAttribute('data-search').includes(searchTerm);
          label.style.display = matches ? 'flex' : 'none';
        });
      });
      
      checkboxWrapper.appendChild(checkboxGrid);
      dropdownContent.appendChild(checkboxWrapper);
      dropdownContainer.appendChild(dropdownButton);
      dropdownContainer.appendChild(dropdownContent);
      
      // Toggle dropdown on button click
      dropdownButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdownContent.style.display === 'block';
        dropdownContent.style.display = isOpen ? 'none' : 'block';
        dropdownButton.classList.toggle('open', !isOpen);
        if (!isOpen) {
          searchBox.focus();
          dropdownButton.style.borderColor = '#008037';
          dropdownButton.style.background = 'rgba(0, 128, 55, 0.04)';
          dropdownButton.style.borderBottomLeftRadius = '0';
          dropdownButton.style.borderBottomRightRadius = '0';
        } else {
          searchBox.value = '';
          allLabels.forEach(label => { label.style.display = 'flex'; });
          dropdownButton.style.borderColor = 'var(--table-border)';
          dropdownButton.style.background = 'var(--card-bg)';
          dropdownButton.style.borderRadius = '8px';
        }
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!dropdownContainer.contains(e.target)) {
          if (dropdownContent.style.display === 'block') {
            dropdownContent.style.display = 'none';
            dropdownButton.classList.remove('open');
            searchBox.value = '';
            allLabels.forEach(label => { label.style.display = 'flex'; });
            dropdownButton.style.borderColor = 'var(--table-border)';
            dropdownButton.style.background = 'var(--card-bg)';
            dropdownButton.style.borderRadius = '8px';
          }
        }
      });
      
      wrap.appendChild(dropdownContainer);
      grid.appendChild(wrap);
      return dropdownContent;
    }

    if (ex || sid) {
      addInputField({label:'Exam ID',type:'text',id:'scheduleExam',name:'scheduleExam',value:ex||'',readonly:!!ex});
    } else {
      addSelectField({
        label: 'Select Exam',
        id: 'scheduleExam',
        name: 'scheduleExam',
        options: (cachedExams || []).map(x => ({ v: x.id, t: `${x.title} (${x.domain_name || 'General'})` }))
      });
    }
    addMultiSelectCheckboxField({id:'scheduleCollege',label:'Colleges',options:(DROPDOWNS.colleges||[]).map(c=>({v:c.id,t:c.name}))});
    addMultiSelectCheckboxField({id:'scheduleCourse',label:'Courses',options:(DROPDOWNS.courses||[]).map(c=>({v:c.id,t:c.name}))});
    addMultiSelectCheckboxField({id:'scheduleSemester',label:'Semesters',options:Array.from({length:12},(_, i)=>({v:i+1,t:`Semester ${i+1}`}))});
    addMultiSelectCheckboxField({id:'scheduleYear',label:'Years',options:Array.from({length:5},(_, i)=>({v:i+1,t:`Year ${i+1}`}))});
    addInputField({label:'Start',type:'datetime-local',id:'scheduleStart',name:'start_datetime'});
    addInputField({label:'End',type:'datetime-local',id:'scheduleEnd',name:'end_datetime'});
    addSelectField({label:'Status',id:'scheduleStatus',name:'status',options:[
      {v:'pending',t:'Pending'},{v:'started',t:'Started'},{v:'completed',t:'Completed'}
    ]});
    addInputField({label:'Allowed Tab Switches',type:'number',id:'scheduleTabSwitchLimit',name:'allowed_tab_switches',value:3});
    addInputField({label:'Questions / Student (Override)',type:'number',id:'scheduleRandomQuestionCount',name:'random_question_count',value:'',required:false,placeholder:'Leave blank for exam default',min:1});

    const sectionWrap = makeFieldWrap('Sections', true);
    const sectionBox = document.createElement('div');
    sectionBox.id = 'scheduleSection';
    sectionBox.className = 'section-checkbox-group';

    const allLabel = document.createElement('label');
    allLabel.className = 'section-chip all';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.id = 'scheduleSectionAll';
    allInput.checked = true;
    const allText = document.createElement('span');
    allText.textContent = 'All Sections';
    allLabel.append(allInput, allText);
    sectionBox.appendChild(allLabel);

    (DROPDOWNS.sections || []).forEach(s => {
      const chip = document.createElement('label');
      chip.className = 'section-chip';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'section-checkbox';
      cb.value = s.name;
      const txt = document.createElement('span');
      txt.textContent = s.name;
      chip.append(cb, txt);
      sectionBox.appendChild(chip);

      cb.addEventListener('change', () => {
        if (cb.checked) allInput.checked = false;
        const anyChecked = Array.from(sectionBox.querySelectorAll('.section-checkbox')).some(x => x.checked);
        if (!anyChecked) allInput.checked = true;
      });
    });

    allInput.addEventListener('change', () => {
      if (!allInput.checked) return;
      sectionBox.querySelectorAll('.section-checkbox').forEach(x => { x.checked = false; });
    });

    sectionWrap.appendChild(sectionBox);
    grid.appendChild(sectionWrap);

    function addToggleField(id, labelText, hintText) {
      const wrap = makeFieldWrap(labelText, true);
      const row = document.createElement('div');
      row.className = 'toggle-row';
      const hint = document.createElement('span');
      hint.className = 'toggle-hint';
      hint.textContent = hintText;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'switch';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.id = id;
      const slider = document.createElement('span');
      slider.className = 'slider';
      toggleLabel.append(toggle, slider);

      row.append(hint, toggleLabel);
      wrap.appendChild(row);
      grid.appendChild(wrap);
      return toggle;
    }

    function addMultiSelectField(field, labelText) {
      const wrap = makeFieldWrap(labelText, true);
      const container = document.createElement('div');
      container.className = 'multi-select-container';
      container.id = field.id;
      
      (field.options || []).forEach(opt => {
        const label = document.createElement('label');
        label.className = 'multi-select-option';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '10px';
        label.style.padding = '10px 12px';
        label.style.borderRadius = '10px';
        label.style.background = 'var(--card-bg)';
        label.style.border = '1px solid var(--table-border)';
        label.style.transition = 'all 0.2s ease';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.cursor = 'pointer';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = opt.v;
        checkbox.className = `${field.id}-checkbox`;
        checkbox.style.flex = '0 0 auto';
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.minWidth = '16px';
        
        const span = document.createElement('span');
        span.textContent = opt.t;
        span.style.flex = '1 1 auto';
        span.style.minWidth = '0';
        span.style.overflow = 'hidden';
        span.style.textOverflow = 'ellipsis';
        span.style.whiteSpace = 'nowrap';
        
        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
      });
      
      wrap.appendChild(container);
      grid.appendChild(wrap);
      return { wrap, container };
    }

    addToggleField('scheduleResultReleaseToggle', 'Release Results?', 'Turn on to show results immediately to students.');
    addToggleField('scheduleRequireAttendanceToggle', 'Require Attendance?', 'Turn on to allow attempts only for present students.');
    const liveMonitorToggle = addToggleField('scheduleLiveExamMonitorToggle', 'Live Exam Monitor?', 'Turn on to enable live monitoring for trainers and TPO.');

    const trainerField = addMultiSelectField({
      id: 'scheduleTrainers',
      label: 'Select Trainers',
      options: (DROPDOWNS.trainers || []).map(t => ({
        v: t.user_id,
        t: t.display_name || [t.user__first_name, t.user__last_name].filter(Boolean).join(' ').trim() || `Trainer ${t.user_id}`
      }))
    }, 'Select Trainers');

    const tpoField = addMultiSelectField({
      id: 'scheduleTpos',
      label: 'Select TPOs',
      options: (DROPDOWNS.tpos || []).map(t => ({
        v: t.user_id,
        t: t.display_name || [t.user__first_name, t.user__last_name].filter(Boolean).join(' ').trim() || `TPO ${t.user_id}`
      }))
    }, 'Select TPOs');

    function syncLiveMonitorAccessVisibility() {
      const liveEnabled = !!(liveMonitorToggle && liveMonitorToggle.checked);
      trainerField.wrap.style.display = liveEnabled ? '' : 'none';
      tpoField.wrap.style.display = liveEnabled ? '' : 'none';

      trainerField.container
        .querySelectorAll('input[type="checkbox"]')
        .forEach(cb => {
          cb.disabled = !liveEnabled;
        });
      tpoField.container
        .querySelectorAll('input[type="checkbox"]')
        .forEach(cb => {
          cb.disabled = !liveEnabled;
        });
    }

    if (liveMonitorToggle) {
      liveMonitorToggle.addEventListener('change', syncLiveMonitorAccessVisibility);
    }
    syncLiveMonitorAccessVisibility();

    const sub=document.createElement('button');
    sub.type='submit'; sub.className='add-btn'; sub.textContent=sid?'Update':'Schedule';
    form.appendChild(sub);
    cont.appendChild(form);

    createModal(modalId,cont);
    openModal(modalId);

    if(sid){
      fetch(urls.listScheduledExams,{credentials:'same-origin'})
        .then(r=>r.json())
        .then(({schedules=[]})=>{
          const s=schedules.find(x=>x.id===sid);
          if(!s) return;
          form.scheduleExam.value    = s.exam_id;
          
          // Set college checkbox
          form.querySelectorAll('.scheduleCollege-checkbox').forEach(cb => {
            cb.checked = cb.value === s.college_id;
          });
          
          // Set course checkbox
          form.querySelectorAll('.scheduleCourse-checkbox').forEach(cb => {
            cb.checked = cb.value === s.course_id;
          });
          
          // Set semester checkbox
          form.querySelectorAll('.scheduleSemester-checkbox').forEach(cb => {
            cb.checked = cb.value == s.semester;
          });
          
          // Set year checkbox
          form.querySelectorAll('.scheduleYear-checkbox').forEach(cb => {
            cb.checked = cb.value == s.year;
          });
          
          const selectedSections = (s.section_id || '')
            .split(',')
            .map(x => x.trim())
            .filter(Boolean);
          const allSel = document.getElementById('scheduleSectionAll');
          const sectionChecks = Array.from(form.querySelectorAll('.section-checkbox'));
          if (selectedSections.length === 0) {
            allSel.checked = true;
            sectionChecks.forEach(cb => { cb.checked = false; });
          } else {
            allSel.checked = false;
            sectionChecks.forEach(cb => { cb.checked = selectedSections.includes(cb.value); });
          }
          const startIso = s.start_datetime_iso || '';
          const endIso = s.end_datetime_iso || '';
          form.scheduleStart.value = startIso ? startIso.slice(0, 16) : '';
          form.scheduleEnd.value = endIso ? endIso.slice(0, 16) : '';
          form.scheduleStatus.value  = s.status;
          form.scheduleResultReleaseToggle.checked = !!s.result_released;
          form.scheduleRequireAttendanceToggle.checked = !!s.require_attendance;
          form.scheduleLiveExamMonitorToggle.checked = !!s.live_exam_monitor;
          form.scheduleTabSwitchLimit.value = s.allowed_tab_switches ?? 3;
          if (form.scheduleRandomQuestionCount) {
            form.scheduleRandomQuestionCount.value = s.random_question_count || '';
          }
          
          // Set trainer selections
          const selectedTrainers = s.monitor_trainers || [];
          form.querySelectorAll('.scheduleTrainers-checkbox').forEach(cb => {
            cb.checked = selectedTrainers.includes(Number(cb.value));
          });
          
          // Set TPO selections
          const selectedTpos = s.monitor_tpos || [];
          form.querySelectorAll('.scheduleTpos-checkbox').forEach(cb => {
            cb.checked = selectedTpos.includes(Number(cb.value));
          });

          syncLiveMonitorAccessVisibility();
        });
    }

    form.onsubmit=async ev=>{
      ev.preventDefault();
      
      console.log('╔═══════════════════════════════════════╗');
      console.log('║  FORM SUBMISSION STARTED - v2.0      ║');
      console.log('╚═══════════════════════════════════════╝');
      
      console.log('📝 Form Object:', form);
      console.log('📝 Form.scheduleExam element:', form.scheduleExam);
      console.log('📝 Form.scheduleExam.value:', form.scheduleExam ? form.scheduleExam.value : 'UNDEFINED!');
      
      console.log('\nCHART All Form Values:');
      console.log('  College:', form.scheduleCollege ? form.scheduleCollege.value : 'UNDEFINED');
      console.log('  Course:', form.scheduleCourse ? form.scheduleCourse.value : 'UNDEFINED');
      console.log('  Semester:', form.scheduleSemester ? form.scheduleSemester.value : 'UNDEFINED');
      console.log('  Year:', form.scheduleYear ? form.scheduleYear.value : 'UNDEFINED');
      console.log("Section element:", form.querySelector('#scheduleSection'));
      console.log('  Start:', form.scheduleStart ? form.scheduleStart.value : 'UNDEFINED');
      console.log('  End:', form.scheduleEnd ? form.scheduleEnd.value : 'UNDEFINED');
      console.log('  Status:', form.scheduleStatus ? form.scheduleStatus.value : 'UNDEFINED');
      console.log('  Exam ID:', form.scheduleExam ? form.scheduleExam.value : 'UNDEFINED');
      
      // Validate all required fields
      const collegeChecked = Array.from(form.querySelectorAll('.scheduleCollege-checkbox:checked'));
      const courseChecked = Array.from(form.querySelectorAll('.scheduleCourse-checkbox:checked'));
      const semesterChecked = Array.from(form.querySelectorAll('.scheduleSemester-checkbox:checked'));
      const yearChecked = Array.from(form.querySelectorAll('.scheduleYear-checkbox:checked'));
      
      const missingFields = [];
      if(collegeChecked.length === 0) missingFields.push('College');
      if(courseChecked.length === 0) missingFields.push('Course');
      if(semesterChecked.length === 0) missingFields.push('Semester');
      if(yearChecked.length === 0) missingFields.push('Year');
      if(!form.scheduleStart || !form.scheduleStart.value) missingFields.push('Start Time');
      if(!form.scheduleEnd || !form.scheduleEnd.value) missingFields.push('End Time');
      if(!form.scheduleStatus || !form.scheduleStatus.value) missingFields.push('Status');
          if(!form.scheduleTabSwitchLimit || !form.scheduleTabSwitchLimit.value) missingFields.push('Allowed Tab Switches');
      
      if(missingFields.length > 0) {
        console.error('ERROR VALIDATION FAILED: Missing fields:', missingFields);
        showToast('Missing required fields: ' + missingFields.join(', '), false);
        return;
      }

      // Get exam ID from the form field
      const examId = form.scheduleExam ? form.scheduleExam.value : null;
      console.log('\n Captured Exam ID:', examId);
      
      if(!examId) {
        console.error(' CRITICAL ERROR: Exam ID is missing from form!');
        console.error('   Form object:', form);
        console.error('   Form elements:', form.elements);
        console.error('   Looking for element with id="scheduleExam"');
        showToast('CRITICAL ERROR: Exam ID is missing - cannot schedule', false);
        return;
      }

  const isLiveMonitorEnabled = !!(form.scheduleLiveExamMonitorToggle && form.scheduleLiveExamMonitorToggle.checked);

// Get all selected values (for bulk scheduling)
const colleges = Array.from(form.querySelectorAll('.scheduleCollege-checkbox:checked')).map(cb => cb.value);
const courses = Array.from(form.querySelectorAll('.scheduleCourse-checkbox:checked')).map(cb => cb.value);
const semesters = Array.from(form.querySelectorAll('.scheduleSemester-checkbox:checked')).map(cb => cb.value);
const years = Array.from(form.querySelectorAll('.scheduleYear-checkbox:checked')).map(cb => cb.value);
const sections = Array.from(form.querySelectorAll('.section-checkbox:checked')).map(opt => opt.value).filter(Boolean);

// For single edit mode, just use the first selected value
// For new schedules, create for all combinations
const isBulkMode = !sid && colleges.length > 1 || courses.length > 1 || semesters.length > 1 || years.length > 1;

const d = {
  college: colleges.length === 1 ? colleges[0] : colleges,
  course: courses.length === 1 ? courses[0] : courses,
  semester: semesters.length === 1 ? Number(semesters[0]) : semesters.map(Number),
  year: years.length === 1 ? Number(years[0]) : years.map(Number),

  section: sections,
  start_datetime: form.scheduleStart.value,
  end_datetime: form.scheduleEnd.value,
  status: form.scheduleStatus.value,
    result_released: !!(form.scheduleResultReleaseToggle && form.scheduleResultReleaseToggle.checked),

    require_attendance: !!(form.scheduleRequireAttendanceToggle && form.scheduleRequireAttendanceToggle.checked),
    live_exam_monitor: isLiveMonitorEnabled,
    monitor_trainers: isLiveMonitorEnabled
      ? Array.from(form.querySelectorAll('.scheduleTrainers-checkbox:checked')).map(opt => opt.value).filter(Boolean)
      : [],
    monitor_tpos: isLiveMonitorEnabled
      ? Array.from(form.querySelectorAll('.scheduleTpos-checkbox:checked')).map(opt => opt.value).filter(Boolean)
      : [],
    allowed_tab_switches: form.scheduleTabSwitchLimit
      ? Number(form.scheduleTabSwitchLimit.value)
      : 3,
    random_question_count: (form.scheduleRandomQuestionCount && form.scheduleRandomQuestionCount.value)
      ? Number(form.scheduleRandomQuestionCount.value)
      : null
};
      console.log('\n REQUEST DETAILS:');
      console.log('  Data Object:', JSON.stringify(d, null, 2));
      console.log('  Mode:', sid ? 'UPDATE' : 'CREATE');
      console.log('  Exam ID:', examId);
      console.log('  Schedule ID:', sid || 'N/A');

      const endpoint = sid
        ? urls.updateSchedule.replace(placeholder,sid)
        : urls.scheduleExam.replace(placeholder,examId);
      
      console.log('\n ENDPOINT INFO:');
      console.log('  Base URL:', sid ? urls.updateSchedule : urls.scheduleExam);
      console.log('  Final URL:', endpoint);
      console.log('  CSRF Token:', csrfToken ? 'Present [Yes]' : 'MISSING [No]');

      try {
        console.log('\n Sending POST request...');
        const r = await fetch(endpoint,{
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},
          body:JSON.stringify(d)
        });
        
        console.log('\n RESPONSE RECEIVED:');
        console.log('  Status Code:', r.status);
        console.log('  Status Text:', r.statusText);
        console.log('  OK:', r.ok);
        
        let resp;
        try {
          resp = await r.json();
        } catch(parseErr) {
          console.error(' Failed to parse JSON response:', parseErr);
          console.error('   Response might be HTML or empty');
          const text = await r.text();
          console.error('   Raw response:', text.substring(0, 500));
          showToast('Server error: Invalid response format', false);
          return;
        }
        
        console.log('\n SERVER RESPONSE:');
        console.log(JSON.stringify(resp, null, 2));
        
        if(resp.status==='success') {
          console.log(' SUCCESS! Schedule created/updated');
          showToast(resp.message||'Exam scheduled successfully!',true);
          closeModal(modalId); 
          console.log(' Refreshing schedule list...');
          await renderScheduledExams();
          await renderExamTable(); 
          console.log(' Refresh complete');
        } else {
          // Handle errors
          console.error(' SERVER RETURNED ERROR STATUS');
          if(resp.errors) {
            const errorMsg = Object.entries(resp.errors).map(([k,v])=>{
              const msgs = Array.isArray(v) ? v.join(', ') : v;
              return `${k}: ${msgs}`;
            }).join('\n');
            console.error(' Validation Errors:', resp.errors);
            showToast('Validation Error:\n'+errorMsg,false);
          } else {
            console.error(' Error Message:', resp.message);
            showToast(resp.message||'Failed to schedule exam',false);
          }
        }
      } catch(err) {
        console.error('\n NETWORK OR JAVASCRIPT ERROR:');
        console.error('  Error Type:', err.name);
        console.error('  Error Message:', err.message);
        console.error('  Stack Trace:', err.stack);
        showToast('Network error: '+err.message,false);
      }
      
      console.log('╚═══════════════════════════════════════╝');
      console.log('   END OF SUBMISSION');
      console.log('╚═══════════════════════════════════════╝');
    };
  }

  // ─── Questions ─────────────────────────────────────────────────────────────
  // ─── Questions (Fullscreen Modal) ──────────────────────────────────────────
  async function openQuestionsModal(examId) {
    const modalId = 'questions-modal';
    const r = await fetch(
      urls.getExamQuestions.replace(placeholder, examId),
      { credentials: 'same-origin' }
    );
    const data = await r.json();
    if (data.status !== 'success') {
      showToast('Failed to fetch questions', false);
      return;
    }
    const qArr = data.questions || [];

    const examObj = (cachedExams || []).find(e => String(e.id) === String(examId));
    const examCard = document.querySelector(`[data-exam-id="${examId}"]`);
    const examTitle = examObj?.title || examCard?.dataset.title || 'Exam Questions';
    const examDomain = examObj?.domain_name || examCard?.dataset.domainName || 'General';
    const totalMarks = examObj?.max_marks ?? examCard?.dataset.maxMarks ?? '-';
    const passingMarks = examObj?.passing_marks ?? examCard?.dataset.passingMarks ?? '-';

    const cont = document.createElement('div');
    cont.className = 'questions-fullscreen-wrapper';

    // 1. Header Bar
    const header = document.createElement('div');
    header.className = 'questions-fs-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'questions-fs-header-left';
    headerLeft.innerHTML = `
      <div class="questions-fs-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div>
        <h2 class="questions-fs-title">Questions &mdash; <span class="highlight-title">${escapeHtml(examTitle)}</span></h2>
        <div class="questions-fs-meta">
          <span><strong>Domain:</strong> ${escapeHtml(examDomain)}</span>
          <span class="meta-pipe">|</span>
          <span><strong>Pass / Max Marks:</strong> ${passingMarks} / ${totalMarks}</span>
          <span class="meta-pipe">|</span>
          <span><strong>Total Questions:</strong> <span id="q-total-count">${qArr.length}</span></span>
        </div>
      </div>
    `;

    const headerRight = document.createElement('div');
    headerRight.className = 'questions-fs-header-right';

    // Live search input
    const searchWrap = document.createElement('div');
    searchWrap.className = 'questions-fs-search-wrap';
    searchWrap.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;
    const searchInp = document.createElement('input');
    searchInp.type = 'search';
    searchInp.placeholder = 'Search questions...';
    searchInp.className = 'questions-fs-search-input';
    searchWrap.appendChild(searchInp);

    // + Add Question Button
    const addB = document.createElement('button');
    addB.id = 'addQuestionBtn';
    addB.type = 'button';
    addB.className = 'btn-schedule-new-exam';
    addB.dataset.exam = examId;
    addB.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span style="pointer-events:none;">Add Question</span>
    `;

    // Exit Button
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'questions-fs-exit-btn';
    exitBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span style="pointer-events:none;">Close</span>
    `;
    exitBtn.onclick = () => closeModal(modalId);

    headerRight.append(searchWrap, addB, exitBtn);
    header.append(headerLeft, headerRight);
    cont.appendChild(header);

    // 2. Table / Body Container
    const bodyCont = document.createElement('div');
    bodyCont.className = 'questions-fs-body';

    const cardTableWrap = document.createElement('div');
    cardTableWrap.className = 'questions-fs-table-card';

    const table = document.createElement('table');
    table.className = 'questions-fs-table';
    table.id = 'questionsTable';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="width: 50px; text-align: center;">#</th>
        <th style="width: 100px; text-align: center;">Type</th>
        <th style="width: 130px; text-align: center;">Section</th>
        <th style="text-align: left;">Question Text</th>
        <th style="width: 90px; text-align: center;">Marks</th>
        <th style="width: 90px; text-align: center;">Negative</th>
        <th style="width: 150px; text-align: center;">Actions</th>
      </tr>
    `;
    table.appendChild(thead);

    const tb = document.createElement('tbody');

    if (!qArr.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.className = 'q-empty-row';
      emptyRow.innerHTML = `
        <td colspan="7" style="text-align: center; padding: 48px 16px; color: #64748b;">
          <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
          <div style="font-size: 15px; font-weight: 600; color: #334155;">No questions added to this exam yet.</div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Click the "+ Add Question" button above to add your first question.</div>
        </td>
      `;
      tb.appendChild(emptyRow);
    } else {
      qArr.forEach((q, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.qid = q.id;

        // Type badge theme
        const qType = String(q.type || 'MCQ').toUpperCase();
        let typeBadgeClass = 'q-type-badge-mcq';
        if (qType.includes('CODE')) typeBadgeClass = 'q-type-badge-code';
        else if (qType.includes('DESC')) typeBadgeClass = 'q-type-badge-desc';

        tr.innerHTML = `
          <td style="text-align: center; color: #64748b; font-weight: 600; font-size: 12.5px;">${idx + 1}</td>
          <td style="text-align: center;"><span class="q-type-badge ${typeBadgeClass}">${escapeHtml(qType)}</span></td>
          <td style="text-align: center;"><span class="q-section-tag">${escapeHtml(q.section_tag || '-')}</span></td>
          <td class="q-text-cell">
            <div class="q-text-content">${escapeHtml(q.question_text || '')}</div>
            ${q.image_url ? `<div class="q-image-preview"><a href="${escapeHtml(q.image_url)}" target="_blank" rel="noopener">🖼 View Attached Image</a></div>` : ''}
          </td>
          <td style="text-align: center;"><span class="q-marks-val">${q.marks ?? 0}</span></td>
          <td style="text-align: center;"><span class="q-neg-val ${Number(q.negative_mark) > 0 ? 'has-neg' : ''}">${q.negative_mark || 0}</span></td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button type="button" class="sch-card-btn sch-card-btn-edit edit-question" data-qid="${q.id}" data-exam="${examId}" title="Edit question">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span style="pointer-events:none;">Edit</span>
              </button>
              <button type="button" class="sch-card-btn sch-card-btn-delete delete-question" data-qid="${q.id}" data-exam="${examId}" title="Delete question">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                <span style="pointer-events:none;">Delete</span>
              </button>
            </div>
          </td>
        `;

        tb.appendChild(tr);
      });
    }

    table.appendChild(tb);
    cardTableWrap.appendChild(table);
    bodyCont.appendChild(cardTableWrap);
    cont.appendChild(bodyCont);

    // Live search inside questions
    searchInp.addEventListener('input', (ev) => {
      const qVal = ev.target.value.trim().toLowerCase();
      const rows = tb.querySelectorAll('tr:not(.q-empty-row)');
      let matchedCount = 0;
      rows.forEach(r => {
        const txt = (r.textContent || '').toLowerCase();
        const match = !qVal || txt.includes(qVal);
        r.style.display = match ? '' : 'none';
        if (match) matchedCount++;
      });
      let noMatchRow = tb.querySelector('.q-no-match-row');
      if (matchedCount === 0 && rows.length > 0) {
        if (!noMatchRow) {
          noMatchRow = document.createElement('tr');
          noMatchRow.className = 'q-no-match-row';
          noMatchRow.innerHTML = `<td colspan="7" style="text-align:center; padding: 24px; color: #64748b;">No matching questions found for "${escapeHtml(qVal)}".</td>`;
          tb.appendChild(noMatchRow);
        }
      } else if (noMatchRow) {
        noMatchRow.remove();
      }
    });

    // Create modal with fullscreen flag
    const modalEl = createModal(modalId, cont, true);
    modalEl.style.zIndex = '100000';
    const boxEl = modalEl.querySelector('.modal-content');
    if (boxEl) {
      boxEl.style.maxWidth = 'none';
      boxEl.style.width = '100vw';
      boxEl.style.height = '100vh';
      boxEl.style.margin = '0';
      boxEl.style.padding = '0';
      boxEl.style.borderRadius = '0';
      boxEl.style.overflow = 'hidden';
      boxEl.style.display = 'flex';
      boxEl.style.flexDirection = 'column';
    }
    openModal(modalId);

    // Add and Edit Question bindings
    addB.addEventListener('click', () => openQuestionFormModal(examId, null, null, modalId));
    cont.querySelectorAll('.edit-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.qid;
        const q = qArr.find(x => String(x.id) === String(qid));
        openQuestionFormModal(examId, qid, q, modalId);
      });
    });
    cont.querySelectorAll('.delete-question').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this question?')) return;
        const qid = btn.dataset.qid;
        const url = urls.deleteQuestion
          .replace(placeholder, examId)
          .replace('/1/', `/${qid}/`);
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRFToken': csrfToken }
        });
        const d = await r.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal(modalId);
          openQuestionsModal(examId);
          // Also refresh the exam cards so question count updates
          renderExamTable();
        }
      });
    });
  }

  async function openExamPreviewModal(examId) {
    const modalId = 'exam-preview-modal';
    const r = await fetch(
      urls.getExamQuestions.replace(placeholder, examId),
      { credentials: 'same-origin' }
    );
    const data = await r.json();
    if (data.status !== 'success') {
      showToast('Failed to fetch exam questions', false);
      return;
    }
    const questions = data.questions || [];

    const examObj = (cachedExams || []).find(e => String(e.id) === String(examId));
    const card = document.querySelector(`[data-exam-id="${examId}"]`);
    const examTitle = examObj?.title || card?.dataset.title || "Exam Preview";
    const examDomain = examObj?.domain_name || card?.dataset.domainName || "";
    const passingMarks = examObj?.passing_marks ?? card?.dataset.passingMarks ?? "";
    const totalMarks = examObj?.max_marks ?? card?.dataset.maxMarks ?? "";
    const duration = examObj?.duration_minutes ?? card?.dataset.duration ?? "";

    const durMin = parseInt(duration) || 60;
    
    const cont = document.createElement('div');
    cont.style.display = 'flex';
    cont.style.flexDirection = 'column';
    cont.style.height = '100vh';
    cont.style.background = '#f1f5f9';
    cont.style.boxSizing = 'border-box';
    cont.style.overflow = 'hidden';

    // 1. Header Area
    const header = document.createElement('div');
    header.style.background = 'linear-gradient(135deg, #008037 0%, #005c27 100%)';
    header.style.color = '#ffffff';
    header.style.padding = '15px 24px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    header.style.flexShrink = '0';

    const headerLeft = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = `Exam Preview Mode: ${examTitle}`;
    title.style.margin = '0 0 5px 0';
    title.style.fontSize = '1.3rem';
    title.style.fontWeight = '800';
    headerLeft.appendChild(title);

    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.gap = '15px';
    meta.style.fontSize = '0.85rem';
    meta.style.fontWeight = '600';
    meta.innerHTML = `
      <span><i class="fas fa-university"></i> ${examDomain}</span>
      <span><i class="fas fa-star"></i> Max Marks: ${totalMarks}</span>
      <span><i class="fas fa-check-double"></i> Pass: ${passingMarks}</span>
    `;
    headerLeft.appendChild(meta);

    // Mock Timer & Close Btn
    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '20px';

    const timerLine = document.createElement('div');
    timerLine.style.background = 'rgba(255, 255, 255, 0.15)';
    timerLine.style.padding = '6px 14px';
    timerLine.style.borderRadius = '20px';
    timerLine.style.fontSize = '0.9rem';
    timerLine.style.fontWeight = 'bold';
    timerLine.innerHTML = `<i class="far fa-clock"></i> Time Left: <span id="preview-timer" style="color: #4ade80;">${durMin}:00</span>`;
    headerRight.appendChild(timerLine);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Exit Preview';
    closeBtn.style.background = '#ef4444';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.padding = '8px 16px';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontWeight = '700';
    closeBtn.onclick = () => closeModal(modalId);
    headerRight.appendChild(closeBtn);

    header.append(headerLeft, headerRight);
    cont.appendChild(header);

    // 2. Main content split layout
    const mainArea = document.createElement('div');
    mainArea.style.display = 'flex';
    mainArea.style.flex = '1';
    mainArea.style.overflow = 'hidden';
    mainArea.style.padding = '20px';
    mainArea.style.gap = '20px';
    mainArea.style.boxSizing = 'border-box';

    // Left Column: Question Viewer
    const leftCol = document.createElement('div');
    leftCol.style.flex = '1';
    leftCol.style.background = '#ffffff';
    leftCol.style.borderRadius = '12px';
    leftCol.style.padding = '24px';
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
    leftCol.style.overflow = 'hidden';
    leftCol.style.boxSizing = 'border-box';

    const qContentArea = document.createElement('div');
    qContentArea.style.flex = '1';
    qContentArea.style.overflowY = 'auto';
    qContentArea.style.paddingRight = '10px';
    qContentArea.style.marginBottom = '20px';

    // Left Column Footer: Navigation Buttons
    const navBar = document.createElement('div');
    navBar.style.display = 'flex';
    navBar.style.justifyContent = 'space-between';
    navBar.style.alignItems = 'center';
    navBar.style.paddingTop = '15px';
    navBar.style.borderTop = '1px solid #e2e8f0';
    navBar.style.flexShrink = '0';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.textContent = 'Previous';
    prevButton.className = 'action-btn edit-exam';
    prevButton.style.background = '#475569';
    prevButton.style.color = '#fff';

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.textContent = 'Next';
    nextButton.className = 'action-btn edit-exam';
    nextButton.style.background = '#008037';
    nextButton.style.color = '#fff';

    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.textContent = 'Mark for Review';
    reviewButton.className = 'action-btn edit-exam';
    reviewButton.style.background = '#eab308';
    reviewButton.style.color = '#fff';

    const leftNavs = document.createElement('div');
    leftNavs.style.display = 'flex';
    leftNavs.style.gap = '10px';
    leftNavs.append(prevButton, nextButton, reviewButton);
    navBar.appendChild(leftNavs);

    const submitMockBtn = document.createElement('button');
    submitMockBtn.type = 'button';
    submitMockBtn.textContent = 'Submit Preview';
    submitMockBtn.style.background = '#005c27';
    submitMockBtn.style.color = '#fff';
    submitMockBtn.style.border = 'none';
    submitMockBtn.style.padding = '8px 20px';
    submitMockBtn.style.borderRadius = '6px';
    submitMockBtn.style.cursor = 'pointer';
    submitMockBtn.style.fontWeight = '700';
    submitMockBtn.onclick = () => {
      alert("This is a preview mode. Your mock answers are not saved.");
      closeModal(modalId);
    };
    navBar.appendChild(submitMockBtn);

    leftCol.append(qContentArea, navBar);

    // Right Column: Navigation Palette
    const rightCol = document.createElement('div');
    rightCol.style.width = '300px';
    rightCol.style.background = '#ffffff';
    rightCol.style.borderRadius = '12px';
    rightCol.style.padding = '20px';
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = '15px';
    rightCol.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
    rightCol.style.overflowY = 'auto';
    rightCol.style.flexShrink = '0';
    rightCol.style.boxSizing = 'border-box';

    const paletteTitle = document.createElement('h4');
    paletteTitle.textContent = 'Jump to question';
    paletteTitle.style.margin = '0';
    paletteTitle.style.fontSize = '1.05rem';
    paletteTitle.style.fontWeight = '700';
    paletteTitle.style.color = '#1e293b';
    rightCol.appendChild(paletteTitle);

    // Legend Area
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.gap = '8px';
    legend.style.fontSize = '0.8rem';
    legend.style.fontWeight = '600';
    legend.style.borderBottom = '1px solid #f1f5f9';
    legend.style.paddingBottom = '12px';
    legend.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;"><span style="width:12px; height:12px; border-radius:50%; background:#22c55e; display:inline-block;"></span> Answered</div>
      <div style="display:flex; align-items:center; gap:8px;"><span style="width:12px; height:12px; border-radius:50%; background:#94a3b8; display:inline-block;"></span> Unanswered</div>
      <div style="display:flex; align-items:center; gap:8px;"><span style="width:12px; height:12px; border-radius:50%; background:#eab308; display:inline-block;"></span> Review</div>
    `;
    rightCol.appendChild(legend);

    // Filter Buttons
    const filterWrap = document.createElement('div');
    filterWrap.style.display = 'grid';
    filterWrap.style.gridTemplateColumns = 'repeat(2, 1fr)';
    filterWrap.style.gap = '6px';
    
    const filters = ['All', 'Answered', 'Unanswered', 'Review'];
    const filterBtns = {};
    let activeFilter = 'All';

    filters.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = f;
      btn.style.padding = '6px 8px';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid #cbd5e1';
      btn.style.background = f === activeFilter ? '#008037' : '#ffffff';
      btn.style.color = f === activeFilter ? '#ffffff' : '#475569';
      btn.style.fontWeight = '600';
      btn.style.fontSize = '0.8rem';
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        activeFilter = f;
        filters.forEach(x => {
          filterBtns[x].style.background = x === activeFilter ? '#008037' : '#ffffff';
          filterBtns[x].style.color = x === activeFilter ? '#ffffff' : '#475569';
        });
        const nextIdx = getFirstMatchingQuestionIndex();
        if (nextIdx !== -1) {
          currentIndex = nextIdx;
          renderActiveQuestion();
        }
        updatePaletteColors();
      };
      filterBtns[f] = btn;
      filterWrap.appendChild(btn);
    });
    rightCol.appendChild(filterWrap);

    // Palette Buttons Grid
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
    grid.style.gap = '8px';
    rightCol.appendChild(grid);

    mainArea.append(leftCol, rightCol);
    cont.appendChild(mainArea);

    let currentIndex = 0;
    const mockAnswers = {};
    const reviewSet = new Set();

    const isQuestionAnswered = (q) => {
      const val = mockAnswers[q.id];
      return val !== undefined && val !== null && val.trim() !== "";
    };

    const getFirstMatchingQuestionIndex = () => {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (activeFilter === 'All') return i;
        if (activeFilter === 'Answered' && isQuestionAnswered(q)) return i;
        if (activeFilter === 'Unanswered' && !isQuestionAnswered(q)) return i;
        if (activeFilter === 'Review' && reviewSet.has(i)) return i;
      }
      return -1;
    };

    const updatePaletteColors = () => {
      grid.textContent = '';
      questions.forEach((q, idx) => {
        const pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.textContent = String(idx + 1);
        pBtn.style.padding = '8px 0';
        pBtn.style.borderRadius = '8px';
        pBtn.style.border = '1px solid #e2e8f0';
        pBtn.style.fontWeight = 'bold';
        pBtn.style.fontSize = '0.9rem';
        pBtn.style.cursor = 'pointer';

        let visible = true;
        if (activeFilter === 'Answered' && !isQuestionAnswered(q)) visible = false;
        if (activeFilter === 'Unanswered' && isQuestionAnswered(q)) visible = false;
        if (activeFilter === 'Review' && !reviewSet.has(idx)) visible = false;

        pBtn.style.opacity = visible ? '1' : '0.25';
        pBtn.style.pointerEvents = visible ? 'auto' : 'none';

        if (reviewSet.has(idx)) {
          pBtn.style.background = '#eab308';
          pBtn.style.color = '#ffffff';
        } else if (isQuestionAnswered(q)) {
          pBtn.style.background = '#22c55e';
          pBtn.style.color = '#ffffff';
        } else {
          pBtn.style.background = '#94a3b8';
          pBtn.style.color = '#ffffff';
        }

        if (idx === currentIndex) {
          pBtn.style.boxShadow = '0 0 0 3px #008037';
          pBtn.style.transform = 'scale(1.1)';
        }

        pBtn.onclick = () => {
          currentIndex = idx;
          renderActiveQuestion();
        };

        grid.appendChild(pBtn);
      });
    };

    const renderActiveQuestion = () => {
      qContentArea.textContent = '';
      if (!questions.length) return;
      const q = questions[currentIndex];

      const qBlock = document.createElement('div');

      const qHeaderLine = document.createElement('div');
      qHeaderLine.style.display = 'flex';
      qHeaderLine.style.justifyContent = 'space-between';
      qHeaderLine.style.borderBottom = '2px solid #e2e8f0';
      qHeaderLine.style.paddingBottom = '10px';
      qHeaderLine.style.marginBottom = '15px';

      const qTitle = document.createElement('span');
      qTitle.innerHTML = `<strong>Question ${currentIndex + 1} of ${questions.length}</strong> <span style="background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 700; margin-left: 8px;">${q.type}</span>`;
      if (q.section_tag) {
        qTitle.innerHTML += ` <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 700; margin-left: 8px;">${q.section_tag}</span>`;
      }

      const qMarks = document.createElement('span');
      qMarks.style.fontSize = '0.9rem';
      qMarks.style.fontWeight = '700';
      qMarks.style.color = '#008037';
      qMarks.textContent = `[Marks: ${q.marks} | Neg: ${q.negative_mark || 0}]`;

      qHeaderLine.append(qTitle, qMarks);
      qBlock.appendChild(qHeaderLine);

      const qText = document.createElement('p');
      qText.textContent = q.question_text;
      qText.style.fontSize = '1.15rem';
      qText.style.color = '#1e293b';
      qText.style.lineHeight = '1.6';
      qText.style.margin = '0 0 20px 0';
      qText.style.fontWeight = '600';
      qText.style.whiteSpace = 'pre-wrap';
      qBlock.appendChild(qText);

      if (q.image_url) {
        const img = document.createElement('img');
        img.src = q.image_url;
        img.alt = 'Question image';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '220px';
        img.style.borderRadius = '8px';
        img.style.marginBottom = '20px';
        img.style.display = 'block';
        qBlock.appendChild(img);
      }

      const inputWrap = document.createElement('div');
      inputWrap.style.marginBottom = '20px';

      if (q.type === 'MCQ') {
        let options = q.options;
        if (typeof options === 'string') {
          try { options = JSON.parse(options); } catch(e) { options = []; }
        }
        if (Array.isArray(options)) {
          options.forEach((opt, oIdx) => {
            const optChar = String.fromCharCode(65 + oIdx);
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '10px';
            label.style.padding = '12px 16px';
            label.style.background = mockAnswers[q.id] === opt ? '#f0fdf4' : '#f8fafc';
            label.style.border = mockAnswers[q.id] === opt ? '1px solid #22c55e' : '1px solid #cbd5e1';
            label.style.borderRadius = '8px';
            label.style.marginBottom = '10px';
            label.style.cursor = 'pointer';
            label.style.fontSize = '1rem';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `preview_radio_${q.id}`;
            radio.value = opt;
            if (mockAnswers[q.id] === opt) radio.checked = true;
            radio.onchange = () => {
              mockAnswers[q.id] = opt;
              renderActiveQuestion();
              updatePaletteColors();
            };

            label.append(radio, document.createTextNode(`${optChar}. ${opt}`));
            inputWrap.appendChild(label);
          });
        }
      } else if (q.type === 'TF') {
        ['True', 'False'].forEach(val => {
          const label = document.createElement('label');
          label.style.display = 'flex';
          label.style.alignItems = 'center';
          label.style.gap = '10px';
          label.style.padding = '12px 16px';
          label.style.background = mockAnswers[q.id] === val ? '#f0fdf4' : '#f8fafc';
          label.style.border = mockAnswers[q.id] === val ? '1px solid #22c55e' : '1px solid #cbd5e1';
          label.style.borderRadius = '8px';
          label.style.marginBottom = '10px';
          label.style.cursor = 'pointer';
          label.style.fontSize = '1rem';

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `preview_radio_${q.id}`;
          radio.value = val;
          if (mockAnswers[q.id] === val) radio.checked = true;
          radio.onchange = () => {
            mockAnswers[q.id] = val;
            renderActiveQuestion();
            updatePaletteColors();
          };

          label.append(radio, document.createTextNode(val));
          inputWrap.appendChild(label);
        });
      } else if (q.type === 'DESC') {
        const textarea = document.createElement('textarea');
        textarea.rows = 4;
        textarea.placeholder = 'Type your descriptive answer here...';
        textarea.style.width = '100%';
        textarea.style.padding = '14px';
        textarea.style.borderRadius = '8px';
        textarea.style.border = '1px solid #cbd5e1';
        textarea.style.resize = 'none';
        textarea.style.boxSizing = 'border-box';
        textarea.style.fontSize = '1rem';
        textarea.value = mockAnswers[q.id] || '';
        textarea.oninput = (e) => {
          mockAnswers[q.id] = e.target.value;
          updatePaletteColors();
        };
        inputWrap.appendChild(textarea);
      } else if (q.type === 'CODE' || q.type === 'Code') {
        const editorMock = document.createElement('div');
        editorMock.style.display = 'flex';
        editorMock.style.flexDirection = 'column';
        editorMock.style.border = '1px solid #cbd5e1';
        editorMock.style.borderRadius = '8px';
        editorMock.style.overflow = 'hidden';

        const editorHeader = document.createElement('div');
        editorHeader.style.background = '#0f172a';
        editorHeader.style.color = '#94a3b8';
        editorHeader.style.padding = '8px 12px';
        editorHeader.style.fontSize = '0.8rem';
        editorHeader.style.fontFamily = 'monospace';
        editorHeader.textContent = 'compiler_preview.py';
        editorMock.appendChild(editorHeader);

        const textarea = document.createElement('textarea');
        textarea.rows = 6;
        textarea.style.background = '#1e293b';
        textarea.style.color = '#38bdf8';
        textarea.style.padding = '12px';
        textarea.style.width = '100%';
        textarea.style.boxSizing = 'border-box';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '0.9rem';
        textarea.style.border = 'none';
        textarea.style.resize = 'none';
        textarea.value = mockAnswers[q.id] || '# Write your solution here...\n';
        textarea.oninput = (e) => {
          mockAnswers[q.id] = e.target.value;
          updatePaletteColors();
        };
        editorMock.appendChild(textarea);
        inputWrap.appendChild(editorMock);
      }
      qBlock.appendChild(inputWrap);

      const correctAns = document.createElement('div');
      correctAns.style.background = '#f0fdf4';
      correctAns.style.border = '1px solid #dcfce7';
      correctAns.style.padding = '12px 16px';
      correctAns.style.borderRadius = '8px';
      correctAns.style.fontSize = '0.92rem';
      correctAns.style.color = '#15803d';
      correctAns.style.fontWeight = '600';
      correctAns.innerHTML = `<i class="fas fa-check-circle"></i> <strong>Correct Answer:</strong> ${escapeHtml(q.correct_answer || '—')}`;
      qBlock.appendChild(correctAns);

      qContentArea.appendChild(qBlock);

      prevButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex === questions.length - 1;
      reviewButton.textContent = reviewSet.has(currentIndex) ? 'Unmark Review' : 'Mark for Review';
      reviewButton.style.background = reviewSet.has(currentIndex) ? '#64748b' : '#eab308';

      updatePaletteColors();
    };

    prevButton.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderActiveQuestion();
      }
    };

    nextButton.onclick = () => {
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderActiveQuestion();
      }
    };

    reviewButton.onclick = () => {
      if (reviewSet.has(currentIndex)) {
        reviewSet.delete(currentIndex);
      } else {
        reviewSet.add(currentIndex);
      }
      renderActiveQuestion();
    };

    let timeRemaining = durMin * 60;
    const timerInterval = setInterval(() => {
      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        return;
      }
      timeRemaining--;
      const min = Math.floor(timeRemaining / 60);
      const sec = timeRemaining % 60;
      const formatted = `${min}:${sec < 10 ? '0' : ''}${sec}`;
      const timerSpan = document.getElementById('preview-timer');
      if (timerSpan) {
        timerSpan.textContent = formatted;
        if (timeRemaining < 300) {
          timerSpan.style.color = '#f87171';
        }
      }
    }, 1000);

    const originalClose = closeModal;
    window.closeModal = (id) => {
      if (id === modalId) {
        clearInterval(timerInterval);
      }
      originalClose(id);
    };

    renderActiveQuestion();

    const modalEl = createModal(modalId, cont, true);
    // Explicitly override CSS cascade limitations
    modalEl.style.zIndex = '100000';
    
    const boxEl = modalEl.querySelector('.modal-content');
    if (boxEl) {
      boxEl.style.maxWidth = 'none';
      boxEl.style.width = '100vw';
      boxEl.style.height = '100vh';
      boxEl.style.margin = '0';
      boxEl.style.padding = '0';
      boxEl.style.borderRadius = '0';
      boxEl.style.border = 'none';
      boxEl.style.boxSizing = 'border-box';
      boxEl.style.overflow = 'hidden';
    }

    openModal(modalId);
    
    // Explicitly set flex display to keep layout aligned
    const modalE = document.getElementById(modalId);
    if (modalE) {
      modalE.style.display = 'flex';
      modalE.style.alignItems = 'center';
      modalE.style.justifyContent = 'center';
    }
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

  // ─── Question Form (Fullscreen Modal) ───────────────────────────────────────
  function openQuestionFormModal(examId, questionId, existing, parentModalId) {
    const isEdit = Boolean(questionId);
    const modalId = 'question-form-modal';
    closeModal(modalId);

    const examObj = (cachedExams || []).find(e => String(e.id) === String(examId));
    const examCard = document.querySelector(`[data-exam-id="${examId}"]`);
    const examTitle = examObj?.title || examCard?.dataset.title || 'Exam';
    const examDomain = examObj?.domain_name || examCard?.dataset.domainName || '';

    const cont = document.createElement('div');
    cont.className = 'q-form-fullscreen-wrapper';

    // 1. Header Bar
    const header = document.createElement('div');
    header.className = 'questions-fs-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'questions-fs-header-left';
    headerLeft.innerHTML = `
      <div class="questions-fs-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </div>
      <div>
        <h2 class="questions-fs-title">${isEdit ? 'Edit Question' : 'Add Question'} &mdash; <span class="highlight-title">${escapeHtml(examTitle)}</span></h2>
        <div class="questions-fs-meta">
          <span><strong>Domain:</strong> ${escapeHtml(examDomain || 'General')}</span>
          <span class="meta-pipe">|</span>
          <span>Configure question type, marks, statement, and options.</span>
        </div>
      </div>
    `;

    const headerRight = document.createElement('div');
    headerRight.className = 'questions-fs-header-right';

    // Cancel Button
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'questions-fs-exit-btn';
    cancelBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span style="pointer-events:none;">Cancel</span>
    `;
    cancelBtn.onclick = () => closeModal(modalId);

    // Save Button (Header)
    const headerSaveBtn = document.createElement('button');
    headerSaveBtn.type = 'button';
    headerSaveBtn.className = 'btn-schedule-new-exam';
    headerSaveBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="pointer-events:none;">${isEdit ? 'Save Changes' : 'Save Question'}</span>
    `;

    headerRight.append(cancelBtn, headerSaveBtn);
    header.append(headerLeft, headerRight);
    cont.appendChild(header);

    // 2. Form Body
    const bodyCont = document.createElement('div');
    bodyCont.className = 'q-form-fs-body';

    const form = document.createElement('form');
    form.id = 'qForm';
    form.autocomplete = 'off';
    form.className = 'q-form-fs-inner';

    headerSaveBtn.onclick = () => {
      form.requestSubmit();
    };

    // ─── Card 1: Question Setup ───
    const card1 = document.createElement('div');
    card1.className = 'q-form-card';
    card1.innerHTML = `<h3 class="q-form-card-title">1. Question Setup & Details</h3>`;

    const gridRow = document.createElement('div');
    gridRow.className = 'q-form-grid-3';

    // Type Selector
    const typeGroup = document.createElement('div');
    typeGroup.className = 'q-form-group';
    const labType = document.createElement('label');
    labType.className = 'q-form-label';
    labType.textContent = 'Question Type';
    const selType = document.createElement('select');
    selType.id = 'qType';
    selType.name = 'type';
    selType.className = 'q-form-select';
    [
      ['MCQ', 'Multiple Choice (MCQ)'],
      ['TF', 'True / False'],
      ['Code', 'Coding Challenge'],
      ['DESC', 'Descriptive / Essay']
    ].forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      if ((existing?.type || 'MCQ') === val) o.selected = true;
      selType.appendChild(o);
    });
    typeGroup.append(labType, selType);

    // Section/Topic
    const sectionGroup = document.createElement('div');
    sectionGroup.className = 'q-form-group';
    const sectionLabel = document.createElement('label');
    sectionLabel.className = 'q-form-label';
    sectionLabel.textContent = 'Section / Topic (Optional)';
    const sectionInput = document.createElement('input');
    sectionInput.type = 'text';
    sectionInput.id = 'qSection';
    sectionInput.name = 'section_tag';
    sectionInput.className = 'q-form-input';
    sectionInput.placeholder = 'e.g. Python, Quantitative, GK';
    sectionInput.value = existing?.section_tag || '';
    sectionGroup.append(sectionLabel, sectionInput);

    // Marks Grid
    const marksGroup = document.createElement('div');
    marksGroup.className = 'q-form-group';
    marksGroup.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
          <label class="q-form-label" for="qMarks">Marks *</label>
          <input type="number" id="qMarks" name="marks" class="q-form-input" required min="1" value="${existing?.marks ?? 1}">
        </div>
        <div>
          <label class="q-form-label" for="qNegMark">Negative Mark</label>
          <input type="number" id="qNegMark" name="negative_mark" class="q-form-input" min="0" step="any" value="${existing?.negative_mark ?? 0}">
        </div>
      </div>
    `;

    gridRow.append(typeGroup, sectionGroup, marksGroup);
    card1.appendChild(gridRow);

    // Question Text
    const textGroup = document.createElement('div');
    textGroup.className = 'q-form-group';
    textGroup.style.marginTop = '14px';
    const textLabel = document.createElement('label');
    textLabel.className = 'q-form-label';
    textLabel.htmlFor = 'qText';
    textLabel.textContent = 'Question Statement *';
    const inText = document.createElement('textarea');
    inText.id = 'qText';
    inText.name = 'question_text';
    inText.required = true;
    inText.className = 'q-form-textarea';
    inText.rows = 4;
    inText.placeholder = 'Enter the complete question text or problem statement here...';
    inText.value = existing?.question_text || '';
    textGroup.append(textLabel, inText);
    card1.appendChild(textGroup);

    // Image Upload
    const imgGroup = document.createElement('div');
    imgGroup.className = 'q-form-group q-img-upload-box';
    imgGroup.style.marginTop = '16px';

    const imgLabel = document.createElement('label');
    imgLabel.className = 'q-form-label';
    imgLabel.textContent = 'Attach Image (optional)';

    const imgRow = document.createElement('div');
    imgRow.style.display = 'flex';
    imgRow.style.alignItems = 'center';
    imgRow.style.gap = '12px';
    imgRow.style.flexWrap = 'wrap';

    const imgInput = document.createElement('input');
    imgInput.type = 'file';
    imgInput.name = 'image';
    imgInput.id = 'qImageInput';
    imgInput.accept = 'image/*';
    imgInput.style.fontSize = '12.5px';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Remove Selected Image';
    clearBtn.className = 'sch-card-btn sch-card-btn-delete';
    clearBtn.style.display = 'none';

    imgRow.append(imgInput, clearBtn);
    imgGroup.append(imgLabel, imgRow);

    // Existing image preview
    if (existing && existing.image_url) {
      const currentWrap = document.createElement('div');
      currentWrap.style.marginTop = '8px';
      currentWrap.innerHTML = `
        <div style="font-size: 11.5px; color: #64748b; margin-bottom: 4px;">Current Attached Image:</div>
        <img src="${escapeHtml(existing.image_url)}" alt="Current image" style="max-width: 220px; max-height: 140px; border-radius: 6px; border: 1px solid #cbd5e1; display: block;">
      `;
      imgGroup.appendChild(currentWrap);
    }

    // Live preview
    const preview = document.createElement('img');
    preview.id = 'image-preview';
    preview.alt = 'Image preview';
    preview.style.maxWidth = '220px';
    preview.style.maxHeight = '140px';
    preview.style.display = 'none';
    preview.style.marginTop = '8px';
    preview.style.borderRadius = '6px';
    preview.style.border = '1px solid #cbd5e1';
    imgGroup.appendChild(preview);

    clearBtn.onclick = () => {
      imgInput.value = '';
      preview.src = '';
      preview.style.display = 'none';
      clearBtn.style.display = 'none';
    };

    imgInput.addEventListener('change', function () {
      if (imgInput.files && imgInput.files[0]) {
        const file = imgInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
          preview.src = e.target.result;
          preview.style.display = 'block';
          clearBtn.style.display = 'inline-flex';
        };
        reader.readAsDataURL(file);
      } else {
        preview.src = '';
        preview.style.display = 'none';
        clearBtn.style.display = 'none';
      }
    });

    card1.appendChild(imgGroup);
    form.appendChild(card1);

    // ─── Card 2: Answers & Options (Dynamic) ───
    const card2 = document.createElement('div');
    card2.className = 'q-form-card';
    card2.id = 'q-card-answers';

    const card2Title = document.createElement('h3');
    card2Title.className = 'q-form-card-title';
    card2Title.textContent = '2. Answer Options & Evaluation';
    card2.appendChild(card2Title);

    const dyn = document.createElement('div');
    dyn.id = 'q-type-fields';
    card2.appendChild(dyn);
    form.appendChild(card2);

    // Bottom Action Buttons
    const bottomBar = document.createElement('div');
    bottomBar.className = 'q-form-bottom-bar';

    const bCancel = document.createElement('button');
    bCancel.type = 'button';
    bCancel.className = 'questions-fs-exit-btn';
    bCancel.textContent = 'Cancel';
    bCancel.onclick = () => closeModal(modalId);

    const bsub = document.createElement('button');
    bsub.type = 'submit';
    bsub.className = 'btn-schedule-new-exam';
    bsub.style.padding = '8px 22px';
    bsub.style.fontSize = '13.5px';
    bsub.textContent = isEdit ? 'Update Question' : 'Add Question';

    bottomBar.append(bCancel, bsub);
    form.appendChild(bottomBar);

    bodyCont.appendChild(form);
    cont.appendChild(bodyCont);

    function renderFields(type) {
      dyn.textContent = '';

      if (type === 'MCQ') {
        const init = Array.isArray(existing?.options) && existing.options.length
          ? existing.options.map(o => ({ value: o, correct: o === existing.correct_answer }))
          : [
              { value: '', correct: true },
              { value: '', correct: false },
              { value: '', correct: false },
              { value: '', correct: false }
            ];

        const mcqWrap = document.createElement('div');
        mcqWrap.innerHTML = `
          <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            Add answer choices below and select the radio button corresponding to the <strong>Correct Answer</strong>.
          </div>
        `;

        const list = document.createElement('div');
        list.id = 'mcq-options-list';

        const refreshLetters = () => {
          const rows = list.querySelectorAll('.mcq-opt-row');
          rows.forEach((row, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const badge = row.querySelector('.mcq-opt-letter');
            if (badge) badge.textContent = letter;
            const inp = row.querySelector('.mcq-option-input');
            if (inp && !inp.value) inp.placeholder = `Option ${letter}`;
          });
        };

        const createOptionRow = (o, idx) => {
          const row = document.createElement('div');
          row.className = 'mcq-opt-row';
          const letter = String.fromCharCode(65 + idx);

          const badge = document.createElement('span');
          badge.className = 'mcq-opt-letter';
          badge.textContent = letter;

          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'mcq-option-input q-form-input';
          inp.placeholder = `Option ${letter}`;
          inp.value = o.value || '';
          inp.style.flex = '1';

          const radioLabel = document.createElement('label');
          radioLabel.className = 'mcq-radio-label';
          const rd = document.createElement('input');
          rd.type = 'radio';
          rd.name = 'correct_option';
          rd.value = o.value || '';
          if (o.correct) rd.checked = true;
          radioLabel.append(rd, document.createTextNode(' Correct Answer'));

          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'sch-card-btn sch-card-btn-delete';
          rm.textContent = 'Remove';
          rm.onclick = () => {
            row.remove();
            refreshLetters();
          };

          row.append(badge, inp, radioLabel, rm);
          return row;
        };

        init.forEach((o, i) => {
          list.appendChild(createOptionRow(o, i));
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'sch-card-btn sch-card-btn-questions';
        addBtn.style.marginTop = '10px';
        addBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span style="pointer-events:none;">+ Add Another Option</span>
        `;
        addBtn.onclick = () => {
          const count = list.querySelectorAll('.mcq-opt-row').length;
          list.appendChild(createOptionRow({ value: '', correct: false }, count));
          refreshLetters();
        };

        mcqWrap.append(list, addBtn);
        dyn.appendChild(mcqWrap);
      }

      if (type === 'TF') {
        const tfWrap = document.createElement('div');
        tfWrap.className = 'q-form-group';
        tfWrap.style.maxWidth = '300px';

        const lab = document.createElement('label');
        lab.className = 'q-form-label';
        lab.textContent = 'Correct Answer *';

        const sel = document.createElement('select');
        sel.id = 'tfCorrect';
        sel.name = 'correct_answer';
        sel.className = 'q-form-select';
        ['True', 'False'].forEach(v => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          if (existing?.correct_answer === v) o.selected = true;
          sel.appendChild(o);
        });

        tfWrap.append(lab, sel);
        dyn.appendChild(tfWrap);
      }

      if (type === 'Code') {
        const codeWrap = document.createElement('div');

        const ioGrid = document.createElement('div');
        ioGrid.className = 'q-form-grid-2';
        ioGrid.innerHTML = `
          <div class="q-form-group">
            <label class="q-form-label" for="inputExample">Input Example</label>
            <textarea id="inputExample" class="q-form-textarea" rows="3" placeholder="Sample input values...">${escapeHtml(existing?.input_example || '')}</textarea>
          </div>
          <div class="q-form-group">
            <label class="q-form-label" for="expectedOutput">Expected Output</label>
            <textarea id="expectedOutput" class="q-form-textarea" rows="3" placeholder="Expected execution output...">${escapeHtml(existing?.expected_output || '')}</textarea>
          </div>
        `;
        codeWrap.appendChild(ioGrid);

        const tcHeader = document.createElement('div');
        tcHeader.style.marginTop = '18px';
        tcHeader.style.marginBottom = '8px';
        tcHeader.innerHTML = `<label class="q-form-label">Test Cases (Auto-Grading)</label>`;
        codeWrap.appendChild(tcHeader);

        const list = document.createElement('div');
        list.id = 'tc-list';

        const init = Array.isArray(existing?.test_cases) && existing.test_cases.length
          ? existing.test_cases
          : [{ input: '', output: '' }];

        const createTcRow = (tc) => {
          const row = document.createElement('div');
          row.className = 'tc-row';
          row.innerHTML = `
            <input type="text" class="tc-input q-form-input" placeholder="Test Case Input..." value="${escapeHtml(tc.input || '')}" style="flex: 1;">
            <input type="text" class="tc-output q-form-input" placeholder="Expected Output..." value="${escapeHtml(tc.output || '')}" style="flex: 1;">
            <button type="button" class="sch-card-btn sch-card-btn-delete">Remove</button>
          `;
          row.querySelector('button').onclick = () => row.remove();
          return row;
        };

        init.forEach(tc => list.appendChild(createTcRow(tc)));

        const addTc = document.createElement('button');
        addTc.type = 'button';
        addTc.className = 'sch-card-btn sch-card-btn-questions';
        addTc.style.marginTop = '10px';
        addTc.innerHTML = `<span>+ Add Test Case</span>`;
        addTc.onclick = () => list.appendChild(createTcRow({ input: '', output: '' }));

        codeWrap.append(list, addTc);
        dyn.appendChild(codeWrap);
      }

      if (type === 'DESC') {
        const descWrap = document.createElement('div');
        descWrap.innerHTML = `
          <div style="font-size: 13px; color: #64748b; margin-bottom: 10px;">
            Specify essential keywords expected in student descriptive responses:
          </div>
        `;

        const list = document.createElement('div');
        list.id = 'kw-list';

        const init = Array.isArray(existing?.expected_keywords) && existing.expected_keywords.length
          ? existing.expected_keywords
          : [''];

        const createKwRow = (kw) => {
          const row = document.createElement('div');
          row.className = 'kw-row';
          row.style.display = 'flex';
          row.style.gap = '8px';
          row.style.marginBottom = '8px';
          row.innerHTML = `
            <input type="text" class="kw-input q-form-input" placeholder="Expected keyword..." value="${escapeHtml(kw || '')}" style="flex: 1;">
            <button type="button" class="sch-card-btn sch-card-btn-delete">Remove</button>
          `;
          row.querySelector('button').onclick = () => row.remove();
          return row;
        };

        init.forEach(kw => list.appendChild(createKwRow(kw)));

        const addKw = document.createElement('button');
        addKw.type = 'button';
        addKw.className = 'sch-card-btn sch-card-btn-questions';
        addKw.style.marginTop = '8px';
        addKw.innerHTML = `<span>+ Add Keyword</span>`;
        addKw.onclick = () => list.appendChild(createKwRow(''));

        descWrap.append(list, addKw);
        dyn.appendChild(descWrap);
      }
    }

    renderFields(selType.value);
    selType.onchange = () => renderFields(selType.value);

    // Create modal with fullscreen flag
    const modalEl = createModal(modalId, cont, true);
    modalEl.style.zIndex = '100010';
    const boxEl = modalEl.querySelector('.modal-content');
    if (boxEl) {
      boxEl.style.maxWidth = 'none';
      boxEl.style.width = '100vw';
      boxEl.style.height = '100vh';
      boxEl.style.margin = '0';
      boxEl.style.padding = '0';
      boxEl.style.borderRadius = '0';
      boxEl.style.overflow = 'hidden';
      boxEl.style.display = 'flex';
      boxEl.style.flexDirection = 'column';
    }
    openModal(modalId);

    form.onsubmit = async ev => {
      ev.preventDefault();

      let body = {
        question_text: inText.value,
        type: selType.value,
        marks: Number(inMarks.value),
        negative_mark: Number(inNeg.value) || 0,
        options: [],
        correct_answer: '',
        test_cases: [],
        input_example: '',
        expected_output: '',
        expected_keywords: [],
        min_characters: 0
      };

      if (body.type === 'MCQ') {
        body.options = Array.from(document.querySelectorAll('.mcq-option-input'))
          .map(x => x.value)
          .filter(x => x);
        const sel = document.querySelector('input[name="correct_option"]:checked');
        if (sel) {
          const row = sel.closest('.mcq-opt-row');
          body.correct_answer = row ? row.querySelector('.mcq-option-input').value : '';
        }
      }

      if (body.type === 'TF') {
        body.correct_answer = document.getElementById('tfCorrect')?.value || 'True';
      }

      if (body.type === 'Code') {
        body.input_example = document.getElementById('inputExample')?.value || '';
        body.expected_output = document.getElementById('expectedOutput')?.value || '';
        body.test_cases = Array.from(document.querySelectorAll('.tc-row'))
          .map(tc => ({
            input: tc.querySelector('.tc-input')?.value || '',
            output: tc.querySelector('.tc-output')?.value || ''
          }))
          .filter(tc => tc.input && tc.output);
      }

      if (body.type === 'DESC') {
        body.expected_keywords = Array.from(document.querySelectorAll('.kw-input'))
          .map(x => x.value).filter(x => x);
      }

      const fd = new FormData();
      fd.append('question_text', body.question_text);
      fd.append('type', body.type);
      fd.append('section_tag', sectionInput.value || '');
      fd.append('marks', body.marks);
      fd.append('negative_mark', body.negative_mark);
      fd.append('options', JSON.stringify(body.options || []));
      fd.append('correct_answer', body.correct_answer || '');
      fd.append('test_cases', JSON.stringify(body.test_cases || []));
      fd.append('input_example', body.input_example || '');
      fd.append('expected_output', body.expected_output || '');
      fd.append('expected_keywords', JSON.stringify(body.expected_keywords || []));
      fd.append('min_characters', body.min_characters || 0);

      if (imgInput.files && imgInput.files[0]) {
        fd.append('image', imgInput.files[0]);
      }

      const endpoint = isEdit
        ? urls.updateQuestion
            .replace(placeholder, examId)
            .replace('/1/', `/${questionId}/`)
        : urls.addQuestion.replace(placeholder, examId);

      const r = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': csrfToken },
        body: fd
      });

      const resp = await r.json();

      if (resp.status !== 'success') {
        console.error('Validation errors:', resp.errors);
        const f = resp.errors ? Object.keys(resp.errors)[0] : 'error';
        showToast(resp.message || `${f}: ${resp.errors?.[f]?.join(', ') || 'Invalid data'}`, false);
        return;
      }

      showToast(resp.message, true);
      closeModal(modalId);
      if (parentModalId) {
        closeModal(parentModalId);
        openQuestionsModal(examId);
      }
      renderExamTable();
    };
  }

  // ─── SEARCH: client-side filtering for both tables ──────────────────────────
  // Debounce helper
  function debounce(fn, wait = 250) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // filterTable: finds rows in tbody and shows/hides them based on query
  function filterTable(tableEl, query) {
    if (!tableEl) return;
    const tbody = tableEl.tBodies[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows).filter(r => !r.classList.contains('no-results-row'));
    const q = String(query || '').trim().toLowerCase();

    // Reset if query empty
    if (!q) {
      rows.forEach(r => {
        r.style.display = '';
        r.classList.remove('search-match');
      });
      const existingNo = tbody.querySelector('.no-results-row');
      if (existingNo) existingNo.remove();
      return;
    }

    let visible = 0;
    rows.forEach(r => {
      // Some placeholder rows might have a single td with colspan; hide them before search
      if (r.querySelectorAll('td').length === 1 && r.querySelector('td').colSpan > 1) {
        r.style.display = 'none';
        return;
      }
      const text = Array.from(r.cells).map(td => td.textContent || '').join(' ').toLowerCase();
      const matches = text.indexOf(q) !== -1;
      r.style.display = matches ? '' : 'none';
      if (matches) {
        visible++;
        r.classList.add('search-match');
      } else {
        r.classList.remove('search-match');
      }
    });

    // Show "No matching results" if none visible
    const existingNo = tbody.querySelector('.no-results-row');
    if (visible === 0 && !existingNo) {
      const noRow = document.createElement('tr');
      noRow.className = 'no-results-row';
      const colCount = tableEl.tHead ? tableEl.tHead.rows[0].cells.length : 1;
      const td = document.createElement('td');
      td.colSpan = colCount;
      td.textContent = 'No matching results.';
      td.className = 'muted';
      noRow.appendChild(td);
      tbody.appendChild(noRow);
    } else if (visible > 0 && existingNo) {
      existingNo.remove();
    }
  }

  // Attach search controls after rendering tables
  function attachSearchControls() {
    const examInput = document.getElementById('examSearchInput');
    const scheduledInput = document.getElementById('scheduledSearchInput');

    const filterCards = (container, q, emptyLabel = 'exams') => {
      if (!container) return;
      const cards = container.querySelectorAll('.scheduled-exam-card');
      let visible = 0;
      cards.forEach(card => {
        if (!q) {
          card.style.display = '';
          visible++;
          return;
        }
        const text = (card.textContent || '').toLowerCase();
        const matches = text.includes(q);
        card.style.display = matches ? '' : 'none';
        if (matches) visible++;
      });
      let emptyMsg = container.querySelector('.sch-no-results');
      if (visible === 0) {
        if (!emptyMsg) {
          emptyMsg = document.createElement('div');
          emptyMsg.className = 'sch-no-results';
          emptyMsg.textContent = `No matching ${emptyLabel} found.`;
          container.appendChild(emptyMsg);
        }
      } else if (emptyMsg) {
        emptyMsg.remove();
      }
    };

    const doSearch = (raw) => {
      const v = String(raw || '').trim().toLowerCase();
      const examCards = document.getElementById('examCardsContainer');
      const examTable = document.getElementById('examTable');
      const scheduledCards = document.getElementById('scheduledCardsContainer');
      const scheduledTable = document.getElementById('scheduledExamTable');

      try {
        if (examCards) filterCards(examCards, v, 'exams');
        else if (examTable) filterTable(examTable, v);
      } catch (e) { console.error(e); }

      try {
        if (scheduledCards) filterCards(scheduledCards, v, 'scheduled exams');
        else if (scheduledTable) filterTable(scheduledTable, v);
      } catch (e) { console.error(e); }
    };

    const debounced = debounce((ev) => doSearch(ev.target.value), 200);

    if (examInput && !examInput.dataset.searchAttached) {
      examInput.dataset.searchAttached = 'true';
      examInput.addEventListener('input', debounced);
      examInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { examInput.value = ''; doSearch(''); }
      });
    }
    if (scheduledInput && !scheduledInput.dataset.searchAttached) {
      scheduledInput.dataset.searchAttached = 'true';
      scheduledInput.addEventListener('input', debounced);
      scheduledInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { scheduledInput.value = ''; doSearch(''); }
      });
    }

    // Also support typing in either box to search both tables (synchronized)
    [examInput, scheduledInput].forEach(inp => {
      if (!inp || inp.dataset.syncAttached) return;
      inp.dataset.syncAttached = 'true';
      inp.addEventListener('input', function (ev) {
        const val = ev.target.value;
        // mirror value to other input to give consistent UX
        [examInput, scheduledInput].forEach(other => { if (other && other !== ev.target) other.value = val; });
      });
    });

    // inject minimal style for matches if not present
   // OK CSP-safe version: styles are handled in admin_assessment.css now
if (!document.getElementById('assessment-search-style')) {
  console.debug('[CSP] Inline style injection skipped — handled via external CSS.');
}


  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  renderAssessmentPage();
});