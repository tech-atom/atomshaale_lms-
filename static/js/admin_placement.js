// static/js/admin_placement.js
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ─── DOM Elements & Configurations ──────────────────────────────────────────
  const apiDiv = document.getElementById('placement-api-urls');
  if (!apiDiv) return;
  const urls = {
    getCompanyQuestions: apiDiv.dataset.getCompanyQuestions,
    addCompanyQuestion: apiDiv.dataset.addCompanyQuestion,
    updateCompanyQuestion: apiDiv.dataset.updateCompanyQuestion,
    deleteCompanyQuestion: apiDiv.dataset.deleteCompanyQuestion,
    bulkUpload: apiDiv.dataset.bulkUpload,
    downloadTemplate: apiDiv.dataset.downloadTemplate,
    addCompany: apiDiv.dataset.addCompany,
    editCompany: apiDiv.dataset.editCompany,
    deleteCompany: apiDiv.dataset.deleteCompany,
    getGeneralQuestions: apiDiv.dataset.getGeneralQuestions,
    importQuestionBank: apiDiv.dataset.importQuestionBank,
    saveRounds: apiDiv.dataset.saveRounds,
    scheduleAssessment: apiDiv.dataset.scheduleAssessment
  };

  const placeholder = '00000000-0000-0000-0000-000000000000';
  const csrfToken = (() => {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  })();

  // Active state variables
  let currentCompanyName = null;
  let currentCompanyId = null;
  let currentPaperObj = null;

  // Question counts inside database for currently selected year
  let round1UploadedCount = 0;
  let round2UploadedCount = 0;

  // ─── Modals helper ──────────────────────────────────────────────────────────
  function openModal(id) {
    const e = document.getElementById(id);
    if (e) {
      e.style.display = 'flex';
      setTimeout(() => e.classList.add('modal-show'), 10);
      document.body.classList.add('modal-open');
    }
  }

  function closeModal(id) {
    const e = document.getElementById(id);
    if (e) {
      e.classList.remove('modal-show');
      setTimeout(() => { e.style.display = 'none'; }, 250);
      document.body.classList.remove('modal-open');
    }
  }

  // Escape key closes open modals
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal.modal-show');
      openModals.forEach(m => closeModal(m.id));
    }
  });

  // Close modals when clicking outside modal content
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', function(e) {
      if (e.target === m) {
        closeModal(m.id);
      }
    });
  });

  // Close buttons setup
  const closeButtons = [
    { btn: 'close-company-step1', modal: 'company-modal-step1' },
    { btn: 'cancel-company-step1', modal: 'company-modal-step1' },
    { btn: 'close-year-step2', modal: 'year-modal-step2' },
    { btn: 'cancel-year-step2', modal: 'year-modal-step2' },
    { btn: 'close-import-bank', modal: 'import-bank-modal' },
    { btn: 'cancel-import-bank', modal: 'import-bank-modal' },
    { btn: 'close-schedule', modal: 'schedule-modal' },
    { btn: 'cancel-schedule', modal: 'schedule-modal' },
    { btn: 'close-bulk-upload', modal: 'bulk-upload-modal' },
    { btn: 'cancel-bulk-upload', modal: 'bulk-upload-modal' },
    { btn: 'close-questions-list', modal: 'questions-list-modal' },
    { btn: 'close-single-question', modal: 'single-question-modal' },
    { btn: 'cancel-single-question', modal: 'single-question-modal' },
    { btn: 'close-edit-year', modal: 'edit-year-modal' },
    { btn: 'cancel-edit-year', modal: 'edit-year-modal' }
  ];
  closeButtons.forEach(cfg => {
    const btnEl = document.getElementById(cfg.btn);
    if (btnEl) btnEl.onclick = () => closeModal(cfg.modal);
  });

  // ─── Toast System ───────────────────────────────────────────────────────────
  function showToast(msg, success = true) {
    const t = document.getElementById('assessment-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast';
    t.classList.add(success ? 'toast-success' : 'toast-error');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  // ─── Step 1: Add Company ───────────────────────────────────────────────────
  const addCompanyBtn = document.getElementById('btn-add-company');
  const companyForm1 = document.getElementById('company-step1-form');
  if (addCompanyBtn) {
    addCompanyBtn.onclick = () => {
      companyForm1.reset();
      openModal('company-modal-step1');
    };
  }
  if (companyForm1) {
    companyForm1.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(companyForm1);
      fd.append('ajax', 'true');
      const submitBtn = document.getElementById('btn-save-step1');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      try {
        const response = await fetch(urls.addCompany, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          body: fd,
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('company-modal-step1');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Company';
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to save company', false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Company';
      }
    };
  }

  // ─── Step 2: Add Year Paper ────────────────────────────────────────────────
  const addYearBtn = document.getElementById('btn-add-year');
  const yearForm2 = document.getElementById('year-step2-form');
  if (addYearBtn) {
    addYearBtn.onclick = () => {
      yearForm2.reset();
      document.getElementById('year-modal-title').textContent = `Add Year Paper for ${currentCompanyName}`;
      openModal('year-modal-step2');
    };
  }
  if (yearForm2) {
    yearForm2.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(yearForm2);
      fd.append('name', currentCompanyName);
      fd.append('ajax', 'true');
      const submitBtn = document.getElementById('btn-save-step2');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      try {
        const response = await fetch(urls.addCompany, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          body: fd,
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('year-modal-step2');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Paper';
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to add year paper', false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Paper';
      }
    };
  }

  // ─── Edit Year Paper Details ───────────────────────────────────────────────
  window.openEditYearModal = function() {
    if (!currentPaperObj) return;
    document.getElementById('edit-paper-year').value = currentPaperObj.year || '';
    document.getElementById('edit-paper-role').value = currentPaperObj.job_role || 'General';
    document.getElementById('edit-paper-package').value = currentPaperObj.package || 'N/A';
    document.getElementById('edit-paper-place').value = currentPaperObj.place || 'N/A';
    openModal('edit-year-modal');
  };

  const editYearForm = document.getElementById('edit-year-form');
  if (editYearForm) {
    editYearForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!currentPaperObj) return;
      const fd = new FormData(editYearForm);
      fd.append('name', currentCompanyName);
      fd.append('ajax', 'true');
      const submitBtn = document.getElementById('btn-save-edit-year');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      
      const baseEditUrl = urls.editCompany || '/company-prep/admin-manage/company/edit/00000000-0000-0000-0000-000000000000/';
      const editUrl = baseEditUrl.replace('00000000-0000-0000-0000-000000000000', currentPaperObj.id);

      try {
        const response = await fetch(editUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          body: fd,
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('edit-year-modal');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Changes';
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to save paper details', false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
    };
  }

  // ─── Selection Logic ───────────────────────────────────────────────────────
  window.selectCompany = function(name, element) {
    document.querySelectorAll('.company-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');

    currentCompanyName = name;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('workspace-state').style.display = 'flex';
    document.getElementById('workspace-company-name').textContent = name;

    const logoContainer = document.getElementById('workspace-logo-container');
    const logoUrl = element.dataset.logo;
    if (logoUrl) {
      logoContainer.innerHTML = `<img src="${logoUrl}" alt="${name}" style="width: 44px; height: 44px; object-fit: contain; border-radius: 8px; border: 1px solid #e2e8f0; padding: 2px; background: #ffffff;">`;
    } else {
      logoContainer.innerHTML = `<div style="width: 44px; height: 44px; border-radius: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #008037; font-size: 1.2rem;">${name.slice(0,1).toUpperCase()}</div>`;
    }

    renderYearsGrid(name);
  };

  function getYearSemLabel(p) {
    return p.year ? p.year + ' Paper' : 'General Prep';
  }

  function renderYearsGrid(companyName) {
    const grid = document.getElementById('workspace-years-grid');
    grid.innerHTML = '';
    const papers = companyYearPapers[companyName] || [];
    
    // Sort papers descending by year
    papers.sort((a, b) => (b.year || 0) - (a.year || 0));

    papers.forEach((p, idx) => {
      if (p.year === null) return; // skip company stub without year
      const pill = document.createElement('div');
      pill.className = 'year-pill';
      pill.textContent = getYearSemLabel(p);
      pill.onclick = () => selectYearPaper(p, pill);
      grid.appendChild(pill);
      
      // Auto-select first year
      if (idx === 0) {
        selectYearPaper(p, pill);
      }
    });

    if (papers.length === 0 || (papers.length === 1 && papers[0].year === null)) {
      grid.innerHTML = `<span style="font-size: 0.85rem; color: #64748b; font-style: italic;">No years configured yet. Click "+ Add Year Paper" to configure one.</span>`;
      document.getElementById('year-workspace').style.display = 'none';
    }
  }

  window.selectYearPaper = function(paperObj, pillElement) {
    document.querySelectorAll('.year-pill').forEach(p => p.classList.remove('active'));
    pillElement.classList.add('active');

    currentPaperObj = paperObj;
    currentCompanyId = paperObj.id;
    document.getElementById('year-workspace').style.display = 'flex';

    // Populate metadata labels
    document.getElementById('workspace-paper-role').textContent = paperObj.job_role || 'General';
    document.getElementById('workspace-paper-package').textContent = paperObj.package || 'N/A';
    document.getElementById('workspace-paper-place').textContent = paperObj.place || 'N/A';
    
    // Update Edit Details link
    const baseEditUrl = urls.editCompany || '/company-prep/admin/company/edit/00000000-0000-0000-0000-000000000000/';
    document.getElementById('workspace-paper-edit-link').href = baseEditUrl.replace('00000000-0000-0000-0000-000000000000', paperObj.id);

    // Populate Rounds configuration
    document.getElementById('chk-round1').checked = paperObj.round1_active;
    document.getElementById('round1-name').value = paperObj.round1_name || 'Quantitative, Logical & Verbal Aptitude';
    document.getElementById('round1-duration').value = paperObj.round1_duration || 30;
    
    // Max Marks corresponds to round1_questions
    const r1q = paperObj.round1_questions || 30;
    document.getElementById('round1-questions').value = r1q;
    // Passing Marks corresponds to passing_pct * questions / 100
    const r1p = paperObj.round1_passing || 60;
    document.getElementById('round1-passing').value = Math.round(r1p * r1q / 100);

    document.getElementById('chk-round2').checked = paperObj.round2_active;
    document.getElementById('round2-name').value = paperObj.round2_name || 'Technical Assessment';
    document.getElementById('round2-format').value = paperObj.round2_format || 'MCQ';
    document.getElementById('round2-duration').value = paperObj.round2_duration || 60;
    
    // Max Marks corresponds to round2_questions
    const r2q = paperObj.round2_questions || 40;
    document.getElementById('round2-questions').value = r2q;
    // Passing Marks corresponds to passing_pct * questions / 100
    const r2p = paperObj.round2_passing || 60;
    document.getElementById('round2-passing').value = Math.round(r2p * r2q / 100);

    // Toggle collapses
    toggleRoundCollapse('round1');
    toggleRoundCollapse('round2');

    // Fetch live counts and compute thresholds
    fetchQuestionsCount(paperObj.id);

    // Setup delete button action
    const deleteBtn = document.getElementById('btn-delete-year');
    deleteBtn.onclick = async () => {
      if (!confirm(`Are you sure you want to delete the ${currentCompanyName} (${paperObj.year}) paper?`)) return;
      const deleteUrl = urls.deleteCompany.replace(placeholder, paperObj.id) + '?ajax=true';
      try {
        const response = await fetch(deleteUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin'
        });
        const res = await response.json();
        showToast(res.message, res.status === 'success');
        if (res.status === 'success') {
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to delete year paper', false);
      }
    };
  };

  window.toggleRoundCollapse = function(roundKey) {
    const isChecked = document.getElementById(`chk-${roundKey}`).checked;
    const area = document.getElementById(`${roundKey}-config-area`);
    if (area) {
      area.style.display = isChecked ? 'block' : 'none';
    }
    checkRoundQuestionThresholds();
  };

  // ─── Step 3: AJAX Rounds config save ───────────────────────────────────────
  const roundsForm = document.getElementById('rounds-config-form');
  if (roundsForm) {
    roundsForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveUrl = urls.saveRounds.replace(placeholder, currentCompanyId);
      const r1Questions = parseInt(document.getElementById('round1-questions').value) || 30;
      const r1PassingMarks = parseInt(document.getElementById('round1-passing').value) || 18;
      const r1PassingPct = Math.min(100, Math.max(1, Math.round(r1PassingMarks / r1Questions * 100)));

      const r2Questions = parseInt(document.getElementById('round2-questions').value) || 40;
      const r2PassingMarks = parseInt(document.getElementById('round2-passing').value) || 24;
      const r2PassingPct = Math.min(100, Math.max(1, Math.round(r2PassingMarks / r2Questions * 100)));

      const payload = {
        round1_active: document.getElementById('chk-round1').checked,
        round1_name: document.getElementById('round1-name').value,
        round1_duration: parseInt(document.getElementById('round1-duration').value),
        round1_questions: r1Questions,
        round1_passing_pct: r1PassingPct,

        round2_active: document.getElementById('chk-round2').checked,
        round2_name: document.getElementById('round2-name').value,
        round2_technical_format: document.getElementById('round2-format').value,
        round2_duration: parseInt(document.getElementById('round2-duration').value),
        round2_questions: r2Questions,
        round2_passing_pct: r2PassingPct
      };

      const submitBtn = document.getElementById('btn-save-rounds-config');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const response = await fetch(saveUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          // Update local details object
          currentPaperObj.round1_active = payload.round1_active;
          currentPaperObj.round1_name = payload.round1_name;
          currentPaperObj.round1_duration = payload.round1_duration;
          currentPaperObj.round1_questions = payload.round1_questions;
          currentPaperObj.round1_passing = payload.round1_passing_pct;
          currentPaperObj.round2_active = payload.round2_active;
          currentPaperObj.round2_name = payload.round2_name;
          currentPaperObj.round2_format = payload.round2_technical_format;
          currentPaperObj.round2_duration = payload.round2_duration;
          currentPaperObj.round2_questions = payload.round2_questions;
          currentPaperObj.round2_passing = payload.round2_passing_pct;
          
          checkRoundQuestionThresholds();
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to save rounds settings', false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Rounds Settings';
      }
    };
  }

  // ─── Fetch questions and update badges ─────────────────────────────────────
  async function fetchQuestionsCount(companyId) {
    const fetchUrl = urls.getCompanyQuestions.replace(placeholder, companyId);
    try {
      const r = await fetch(fetchUrl, { credentials: 'same-origin' });
      const data = await r.json();
      if (data.status === 'success') {
        const questions = data.questions || [];
        round1UploadedCount = questions.filter(q => q.category === 'aptitude').length;
        round2UploadedCount = questions.filter(q => q.category === 'technical').length;
        
        document.getElementById('round1-status-q').textContent = `${round1UploadedCount} Qs Configured`;
        document.getElementById('round2-status-q').textContent = `${round2UploadedCount} Qs Configured`;

        checkRoundQuestionThresholds();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ─── Thresholds & Schedule Completeness Validator ──────────────────────────
  window.checkRoundQuestionThresholds = function() {
    const r1Active = document.getElementById('chk-round1').checked;
    const r2Active = document.getElementById('chk-round2').checked;

    const r1Target = parseInt(document.getElementById('round1-questions').value) || 0;
    const r2Target = parseInt(document.getElementById('round2-questions').value) || 0;

    let completenessMsgs = [];
    let complete = true;

    if (!r1Active && !r2Active) {
      complete = false;
      completenessMsgs.push('Please activate at least one round.');
    } else {
      if (r1Active) {
        if (round1UploadedCount < r1Target) {
          completenessMsgs.push(`Round 1 needs ${r1Target - round1UploadedCount} more questions (Has ${round1UploadedCount}/${r1Target}).`);
        } else {
          completenessMsgs.push(`Round 1 Completed (${round1UploadedCount}/${r1Target}).`);
        }
      }
      if (r2Active) {
        if (round2UploadedCount < r2Target) {
          completenessMsgs.push(`Round 2 needs ${r2Target - round2UploadedCount} more questions (Has ${round2UploadedCount}/${r2Target}).`);
        } else {
          completenessMsgs.push(`Round 2 Completed (${round2UploadedCount}/${r2Target}).`);
        }
      }
    }

    const textEl = document.getElementById('rounds-completeness-text');
    textEl.innerHTML = completenessMsgs.join('<br>');
    textEl.style.color = complete ? '#16a34a' : '#ef4444';

    const scheduleBtn = document.getElementById('btn-schedule-trigger');
    const scheduleSummary = document.getElementById('schedule-summary-text');
    const schedulePanel = document.getElementById('scheduling-panel');

    if (complete) {
      scheduleBtn.disabled = false;
      schedulePanel.style.borderLeftColor = '#22c55e';
      if (currentPaperObj && currentPaperObj.is_published) {
        scheduleSummary.textContent = 'Assessment Scheduled and Published!';
        scheduleSummary.style.color = '#16a34a';
      } else {
        scheduleSummary.textContent = 'Rounds complete. Assessment ready to schedule!';
        scheduleSummary.style.color = '#0284c7';
      }
    } else {
      scheduleBtn.disabled = true;
      schedulePanel.style.borderLeftColor = '#facc15';
      scheduleSummary.textContent = 'Assessment incomplete. Complete Round questions thresholds to enable scheduling.';
      scheduleSummary.style.color = '#dc2626';
    }
  };

  // ─── Step 4: Schedule Assessment Modal ─────────────────────────────────────
  window.openScheduleModal = function() {
    if (!currentPaperObj) return;

    document.getElementById('schedule-company').value = currentCompanyName;
    document.getElementById('schedule-year').value = currentPaperObj.year;

    // Prefill targets
    document.getElementById('schedule-college').value = currentPaperObj.college_id || '';
    document.getElementById('schedule-course').value = currentPaperObj.course_id || '';
    document.getElementById('schedule-semester').value = currentPaperObj.semester || '';
    document.getElementById('schedule-section').value = currentPaperObj.section || 'all';

    document.getElementById('schedule-start-dt').value = currentPaperObj.start_dt || '';
    document.getElementById('schedule-end-dt').value = currentPaperObj.end_dt || '';

    document.getElementById('schedule-max-attempts').value = currentPaperObj.max_attempts || 1;
    document.getElementById('schedule-negative').checked = currentPaperObj.negative_marking;
    document.getElementById('schedule-shuffle-q').checked = currentPaperObj.shuffle_questions;
    document.getElementById('schedule-shuffle-o').checked = currentPaperObj.shuffle_options;
    // If college_id is not set, it's a new schedule, default publish to true. Otherwise, respect saved is_published state.
    if (currentPaperObj.college_id || currentPaperObj.start_dt || currentPaperObj.end_dt) {
      document.getElementById('schedule-publish').checked = currentPaperObj.is_published;
    } else {
      document.getElementById('schedule-publish').checked = true;
    }

    openModal('schedule-modal');
  };

  const scheduleForm = document.getElementById('schedule-config-form');
  if (scheduleForm) {
    scheduleForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveUrl = urls.scheduleAssessment.replace(placeholder, currentCompanyId);
      const payload = {
        college: document.getElementById('schedule-college').value,
        course: document.getElementById('schedule-course').value,
        semester: document.getElementById('schedule-semester').value,
        section: document.getElementById('schedule-section').value,
        start_datetime: document.getElementById('schedule-start-dt').value,
        end_datetime: document.getElementById('schedule-end-dt').value,
        max_attempts: parseInt(document.getElementById('schedule-max-attempts').value),
        negative_marking: document.getElementById('schedule-negative').checked,
        shuffle_questions: document.getElementById('schedule-shuffle-q').checked,
        shuffle_options: document.getElementById('schedule-shuffle-o').checked,
        is_published: document.getElementById('schedule-publish').checked,
        year: parseInt(document.getElementById('schedule-year').value)
      };

      const submitBtn = document.getElementById('btn-save-schedule');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Scheduling...';

      try {
        const response = await fetch(saveUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('schedule-modal');
          // Update local details object
          currentPaperObj.college_id = payload.college;
          currentPaperObj.course_id = payload.course;
          currentPaperObj.semester = payload.semester;
          currentPaperObj.section = payload.section;
          currentPaperObj.start_dt = payload.start_datetime;
          currentPaperObj.end_dt = payload.end_datetime;
          currentPaperObj.max_attempts = payload.max_attempts;
          currentPaperObj.negative_marking = payload.negative_marking;
          currentPaperObj.shuffle_questions = payload.shuffle_questions;
          currentPaperObj.shuffle_options = payload.shuffle_options;
          currentPaperObj.is_published = payload.is_published;
          currentPaperObj.year = payload.year;

          // Re-render years grid to show changed year
          renderYearsGrid(currentCompanyName);

          checkRoundQuestionThresholds();
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to schedule assessment', false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Schedule & Publish';
      }
    };
  }

  // ─── Excel Bulk Upload ─────────────────────────────────────────────────────
  window.openBulkUploadModal = function(category) {
    document.getElementById('bulk-upload-excel-form').reset();
    document.getElementById('bulk-upload-category').value = category;
    openModal('bulk-upload-modal');
  };

  const bulkUploadForm = document.getElementById('bulk-upload-excel-form');
  if (bulkUploadForm) {
    bulkUploadForm.onsubmit = async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('bulk-excel-file');
      if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an Excel file.');
        return;
      }

      const category = document.getElementById('bulk-upload-category').value;
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('company', currentCompanyId);
      fd.append('category', category);

      const submitBtn = document.getElementById('btn-submit-bulk-upload');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';

      try {
        const response = await fetch(urls.bulkUpload, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken },
          body: fd,
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('bulk-upload-modal');
          fetchQuestionsCount(currentCompanyId);
        }
      } catch (err) {
        console.error(err);
        showToast('Upload failed', false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload File';
      }
    };
  }

  // ─── Import from Question Bank Modal ───────────────────────────────────────
  let loadedBankQuestions = [];
  let bankImportCategory = null;

  window.openImportQuestionModal = async function(category) {
    bankImportCategory = category;
    document.getElementById('import-bank-title').textContent = `Import ${category === 'aptitude' ? 'Aptitude' : 'Technical'} Questions`;
    document.getElementById('import-bank-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem;">Loading bank questions...</td></tr>';
    document.getElementById('bank-search').value = '';
    document.getElementById('chk-bank-select-all').checked = false;
    document.getElementById('bank-selected-count').textContent = '0 questions selected';
    
    openModal('import-bank-modal');

    const getUrl = urls.getGeneralQuestions.replace(placeholder, currentCompanyId).replace('qcat', category);
    try {
      const response = await fetch(getUrl, { credentials: 'same-origin' });
      const data = await response.json();
      if (data.status === 'success') {
        loadedBankQuestions = data.questions || [];
        renderBankQuestionsList(loadedBankQuestions);
      } else {
        document.getElementById('import-bank-tbody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 1.5rem;">${data.message}</td></tr>`;
      }
    } catch (err) {
      console.error(err);
      document.getElementById('import-bank-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 1.5rem;">Failed to fetch questions.</td></tr>';
    }
  };

  function renderBankQuestionsList(questions) {
    const tbody = document.getElementById('import-bank-tbody');
    tbody.innerHTML = '';
    if (questions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: #64748b;">No available questions in bank to import.</td></tr>';
      return;
    }

    questions.forEach(q => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #cbd5e1';

      const chkTd = document.createElement('td');
      chkTd.style.padding = '0.5rem 1rem';
      chkTd.style.textAlign = 'center';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'chk-bank-item';
      chk.value = q.id;
      chk.onchange = updateBankSelectedCount;
      chkTd.appendChild(chk);
      tr.appendChild(chkTd);

      const topicTd = document.createElement('td');
      topicTd.style.padding = '0.5rem 1rem';
      topicTd.style.fontWeight = '600';
      topicTd.textContent = q.topic || '-';
      tr.appendChild(topicTd);

      const metaTd = document.createElement('td');
      metaTd.style.padding = '0.5rem 1rem';
      metaTd.textContent = q.difficulty || q.branch || q.type;
      tr.appendChild(metaTd);

      const textTd = document.createElement('td');
      textTd.style.padding = '0.5rem 1rem';
      textTd.textContent = q.question_text;
      tr.appendChild(textTd);

      tbody.appendChild(tr);
    });
  }

  window.filterBankQuestionsList = function() {
    const val = document.getElementById('bank-search').value.toLowerCase();
    const filtered = loadedBankQuestions.filter(q => 
      (q.topic && q.topic.toLowerCase().includes(val)) || 
      (q.question_text && q.question_text.toLowerCase().includes(val))
    );
    renderBankQuestionsList(filtered);
  };

  window.toggleSelectAllBankQuestions = function(headerChk) {
    document.querySelectorAll('.chk-bank-item').forEach(chk => {
      chk.checked = headerChk.checked;
    });
    updateBankSelectedCount();
  };

  function updateBankSelectedCount() {
    const count = document.querySelectorAll('.chk-bank-item:checked').length;
    document.getElementById('bank-selected-count').textContent = `${count} questions selected`;
  }

  window.submitImportFromBank = async function() {
    const checked = Array.from(document.querySelectorAll('.chk-bank-item:checked')).map(chk => chk.value);
    if (checked.length === 0) {
      alert('Please select at least one question to import.');
      return;
    }

    const importUrl = urls.importQuestionBank.replace(placeholder, currentCompanyId);
    const payload = {
      category: bankImportCategory,
      question_ids: checked
    };

    const importBtn = document.getElementById('btn-submit-import');
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    try {
      const response = await fetch(importUrl, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
      const d = await response.json();
      showToast(d.message, d.status === 'success');
      if (d.status === 'success') {
        closeModal('import-bank-modal');
        fetchQuestionsCount(currentCompanyId);
      }
    } catch (err) {
      console.error(err);
      showToast('Import failed', false);
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Import Selected';
    }
  };

  // ─── Questions List Viewer Modal ───────────────────────────────────────────
  let loadedCompanyQuestions = [];
  let questionsViewerCategory = null;

  window.manageQuestionsList = async function(category) {
    questionsViewerCategory = category;
    document.getElementById('questions-list-title').textContent = `${currentCompanyName} (${currentPaperObj.year}) - ${category === 'aptitude' ? 'Aptitude' : 'Technical'} Questions`;
    document.getElementById('questions-list-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem;">Loading questions...</td></tr>';
    document.getElementById('questions-list-search').value = '';
    
    openModal('questions-list-modal');

    const fetchUrl = urls.getCompanyQuestions.replace(placeholder, currentCompanyId);
    try {
      const response = await fetch(fetchUrl, { credentials: 'same-origin' });
      const data = await response.json();
      if (data.status === 'success') {
        const allQuestions = data.questions || [];
        loadedCompanyQuestions = allQuestions.filter(q => q.category === category);
        renderQuestionsViewerList(loadedCompanyQuestions);
      } else {
        document.getElementById('questions-list-tbody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 1.5rem;">${data.message}</td></tr>`;
      }
    } catch (err) {
      console.error(err);
      document.getElementById('questions-list-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 1.5rem;">Failed to fetch questions.</td></tr>';
    }
  };

  function renderQuestionsViewerList(questions) {
    const tbody = document.getElementById('questions-list-tbody');
    tbody.innerHTML = '';
    if (questions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: #64748b;">No questions added to this round yet.</td></tr>';
      return;
    }

    questions.forEach(q => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #cbd5e1';

      const topicTd = document.createElement('td');
      topicTd.style.padding = '0.5rem 1rem';
      topicTd.style.fontWeight = '600';
      topicTd.textContent = q.topic || '-';
      tr.appendChild(topicTd);

      const metaTd = document.createElement('td');
      metaTd.style.padding = '0.5rem 1rem';
      metaTd.textContent = q.difficulty || q.branch || q.type;
      tr.appendChild(metaTd);

      const textTd = document.createElement('td');
      textTd.style.padding = '0.5rem 1rem';
      textTd.textContent = q.question_text.length > 100 ? q.question_text.slice(0, 100) + '...' : q.question_text;
      tr.appendChild(textTd);

      const actTd = document.createElement('td');
      actTd.style.padding = '0.5rem 1rem';
      actTd.style.textAlign = 'right';
      
      const eb = document.createElement('button');
      eb.className = 'btn-action btn-action-gray';
      eb.textContent = 'Edit';
      eb.style.padding = '0.25rem 0.5rem';
      eb.style.fontSize = '0.75rem';
      eb.style.marginRight = '4px';
      eb.onclick = () => {
        closeModal('questions-list-modal');
        openEditQuestionModal(q);
      };

      const db = document.createElement('button');
      db.className = 'btn-action btn-action-danger';
      db.textContent = 'Delete';
      db.style.padding = '0.25rem 0.5rem';
      db.style.fontSize = '0.75rem';
      db.onclick = async () => {
        if (!confirm('Are you sure you want to delete this question?')) return;
        const deleteUrl = urls.deleteCompanyQuestion
          .replace(placeholder, currentCompanyId)
          .replace('qtype', category)
          .replace('00000000-0000-0000-0000-000000000000', q.id);

        try {
          const res = await fetch(deleteUrl, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            credentials: 'same-origin'
          });
          const d = await res.json();
          showToast(d.message, d.status === 'success');
          if (d.status === 'success') {
            closeModal('questions-list-modal');
            fetchQuestionsCount(currentCompanyId);
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to delete question', false);
        }
      };

      actTd.append(eb, db);
      tr.appendChild(actTd);
      tbody.appendChild(tr);
    });
  }

  window.filterQuestionsViewerList = function() {
    const val = document.getElementById('questions-list-search').value.toLowerCase();
    const filtered = loadedCompanyQuestions.filter(q => 
      (q.topic && q.topic.toLowerCase().includes(val)) || 
      (q.question_text && q.question_text.toLowerCase().includes(val))
    );
    renderQuestionsViewerList(filtered);
  };

  // ─── Dynamic Test Cases Inputs Helper ──────────────────────────────────────
  window.addTestCaseRow = function(inputVal = '', outputVal = '') {
    const container = document.getElementById('q-form-testcases-list');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'testcase-row';
    row.style.display = 'flex';
    row.style.gap = '0.5rem';
    row.style.alignItems = 'center';
    const isCode = document.getElementById('q-form-type').value === 'Code';
    row.innerHTML = `
      <input type="text" class="form-control tc-input" placeholder="Input" ${isCode ? 'required' : ''} style="flex: 1; padding: 0.4rem; font-size: 0.8rem;" value="${inputVal}">
      <input type="text" class="form-control tc-output" placeholder="Expected Output" ${isCode ? 'required' : ''} style="flex: 1; padding: 0.4rem; font-size: 0.8rem;" value="${outputVal}">
      <button type="button" class="btn-action btn-action-danger" onclick="removeTestCaseRow(this)" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;">Remove</button>
    `;
    container.appendChild(row);
  };

  window.removeTestCaseRow = function(btn) {
    const r = btn.closest('.testcase-row');
    if (r) r.remove();
  };

  // ─── Single Question Add / Edit Form Modal ─────────────────────────────────
  const questionForm = document.getElementById('single-question-form');
  
  window.openAddQuestionModal = function(category) {
    questionForm.reset();
    document.getElementById('q-form-id').value = '';
    document.getElementById('q-form-category').value = category;
    document.getElementById('single-question-title').textContent = `Add ${category === 'aptitude' ? 'Aptitude' : 'Technical'} Question`;
    
    // Clear dynamic test cases and add one empty row
    const container = document.getElementById('q-form-testcases-list');
    if (container) container.innerHTML = '';
    addTestCaseRow('', '');

    // Toggle difficulty vs branch visibility
    if (category === 'aptitude') {
      document.getElementById('q-form-diff-wrapper').style.display = 'block';
      document.getElementById('q-form-branch-wrapper').style.display = 'none';
      document.getElementById('q-form-type-code-opt').style.display = 'none';
    } else {
      document.getElementById('q-form-diff-wrapper').style.display = 'none';
      document.getElementById('q-form-branch-wrapper').style.display = 'block';
      document.getElementById('q-form-type-code-opt').style.display = 'block';
    }

    toggleQFormFields('MCQ');
    openModal('single-question-modal');
  };

  window.openEditQuestionModal = function(q) {
    questionForm.reset();
    document.getElementById('q-form-id').value = q.id;
    document.getElementById('q-form-category').value = q.category;
    document.getElementById('single-question-title').textContent = `Edit Question`;
    
    document.getElementById('q-form-topic').value = q.topic || '';
    document.getElementById('q-form-text').value = q.question_text || '';
    document.getElementById('q-form-type').value = q.type || 'MCQ';
    document.getElementById('q-form-correct').value = q.correct_answer || '';
    document.getElementById('q-form-explanation').value = q.explanation || '';

    // Clear dynamic test cases
    const container = document.getElementById('q-form-testcases-list');
    if (container) container.innerHTML = '';

    if (q.category === 'aptitude') {
      document.getElementById('q-form-diff-wrapper').style.display = 'block';
      document.getElementById('q-form-branch-wrapper').style.display = 'none';
      document.getElementById('q-form-type-code-opt').style.display = 'none';
      document.getElementById('q-form-difficulty').value = q.difficulty || 'Medium';
      addTestCaseRow('', '');
    } else {
      document.getElementById('q-form-diff-wrapper').style.display = 'none';
      document.getElementById('q-form-branch-wrapper').style.display = 'block';
      document.getElementById('q-form-type-code-opt').style.display = 'block';
      document.getElementById('q-form-branch').value = q.branch || 'CSE';
      
      if (q.type === 'Code') {
        document.getElementById('q-form-input-example').value = q.input_example || '';
        document.getElementById('q-form-expected-output').value = q.expected_output || '';
        
        let tcs = [];
        if (q.test_cases) {
          if (typeof q.test_cases === 'string') {
            try { tcs = JSON.parse(q.test_cases); } catch(e) {}
          } else {
            tcs = q.test_cases;
          }
        }
        if (Array.isArray(tcs) && tcs.length > 0) {
          tcs.forEach(tc => {
            addTestCaseRow(tc.input || '', tc.output || '');
          });
        } else {
          addTestCaseRow('', '');
        }
      } else {
        addTestCaseRow('', '');
      }
    }

    toggleQFormFields(q.type || 'MCQ');

    // Populate MCQ options
    if ((q.type === 'MCQ' || q.type === 'MCQ Only') && q.options) {
      const inputs = document.querySelectorAll('.q-form-opt-input');
      q.options.forEach((opt, idx) => {
        if (idx < inputs.length) {
          inputs[idx].value = opt;
        }
      });
    }

    openModal('single-question-modal');
  };

  window.toggleQFormFields = function(qType) {
    const optsArea = document.getElementById('q-form-options-area');
    const correctArea = document.getElementById('q-form-correct-answer-area');
    const codeArea = document.getElementById('q-form-coding-area');

    if (qType === 'MCQ') {
      optsArea.style.display = 'block';
      correctArea.style.display = 'block';
      codeArea.style.display = 'none';
      
      document.querySelectorAll('.q-form-opt-input').forEach(i => i.required = true);
      document.getElementById('q-form-correct').required = true;
      document.getElementById('q-form-expected-output').required = false;
      document.querySelectorAll('.tc-input, .tc-output').forEach(i => i.required = false);
    } else if (qType === 'TF') {
      optsArea.style.display = 'none';
      correctArea.style.display = 'block';
      codeArea.style.display = 'none';

      document.querySelectorAll('.q-form-opt-input').forEach(i => i.required = false);
      document.getElementById('q-form-correct').required = true;
      document.getElementById('q-form-expected-output').required = false;
      document.querySelectorAll('.tc-input, .tc-output').forEach(i => i.required = false);
    } else {
      // Code
      optsArea.style.display = 'none';
      correctArea.style.display = 'none';
      codeArea.style.display = 'block';

      document.querySelectorAll('.q-form-opt-input').forEach(i => i.required = false);
      document.getElementById('q-form-correct').required = false;
      document.getElementById('q-form-expected-output').required = true;
      document.querySelectorAll('.tc-input, .tc-output').forEach(i => i.required = true);
    }
  };

  if (questionForm) {
    questionForm.onsubmit = async (e) => {
      e.preventDefault();
      const qid = document.getElementById('q-form-id').value;
      const isEdit = Boolean(qid);
      const category = document.getElementById('q-form-category').value;
      const qType = document.getElementById('q-form-type').value;

      const fd = new FormData(questionForm);

      // Build options array if MCQ
      if (qType === 'MCQ') {
        const options = Array.from(document.querySelectorAll('.q-form-opt-input'))
                             .map(i => i.value.trim())
                             .filter(val => val !== '');
        fd.append('options', JSON.stringify(options));
      } else if (qType === 'TF') {
        fd.append('options', JSON.stringify(['True', 'False']));
      }

      // Build test cases JSON if Coding
      if (qType === 'Code') {
        const testCases = [];
        document.querySelectorAll('.testcase-row').forEach(row => {
          const inp = row.querySelector('.tc-input').value.trim();
          const out = row.querySelector('.tc-output').value.trim();
          if (inp || out) {
            testCases.push({ input: inp, output: out });
          }
        });
        fd.append('test_cases', JSON.stringify(testCases));
      }

      const saveUrl = isEdit
        ? urls.updateCompanyQuestion.replace(placeholder, currentCompanyId).replace('qtype', category).replace('00000000-0000-0000-0000-000000000000', qid)
        : urls.addCompanyQuestion.replace(placeholder, currentCompanyId);

      const submitBtn = document.getElementById('btn-save-single-question');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const response = await fetch(saveUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken },
          body: fd,
          credentials: 'same-origin'
        });
        const d = await response.json();
        showToast(d.message, d.status === 'success');
        if (d.status === 'success') {
          closeModal('single-question-modal');
          fetchQuestionsCount(currentCompanyId);
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to save question', false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Question';
      }
    };
  }

  // ─── Filter Companies List ──────────────────────────────────────────────────
  window.filterCompaniesList = function() {
    const val = document.getElementById('company-search').value.toLowerCase();
    document.querySelectorAll('.company-item').forEach(item => {
      const name = item.dataset.name.toLowerCase();
      item.style.display = name.includes(val) ? 'flex' : 'none';
    });
  };

  // ─── Auto-select first company on load if exists ───────────────────────────
  const firstCompany = document.querySelector('.company-item');
  if (firstCompany) {
    firstCompany.click();
  }

});