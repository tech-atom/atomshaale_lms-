// static/js/admin_practice_test.js
// Complete admin practice test JS: sections, create/schedule forms (AJAX),
// manage questions by name, single + bulk question add, and Scheduled Tests edit/delete.
// Added: client-side search for tests table and scheduled tests table, with debounce
// and row-highlighting. Works with both search inputs present in template.

document.addEventListener("DOMContentLoaded", () => {
  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || "";
  const urls = document.getElementById('practice-test-api-urls')?.dataset || {};

  // current selected test (name/title)
  let currentTest = { title: "" };

  // ---------- Toast helpers ----------
  const createToastContainer = () => {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  };
  const showToast = (message, type = 'success') => {
    const container = document.querySelector('.toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fadeout');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  };

  // ---------- Utility helpers ----------
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  const parseFormErrors = (data) => {
    if (!data) return '';
    if (typeof data.error === 'string') {
      try {
        const parsed = JSON.parse(data.error);
        if (parsed && typeof parsed === 'object') {
          return Object.entries(parsed)
            .map(([k, arr]) => {
              const msgs = (arr || []).map(e => (e && e.message) ? e.message : JSON.stringify(e)).join(', ');
              return `${k}: ${msgs}`;
            })
            .join(' | ');
        }
      } catch (e) {
        return data.error;
      }
    }
    if (typeof data.error === 'object') {
      return JSON.stringify(data.error);
    }
    return data.error || '';
  };

  // OK FIX: match the single-underscore placeholder used in Django template
const fromTemplateWithTitle = (tmpl, title) =>
    (tmpl || "").replace('_TEST_TITLE_', encodeURIComponent(title));



  // ---------- Section toggles ----------
  const sections = {
    list: q('#list-section'),
    create: q('#create-section'),
    schedule: q('#schedule-section'),
    questions: q('#questions-section'),
  };

  const setActiveSection = (key) => {
    Object.entries(sections).forEach(([k, el]) => {
      if (!el) return;
      el.hidden = k !== key;
    });
    qa('.toggle-btn').forEach(btn => {
      if (btn.dataset.section === key) btn.classList.add('btn-active');
      else btn.classList.remove('btn-active');
    });
  };

  qa('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'questions-tab' && btn.disabled) return;
      setActiveSection(btn.dataset.section);
      if (btn.dataset.section === 'questions' && currentTest.title) loadQuestions();
    });
  });

  // ---------- Select test ----------
  qa('.select-test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTest.title = btn.dataset.testTitle || '';
      q('#q-title').textContent = `Questions for: ${currentTest.title}`;
      q('#q-subtitle').textContent = `Title: ${currentTest.title}`;
      const bulkTestNameInput = q('#bulk-test-name');
      if (bulkTestNameInput) bulkTestNameInput.value = currentTest.title;

      const qTab = q('#questions-tab');
      if (qTab) qTab.disabled = false;
      setActiveSection('questions');
      loadQuestions();
    });
  });

  // ---------- AJAX form helper ----------
  const wireAjaxForm = (selector, submitName) => {
    const form = q(selector);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      if (submitName) formData.append(submitName, '1');
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken },
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'OK Saved successfully!');
          form.reset();
          setTimeout(() => location.reload(), 600);
        } else {
          showToast(parseFormErrors(data) || data.error || 'ERROR Error occurred', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('ERROR Network error', 'error');
      }
    });
  };
  wireAjaxForm('#create-test-form', 'create_test');
  wireAjaxForm('#schedule-test-form', 'schedule_test');

  // ---------- QUESTIONS: load/list by NAME ----------
  const questionsTableBody = q('#questions-table tbody');

  async function loadQuestions() {
    if (!currentTest.title) return;
    if (!questionsTableBody) return;
    questionsTableBody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
    try {
      const url = fromTemplateWithTitle(urls.questionsListUrlTemplate, currentTest.title);
      const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });

      let data;
      try {
        data = await res.json();
      } catch {
        data = { error: "Invalid JSON response." };
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status === 400
            ? "WARNING Invalid or missing test name. Please ensure your test exists."
            : "WARNING Failed to load questions. Try again.");
        showToast(msg, "error");
        questionsTableBody.innerHTML =
          `<tr><td colspan="8">${escapeHtml(msg)}</td></tr>`;
        return;
      }

      if (!data.questions || data.questions.length === 0) {
        questionsTableBody.innerHTML = '<tr><td colspan="8">No questions yet.</td></tr>';
        return;
      }

      const rows = data.questions.map(qobj => {
        const td = v => `<td>${v == null ? '' : escapeHtml(String(v))}</td>`;
        const safeJSON = (obj) => {
          if (obj == null) return '';
          try { return escapeHtml(JSON.stringify(obj)); } catch { return escapeHtml(String(obj)); }
        };
        return `<tr data-qid="${qobj.id}">
  ${td(qobj.type)}
  ${td(qobj.question_text)}
  ${td(qobj.marks)}
  ${td(qobj.negative_mark)}
  ${td(safeJSON(qobj.options))}
  ${td(qobj.correct_answer)}
  ${td(safeJSON(qobj.expected_keywords))}
  ${td(qobj.min_characters)}
  <td>
    <button type="button" class="btn-small btn-edit-question" data-id="${qobj.id}">Edit</button>
    <button type="button" class="btn-small btn-delete-question" data-id="${qobj.id}">Delete</button>
  </td>
</tr>`;

      }).join('');
      questionsTableBody.innerHTML = rows;
    } catch (err) {
      console.error("LoadQuestions error:", err);
      showToast("ERROR Network or server error while loading questions.", "error");
      questionsTableBody.innerHTML =
        '<tr><td colspan="8">ERROR Network or server error.</td></tr>';
    }
  }

  // ---------- ADD single question ----------
  const singleForm = q('#single-question-form');
  if (singleForm) {
    singleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTest.title) {
        showToast('Select a test first.', 'error');
        return;
      }

      const qType = singleForm.querySelector('select[name="type"]')?.value;
      const finalOptionsInput = q('#final-options');
      const finalCorrectInput = q('#final-correct-answer');

      if (qType === 'MCQ') {
        const optionInputs = Array.from(singleForm.querySelectorAll('.mcq-option-input'));
        const optionsList = optionInputs.map(inp => inp.value.trim()).filter(v => v.length > 0);

        if (optionsList.length < 2) {
          showToast('Please provide at least 2 non-empty options for MCQ.', 'error');
          return;
        }

        const checkedRadio = singleForm.querySelector('input[name="mcq_correct_option"]:checked');
        if (!checkedRadio) {
          showToast('Please select the correct option using the radio button.', 'error');
          return;
        }

        const correctRow = checkedRadio.closest('.mcq-opt-row');
        const correctVal = correctRow ? correctRow.querySelector('.mcq-option-input')?.value.trim() : '';

        if (!correctVal) {
          showToast('The selected correct option text cannot be empty.', 'error');
          return;
        }

        if (finalOptionsInput) finalOptionsInput.value = JSON.stringify(optionsList);
        if (finalCorrectInput) finalCorrectInput.value = correctVal;
      } else if (qType === 'TF') {
        if (finalOptionsInput) finalOptionsInput.value = JSON.stringify(["True", "False"]);
        const tfSel = q('#tf-correct-select');
        if (finalCorrectInput) finalCorrectInput.value = tfSel ? tfSel.value : "True";
      } else {
        if (finalOptionsInput) finalOptionsInput.value = "";
        if (finalCorrectInput) finalCorrectInput.value = "";
      }

      const formData = new FormData(singleForm);
      try {
        const url = fromTemplateWithTitle(urls.questionsAddUrlTemplate, currentTest.title);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'OK Question added');
          singleForm.reset();
          loadQuestions();
        } else {
          showToast(parseFormErrors(data) || data.error || 'ERROR Failed to add', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('ERROR Network error', 'error');
      }
    });
  }

  // ---------- DYNAMIC QUESTION FORM (CODE/DESC/MCQ/TF fields) ----------
  const typeSelect = document.querySelector('#single-question-form select[name="type"]');
  const codingSection = document.querySelector('#coding-section');
  const descSection = document.querySelector('#desc-section');
  const mcqSection = document.querySelector('#mcq-section');
  const tfSection = document.querySelector('#tf-section');
  const addTestCaseBtn = document.querySelector('#add-test-case');
  const testCaseContainer = document.querySelector('#test-cases-container');
  const addMcqOptBtn = document.querySelector('#add-mcq-option');
  const mcqContainer = document.querySelector('#mcq-options-container');
  const removeImageBtn = document.querySelector('#remove-selected-image');
  const imageInput = document.querySelector('input[name="image"]');

  if (removeImageBtn && imageInput) {
    removeImageBtn.addEventListener('click', () => { imageInput.value = ''; });
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const val = typeSelect.value;
      if (codingSection) codingSection.hidden = val !== 'CODE';
      if (descSection) descSection.hidden = val !== 'DESC';
      if (mcqSection) mcqSection.hidden = val !== 'MCQ';
      if (tfSection) tfSection.hidden = val !== 'TF';
    });
  }

  if (addMcqOptBtn && mcqContainer) {
    addMcqOptBtn.addEventListener('click', () => {
      const optionCount = mcqContainer.querySelectorAll('.mcq-opt-row').length + 1;
      const div = document.createElement('div');
      div.className = 'mcq-opt-row';
      div.innerHTML = `
        <input type="text" class="mcq-option-input" placeholder="Option ${optionCount}" />
        <label class="radio-label"><input type="radio" name="mcq_correct_option" /> Correct</label>
        <button type="button" class="action-btn delete btn-small remove-mcq-opt" title="Remove Option">×</button>
      `;
      mcqContainer.appendChild(div);
    });

    mcqContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-mcq-opt')) {
        const row = e.target.closest('.mcq-opt-row');
        if (mcqContainer.querySelectorAll('.mcq-opt-row').length > 2) {
          row?.remove();
        } else {
          showToast('MCQ must have at least 2 options.', 'error');
        }
      }
    });
  }

  if (addTestCaseBtn && testCaseContainer) {
    let caseIndex = 1;
    addTestCaseBtn.addEventListener('click', () => {
      const div = document.createElement('div');
      div.className = 'test-case-row';
      div.innerHTML = `
        <input type="text" name="test_input_${caseIndex}" placeholder="Input" />
        <input type="text" name="test_output_${caseIndex}" placeholder="Expected Output" />
        <button type="button" class="btn-small remove-test-case">Remove</button>
      `;
      testCaseContainer.appendChild(div);
      caseIndex++;
    });

    testCaseContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-test-case')) {
        e.target.closest('.test-case-row')?.remove();
      }
    });
  }

  // ---------- BULK upload ----------
  const bulkForm = q('#bulk-upload-form');
  const bulkProgress = q('#bulk-progress');
  if (bulkForm) {
    bulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTest.title) { showToast('Select a test first.', 'error'); return; }

      if (bulkProgress) bulkProgress.textContent = 'Uploading…';
      try {
        const formData = new FormData(bulkForm);
        if (!formData.get('test_name')) formData.set('test_name', currentTest.title);

        const res = await fetch(bulkForm.action, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': csrfToken },
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          const msg = `OK Uploaded ${data.created || 0} rows. Skipped ${data.skipped || 0}.`;
          showToast(msg);
          if (bulkProgress) bulkProgress.textContent = msg;
          loadQuestions();
          bulkForm.reset();
        } else {
          const err = parseFormErrors(data) || data.error || 'Upload failed';
          showToast(err, 'error');
          if (bulkProgress) bulkProgress.textContent = err;
        }
      } catch (err) {
        console.error(err);
        showToast('ERROR Network error', 'error');
        if (bulkProgress) bulkProgress.textContent = 'Network error.';
      }
    });
  }

  // ---------- Format help modal ----------
  const formatModal = q('#formatHelpModal');
  const modalBackdrop = q('#modalBackdrop');
  const openFormat = () => { if (formatModal && modalBackdrop) { formatModal.hidden = false; modalBackdrop.hidden = false; } };
  const closeFormat = () => {
    qa('.modal').forEach(m => m.hidden = true);
    if (modalBackdrop) modalBackdrop.hidden = true;
  };
  q('#open-format-help')?.addEventListener('click', openFormat);
  q('#open-format-help-2')?.addEventListener('click', openFormat);
  qa('[data-close]').forEach(el => el.addEventListener('click', closeFormat));
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeFormat);

  // ---------- UTIL: escape HTML ----------
  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- SCHEDULED TESTS: Edit (fetch detail), Update, Delete ----------
  const scheduleDetailBase = urls.scheduleDetailBase || (urls.scheduleDetailBase === "" ? urls.scheduleDetailBase : "/practicetest/admin/practice-tests/schedules/");
  const scheduleUpdateBase = urls.scheduleUpdateBase || scheduleDetailBase;
  const scheduleDeleteBase = urls.scheduleDeleteBase || scheduleDetailBase;

  // Open edit modal
  document.addEventListener('click', async (ev) => {
    const editBtn = ev.target.closest('.btn-edit-schedule');
    if (!editBtn) return;
    const scheduleId = editBtn.dataset.id;
    if (!scheduleId) { showToast('Missing schedule id', 'error'); return; }

    try {
      const res = await fetch(`${scheduleDetailBase}${scheduleId}/`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');

      const s = data.schedule;
      q('#edit-schedule-id').value = s.id || '';
      if (q('#edit-college-id')) q('#edit-college-id').value = s.college || '';
      if (q('#edit-course-id')) q('#edit-course-id').value = s.course || '';
      if (q('#id_practice_test_modal')) q('#id_practice_test_modal').value = s.practice_test || '';
      if (q('#id_college_modal_display')) q('#id_college_modal_display').textContent = s.college_name || '—';
      if (q('#id_course_modal_display')) q('#id_course_modal_display').textContent = s.course_name || '—';
      if (q('#id_semester_modal')) q('#id_semester_modal').value = s.semester || '';
      if (q('#id_year_modal')) q('#id_year_modal').value = s.year || '';
      if (q('#id_start_modal')) q('#id_start_modal').value = s.start_datetime || '';
      if (q('#id_end_modal')) q('#id_end_modal').value = s.end_datetime || '';

      const editModal = q('#scheduleEditModal');
      if (editModal && modalBackdrop) { editModal.hidden = false; modalBackdrop.hidden = false; }
    } catch (err) {
      console.error(err);
      showToast('ERROR Could not load schedule details.', 'error');
    }
  });


// ---------- DELETE QUESTION ----------
document.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('.btn-delete-question');
  if (!delBtn) return;
  const qid = delBtn.dataset.id;
  if (!qid || !confirm("Delete this question?")) return;

  try {
    const res = await fetch(`/practicetest/admin/practice-tests/questions/${qid}/delete/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': csrfToken, 'Accept': 'application/json' },
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'OK Question deleted');
      delBtn.closest('tr')?.remove();
    } else {
      showToast(data.error || 'ERROR Failed to delete', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('ERROR Network error', 'error');
  }
});

// ---------- EDIT QUESTION (open modal) ----------
document.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.btn-edit-question');
  if (!editBtn) return;
  const row = editBtn.closest('tr');
  if (!row) return;

  q('#edit-qid').value = row.dataset.qid;
  q('#edit-question-text').value = row.children[1].textContent;
  q('#edit-marks').value = row.children[2].textContent;
  q('#edit-negative').value = row.children[3].textContent;
  q('#edit-correct').value = row.children[5].textContent;
  q('#edit-options').value = row.children[4].textContent;

  q('#editQuestionModal').hidden = false;
  q('#modalBackdrop').hidden = false;
});

// ---------- EDIT FORM SUBMIT ----------
const editQuestionForm = q('#edit-question-form');
if (editQuestionForm) {
  editQuestionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qid = q('#edit-qid').value;
    const formData = new FormData(editQuestionForm);

    try {
      const res = await fetch(`/practicetest/admin/practice-tests/questions/${qid}/edit/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken, 'Accept': 'application/json' },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'OK Updated');
        q('#editQuestionModal').hidden = true;
        q('#modalBackdrop').hidden = true;
        loadQuestions();
      } else {
        showToast(data.error || 'ERROR Failed to update', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ERROR Network error', 'error');
    }
  });
}


  // Submit edit form
  const editForm = q('#edit-schedule-form');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const scheduleId = q('#edit-schedule-id')?.value;
      if (!scheduleId) { showToast('Missing schedule id', 'error'); return; }

      const formData = new FormData(editForm);
      try {
        const res = await fetch(`${scheduleUpdateBase}${scheduleId}/update/`, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken, 'Accept': 'application/json' },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg = parseFormErrors(data) || data.error || 'Failed to update';
          showToast(errMsg, 'error');
          return;
        }

        const row = document.querySelector(`tr[data-schedule-id="${scheduleId}"]`);
        if (row && data.schedule) {
          const s = data.schedule;
          row.querySelector('td:nth-child(1)').textContent = s.practice_test_title || row.querySelector('td:nth-child(1)').textContent;
          row.querySelector('td:nth-child(2)').textContent = s.college_name || row.querySelector('td:nth-child(2)').textContent;
          row.querySelector('td:nth-child(3)').textContent = s.course_name || row.querySelector('td:nth-child(3)').textContent;
          row.querySelector('td:nth-child(4)').textContent = s.semester ?? row.querySelector('td:nth-child(4)').textContent;
          row.querySelector('td:nth-child(5)').textContent = s.year ?? row.querySelector('td:nth-child(5)').textContent;
          row.querySelector('td:nth-child(6)').textContent = s.start_datetime || row.querySelector('td:nth-child(6)').textContent;
          row.querySelector('td:nth-child(7)').textContent = s.end_datetime || row.querySelector('td:nth-child(7)').textContent;
        } else {
          setTimeout(() => location.reload(), 300);
        }

        const editModal = q('#scheduleEditModal');
        if (editModal && modalBackdrop) { editModal.hidden = true; modalBackdrop.hidden = true; }

        showToast(data.message || 'OK Schedule updated');
      } catch (err) {
        console.error(err);
        showToast('ERROR Network error', 'error');
      }
    });
  }

  // Delete schedule
  document.addEventListener('click', async (ev) => {
    const delBtn = ev.target.closest('.btn-delete-schedule');
    if (!delBtn) return;
    const scheduleId = delBtn.dataset.id;
    if (!scheduleId) { showToast('Missing schedule id', 'error'); return; }
    if (!confirm('Delete this scheduled test? This cannot be undone.')) return;

    try {
      const res = await fetch(`${scheduleDeleteBase}${scheduleId}/delete/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken, 'Accept': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to delete schedule', 'error');
        return;
      }
      const row = document.querySelector(`tr[data-schedule-id="${scheduleId}"]`);
      if (row) row.remove();
      showToast(data.message || 'OK Schedule deleted');
    } catch (err) {
      console.error(err);
      showToast('ERROR Network error', 'error');
    }
  });

  // ---------- ensure questions tab loads if already selected (page state) ----------
  if (!q('#questions-section')?.hidden && currentTest.title) loadQuestions();

  // ---------- SEARCH (client-side) ----------
  const searchInputs = qa('input[placeholder="Search Tests..."]');

  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function filterTable(tableEl, query) {
    if (!tableEl) return;
    const tbody = tableEl.tBodies[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows);
    const qStr = String(query || "").trim().toLowerCase();

    if (!qStr) {
      rows.forEach(r => { r.style.display = ''; r.classList.remove('search-match'); });
      const noRow = tbody.querySelector('.no-results-row');
      if (noRow) noRow.remove();
      return;
    }

    let visibleCount = 0;
    rows.forEach(r => {
      if (r.classList.contains('no-results-row') || r.querySelectorAll('td').length === 0) {
        r.style.display = 'none';
        return;
      }
      const text = Array.from(r.cells).map(td => td.textContent || "").join(' ').toLowerCase();
      const matches = text.includes(qStr);
      r.style.display = matches ? '' : 'none';
      if (matches) {
        visibleCount++;
        r.classList.add('search-match');
      } else {
        r.classList.remove('search-match');
      }
    });

    const existingNo = tbody.querySelector('.no-results-row');
    if (visibleCount === 0 && !existingNo) {
      const noRow = document.createElement('tr');
      noRow.className = 'no-results-row';
      const colCount = tableEl.tHead ? tableEl.tHead.rows[0].cells.length : 1;
      const td = document.createElement('td');
      td.colSpan = colCount;
      td.textContent = 'No matching results.';
      td.className = 'muted';
      noRow.appendChild(td);
      tbody.appendChild(noRow);
    } else if (visibleCount > 0 && existingNo) {
      existingNo.remove();
    }
  }

  const testsTable = q('#list-section table');
  const scheduledTable = q('#scheduled-table');

  const performSearch = (rawValue) => {
    try {
      filterTable(testsTable, rawValue);
      filterTable(scheduledTable, rawValue);
    } catch (e) {
      console.error('Search error', e);
    }
  };

  const debouncedSearch = debounce((ev) => {
    const value = ev.target.value || '';
    performSearch(value);
  }, 250);

  if (searchInputs.length > 0) {
    searchInputs.forEach(input => {
      input.addEventListener('input', debouncedSearch);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          input.value = '';
          performSearch('');
        }
      });
    });
  } else {
    const fallback = q('#searchInput');
    if (fallback) fallback.addEventListener('input', debouncedSearch);
  }

  (function injectSearchStyle() {
    if (document.getElementById('search-match-style')) return;
    const css = `
      .search-match { background: rgba(255, 255, 0, 0.06); transition: background 180ms ease; }
      .no-results-row td { text-align: center; font-style: italic; color: #666; padding: 12px; }
    `;
    const s = document.createElement('style');
    s.id = 'search-match-style';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  })();

  if (!q('#questions-section')?.hidden && currentTest.title) loadQuestions();

  // Done
});
