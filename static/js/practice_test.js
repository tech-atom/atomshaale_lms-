"use strict";

(function () {
  // Initialize compiler registry for practice tests
  const practiceCompilers = window.practiceCompilers || {};
  window.practiceCompilers = practiceCompilers;

  // =============================
  // Fullscreen Helpers
  // =============================

  async function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        await el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      }
      return true;
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
      return false;
    }
  }

  // =============================
  // Utility Functions
  // =============================

  function getApiUrls() {
    const apiDiv = document.getElementById("practice-api-urls");
    if (!apiDiv) throw new Error("API URL div not found!");
    return {
      get_domains: apiDiv.dataset.getDomains,
      get_practice_tests: apiDiv.dataset.getPracticeTests,
      get_past_attempts: apiDiv.dataset.getPastAttempts,
      get_practice_questions: apiDiv.dataset.getPracticeQuestions,
      submit_practice_test: apiDiv.dataset.submitPracticeTest,
      get_performance: apiDiv.dataset.getPerformance,
    };
  }

  function getPracticeUserId() {
    const apiDiv = document.getElementById("practice-api-urls");
    return (apiDiv && apiDiv.dataset.currentUser) ? apiDiv.dataset.currentUser : "guest";
  }

  function clearPracticeCodeDrafts(questions) {
    const userId = getPracticeUserId();
    (questions || []).forEach((q) => {
      if (q.type !== "CODE") return;
      // Current key format
      localStorage.removeItem(`exam_code_${userId}_practiceCompilers_${q.id}`);
      // Legacy key format (for backward cleanup)
      localStorage.removeItem(`exam_code_${userId}_${q.id}`);
    });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"'`=\/]/g, function (s) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "`": "&#x60;",
        "=": "&#x3D;",
        "/": "&#x2F;",
      }[s];
    });
  }

  function show(el) {
    el.classList.remove("hidden");
  }

  function hide(el) {
    el.classList.add("hidden");
  }

  // =============================
  // Modal Handling
  // =============================

  function openReportModal() {
    const modal = document.getElementById("reportModal");
    modal.classList.add("show");
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    modal.focus();
  }

  function closeReportModal() {
    const modal = document.getElementById("reportModal");
    modal.classList.remove("show");
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    const closeBtn = document.getElementById("closeReportModal");
    if (closeBtn) closeBtn.onclick = closeReportModal;

    const modal = document.getElementById("reportModal");
    if (modal) {
      modal.onclick = function (e) {
        if (e.target === this) closeReportModal();
      };
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeReportModal();
    });
  });

  // =============================
  // DOM References
  // =============================

  const domainSelect = document.getElementById("domain");
  const testsTableContainer = document.getElementById("practiceTestsTableContainer");
  const attemptsContainer = document.getElementById("testAttemptsContainer");
  const testListContainer = document.getElementById("testListContainer");
  const testAttemptContainer = document.getElementById("testAttemptContainer");
  const questionContainer = document.getElementById("questionContainer");
  const testTitle = document.getElementById("testTitle");
  const form = document.getElementById("practiceForm");
  const practiceTimerEl = document.getElementById("practice-timer");

  let practiceTimerInterval = null;

  let URLS = {};

  // =============================
  // Load Domains
  // =============================

  async function loadDomains() {
    try {
      const res = await fetch(URLS.get_domains, { credentials: "include" });
      const data = await res.json();
      domainSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "-- Select Domain --";
      domainSelect.appendChild(opt);
      data.forEach((domain) => {
        const o = document.createElement("option");
        o.value = escapeHtml(domain.id);
        o.textContent = domain.domain_name || domain.name || "Domain";
        domainSelect.appendChild(o);
      });
    } catch {
      testsTableContainer.textContent = "Failed to load domains.";
      testsTableContainer.style.color = "red";
    }
  }

  // =============================
  // Load Practice Tests
  // =============================

  async function loadPracticeTestsForDomain() {
    const domain = domainSelect ? domainSelect.value : "";
    testsTableContainer.textContent = "";
    attemptsContainer.textContent = "";

    let url = URLS.get_practice_tests;
    if (domain) {
      url += (url.includes("?") ? "&" : "?") + "domain=" + encodeURIComponent(domain);
    }

    try {
      const res = await fetch(url, { credentials: "include" });
      const tests = await res.json();

      if (!tests.tests || !tests.tests.length) {
        testsTableContainer.textContent = "No practice tests currently available.";
        return;
      }

      const cardsGrid = document.createElement("div");
      cardsGrid.className = "practice-cards-grid";

      tests.tests.forEach((test) => {
        const card = document.createElement("div");
        card.className = "practice-card";
        card.setAttribute("data-test-id", test.id);

        const domainText = escapeHtml(test.domain || "Practice");
        const titleText = escapeHtml(test.title || "Practice Test");
        const durationText = test.duration_minutes ? `${test.duration_minutes} mins` : "10 mins";
        const questionCount = test.question_count || 0;
        const highestScore = Math.round(test.highest_score || 0);
        const maxMarks = Math.round(test.max_marks || 0);
        const attempted = (Array.isArray(test.attempts) && test.attempts.length > 0) || test.attempted;
        const attemptsCount = test.attempts_count !== undefined ? test.attempts_count : (Array.isArray(test.attempts) ? test.attempts.length : (attempted ? 1 : 0));

        const takeOrRetakeText = attemptsCount > 0 ? "Retake Test" : "Take Test";

        let actionHtml = '';
        if (test.is_active) {
          actionHtml = `<button type="button" class="card-action-btn take-test-btn" data-test-id="${test.id}">${takeOrRetakeText} <span class="arrow">&rarr;</span></button>`;
        } else if (attempted && test.latest_result_id) {
          actionHtml = `<a href="/practicetest/practice/result/${test.latest_result_id}/" class="card-action-btn view-report-link">Detailed Report <span class="arrow">&rarr;</span></a>`;
        } else if (test.is_expired) {
          actionHtml = `<button type="button" class="card-action-btn disabled-btn" disabled>Expired</button>`;
        } else if (test.is_upcoming) {
          actionHtml = `<button type="button" class="card-action-btn disabled-btn" disabled>Upcoming</button>`;
        } else {
          actionHtml = `<button type="button" class="card-action-btn take-test-btn" data-test-id="${test.id}">${takeOrRetakeText} <span class="arrow">&rarr;</span></button>`;
        }

        let secondaryReportHtml = '';
        if (test.is_active && attempted) {
          if (test.latest_result_id) {
            secondaryReportHtml = `<a href="/practicetest/practice/result/${test.latest_result_id}/" class="card-secondary-report-link">Detailed Report &rarr;</a>`;
          } else {
            secondaryReportHtml = `<button type="button" class="card-secondary-report-btn report-modal-btn" data-test-id="${test.id}">Detailed Report &rarr;</button>`;
          }
        }

        card.innerHTML = `
          <div class="card-header">
            <div class="card-domain">${domainText}</div>
            <h3 class="card-title">${titleText}</h3>
          </div>
          <div class="card-divider"></div>
          <div class="card-body">
            <div class="meta-row">
              <span class="meta-label">Duration</span>
              <span class="meta-val">${durationText}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Questions</span>
              <span class="meta-val">${questionCount}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Times Taken</span>
              <span class="meta-val">${attemptsCount}</span>
            </div>
          </div>
          <div class="card-footer">
            <div class="card-actions-wrapper">
              ${actionHtml}
              ${secondaryReportHtml}
            </div>
          </div>
        `;

        cardsGrid.appendChild(card);
      });

      testsTableContainer.innerHTML = "";
      testsTableContainer.appendChild(cardsGrid);

      // Attach handlers
      testsTableContainer.querySelectorAll(".take-test-btn").forEach((btn) => {
        btn.onclick = async function () {
          await enterFullscreen();
          startTest(this.dataset.testId);
        };
      });

      testsTableContainer.querySelectorAll(".report-modal-btn").forEach((btn) => {
        btn.onclick = function () {
          showDetailedReport(this.dataset.testId, domainSelect ? domainSelect.value : "");
        };
      });

      // Render charts
      tests.tests.forEach((test) => {
        const canvas = document.getElementById(`progress-graph-${test.id}`);
        let marks = [];
        let totals = [];
        if (Array.isArray(test.attempts) && test.attempts.length) {
          marks = test.attempts.map((a) => a.marks);
          totals = test.attempts.map((a) => a.total_marks || 100);
        }
        if (canvas && window.Chart && marks.length) {
          requestAnimationFrame(() => {
            new Chart(canvas.getContext("2d"), {
              type: "bar",
              data: {
                labels: marks.map((_, i) => `#${i + 1}`),
                datasets: [
                  {
                    label: "Score",
                    data: marks,
                    backgroundColor: "#008037",
                  },
                ],
              },
              options: {
                responsive: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { display: false },
                  y: {
                    min: 0,
                    max: Math.max(...totals, ...marks, 100),
                    display: false,
                  },
                },
              },
            });
          });
        }
      });
    } catch (err) {
      console.error(err);
      testsTableContainer.textContent = "Failed to load tests.";
      testsTableContainer.style.color = "red";
    }
  }

  // =============================
  // Show Detailed Report (Restored)
  // =============================

  function showDetailedReport(testId, domainId) {
    const modalBody = document.getElementById("reportModalBody");
    while (modalBody.firstChild) modalBody.removeChild(modalBody.firstChild);
    const loading = document.createElement("p");
    loading.textContent = "Loading report...";
    modalBody.appendChild(loading);
    openReportModal();

    let url = URLS.get_past_attempts;
    url += (url.includes("?") ? "&" : "?") + "test_id=" + encodeURIComponent(testId);
    if (domainId) url += "&domain=" + encodeURIComponent(domainId);

    fetch(url, { credentials: "include" })
      .then((res) => res.json())
      .then((attempts) => {
        modalBody.innerHTML = "";
        if (!Array.isArray(attempts) || !attempts.length) {
          modalBody.textContent = "No attempts found for this test.";
          return;
        }

        const marksArr = attempts.map((a) => Number(a.marks_obtained || a.marks));
        const best = Math.max(...marksArr);
        const avg = (marksArr.reduce((a, b) => a + b, 0) / marksArr.length).toFixed(2);

        const summary = document.createElement("div");
        summary.innerHTML = `
          <p><strong>Total Attempts:</strong> ${attempts.length}</p>
          <p><strong>Best Score:</strong> ${best}</p>
          <p><strong>Average Score:</strong> ${avg}</p>
        `;
        modalBody.appendChild(summary);

        const chartCanvas = document.createElement("canvas");
        chartCanvas.id = "modalReportChart";
        chartCanvas.style.width = "100%";
        chartCanvas.style.height = "250px";
        modalBody.appendChild(chartCanvas);

        requestAnimationFrame(() => {
          new Chart(chartCanvas.getContext("2d"), {
            type: "line",
            data: {
              labels: attempts.map((_, i) => `#${i + 1}`),
              datasets: [
                {
                  label: "Score",
                  data: marksArr,
                  fill: false,
                  borderColor: "#008037",
                  tension: 0.1,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: {
                  beginAtZero: true,
                  max: Math.max(...marksArr, 100),
                },
              },
            },
          });
        });
      })
      .catch((err) => {
        modalBody.textContent = "Could not load report data.";
        console.error(err);
      });
  }

  // =============================
  // Start Test Function
  // =============================

  function setupPracticeQuestionFlow(formEl) {
    const questionBlocks = Array.from(formEl.querySelectorAll(".question-block"));
    const progressEl = document.getElementById("practice-question-progress");
    const sidePanel = document.getElementById("practice-question-side-panel");
    if (!questionBlocks.length) {
      if (progressEl) progressEl.textContent = "";
      return;
    }

    const submitBtn = formEl.querySelector("button[type='submit']");
    if (!submitBtn) return;
    submitBtn.id = "submitBtn";

    if (sidePanel) sidePanel.innerHTML = "";

    const paletteWrap = document.createElement("div");
    paletteWrap.className = "question-palette-wrap";

    const paletteTitle = document.createElement("p");
    paletteTitle.className = "question-palette-title";
    paletteTitle.style.display = "flex";
    paletteTitle.style.justifyContent = "space-between";
    paletteTitle.style.alignItems = "center";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "Jump to question";
    paletteTitle.appendChild(titleSpan);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "palette-toggle-btn";
    toggleBtn.textContent = "Expand";
    paletteTitle.appendChild(toggleBtn);

    if (window.innerWidth <= 991) {
      paletteWrap.classList.add("collapsed");
    }

    toggleBtn.addEventListener("click", () => {
      const isCollapsed = paletteWrap.classList.toggle("collapsed");
      toggleBtn.textContent = isCollapsed ? "Expand" : "Collapse";
    });

    const legend = document.createElement("div");
    legend.className = "status-legend";
    legend.innerHTML = `
      <div class="legend-item"><span class="legend-dot answered"></span> Answered</div>
      <div class="legend-item"><span class="legend-dot unanswered"></span> Unanswered</div>
      <div class="legend-item"><span class="legend-dot review"></span> Review</div>
    `;

    const filterBar = document.createElement("div");
    filterBar.className = "palette-filters";
    const filterConfigs = [
      { key: "all", label: "All" },
      { key: "answered", label: "Answered" },
      { key: "unanswered", label: "Unanswered" },
      { key: "review", label: "Review" }
    ];
    const filterButtons = {};
    let activeFilter = "all";

    filterConfigs.forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.textContent = label;
      btn.dataset.filter = key;
      if (key === activeFilter) btn.classList.add("active");
      filterButtons[key] = btn;
      filterBar.appendChild(btn);
    });

    const palette = document.createElement("div");
    palette.id = "question-palette";

    let currentIndex = 0;
    const reviewSet = new Set();

    const paletteButtons = questionBlocks.map((_, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qp-btn";
      btn.textContent = String(idx + 1);
      btn.addEventListener("click", () => {
        currentIndex = idx;
        updateQuestionVisibility();
        if (window.innerWidth <= 991) {
          paletteWrap.classList.add("collapsed");
          toggleBtn.textContent = "Expand";
        }
      });
      palette.appendChild(btn);
      return btn;
    });

    paletteWrap.appendChild(paletteTitle);
    paletteWrap.appendChild(legend);
    paletteWrap.appendChild(filterBar);
    paletteWrap.appendChild(palette);
    if (sidePanel) sidePanel.appendChild(paletteWrap);

    const nav = document.createElement("div");
    nav.className = "nav-buttons";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.id = "prevBtn";
    prevBtn.textContent = "Previous";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.id = "nextBtn";
    nextBtn.textContent = "Next";
    const markReviewBtn = document.createElement("button");
    markReviewBtn.type = "button";
    markReviewBtn.id = "markReviewBtn";
    markReviewBtn.textContent = "Mark for Review";
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    nav.appendChild(markReviewBtn);
    nav.appendChild(submitBtn);
    formEl.appendChild(nav);

    const isAnswered = (block) => {
      const questionType = block.dataset.questionType;
      if (questionType === "CODE") {
        const questionId = block.dataset.questionId;
        const compiler = practiceCompilers[questionId];
        if (!compiler || typeof compiler.saveCode !== "function") return false;
        return !!(compiler.saveCode() || "").trim();
      }
      const checked = block.querySelector("input[type='radio']:checked");
      if (checked) return true;
      const textarea = block.querySelector("textarea");
      return !!(textarea && textarea.value.trim());
    };

    const matchesFilter = (block, idx) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "answered") return isAnswered(block);
      if (activeFilter === "unanswered") return !isAnswered(block);
      if (activeFilter === "review") return reviewSet.has(idx);
      return true;
    };

    const hasPrevVisible = () => {
      for (let i = currentIndex - 1; i >= 0; i--) if (matchesFilter(questionBlocks[i], i)) return true;
      return false;
    };

    const hasNextVisible = () => {
      for (let i = currentIndex + 1; i < questionBlocks.length; i++) if (matchesFilter(questionBlocks[i], i)) return true;
      return false;
    };

    const goToAdjacentVisible = (step) => {
      let idx = currentIndex + step;
      while (idx >= 0 && idx < questionBlocks.length) {
        if (matchesFilter(questionBlocks[idx], idx)) {
          currentIndex = idx;
          updateQuestionVisibility();
          return;
        }
        idx += step;
      }
    };

    const firstMatchingIndex = () => {
      for (let i = 0; i < questionBlocks.length; i++) if (matchesFilter(questionBlocks[i], i)) return i;
      return -1;
    };

    const updatePaletteState = () => {
      questionBlocks.forEach((block, idx) => {
        const btn = paletteButtons[idx];
        if (!btn) return;
        btn.classList.remove("current", "answered", "not-answered");
        btn.classList.toggle("review", reviewSet.has(idx));
        btn.classList.add(isAnswered(block) ? "answered" : "not-answered");
        btn.style.display = matchesFilter(block, idx) ? "inline-flex" : "none";
        if (idx === currentIndex) btn.classList.add("current");
      });
      Object.entries(filterButtons).forEach(([key, btn]) => btn.classList.toggle("active", key === activeFilter));
    };

    function updateQuestionVisibility() {
      questionBlocks.forEach((block, idx) => {
        const isActive = idx === currentIndex && matchesFilter(block, idx);
        block.style.display = isActive ? "block" : "none";
        block.classList.toggle("active-question", isActive);

        const qid = block.dataset.questionId;
        const compilerContainer = document.getElementById(`practice-compiler-container-${qid}`);
        if (compilerContainer) compilerContainer.style.display = isActive ? "block" : "none";
      });

      prevBtn.disabled = !hasPrevVisible();
      nextBtn.hidden = !hasNextVisible();
      submitBtn.hidden = currentIndex !== questionBlocks.length - 1;
      markReviewBtn.classList.toggle("active", reviewSet.has(currentIndex));
      markReviewBtn.textContent = reviewSet.has(currentIndex) ? "Unmark Review" : "Mark for Review";
      if (progressEl) progressEl.textContent = `Question ${currentIndex + 1} of ${questionBlocks.length}`;

      updatePaletteState();
    }

    prevBtn.addEventListener("click", () => goToAdjacentVisible(-1));
    nextBtn.addEventListener("click", () => goToAdjacentVisible(1));
    markReviewBtn.addEventListener("click", () => {
      if (reviewSet.has(currentIndex)) reviewSet.delete(currentIndex); else reviewSet.add(currentIndex);
      updateQuestionVisibility();
    });

    Object.entries(filterButtons).forEach(([key, btn]) => {
      btn.addEventListener("click", () => {
        activeFilter = key;
        if (!matchesFilter(questionBlocks[currentIndex], currentIndex)) {
          const idx = firstMatchingIndex();
          if (idx >= 0) currentIndex = idx;
        }
        updateQuestionVisibility();
      });
    });

    formEl.addEventListener("change", updatePaletteState);
    formEl.addEventListener("input", updatePaletteState);
    updateQuestionVisibility();
  }

  async function startTest(testId) {
    console.log("Starting test:", testId);
    document.body.classList.add("practice-active");

    const isReload = sessionStorage.getItem("active_practice_test_id") === testId;
    sessionStorage.setItem("active_practice_test_id", testId);

    // Store start time if not already stored
    let startTime = sessionStorage.getItem(`practice_test_${testId}_start_time`);
    if (!startTime) {
      startTime = Date.now();
      sessionStorage.setItem(`practice_test_${testId}_start_time`, startTime);
    }

    let url = URLS.get_practice_questions;
    url += (url.includes("?") ? "&" : "?") + "test_id=" + encodeURIComponent(testId);

    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Unable to fetch questions.");
      const data = await res.json();
      console.log("Fetched test data:", data);

      hide(testListContainer);
      show(testAttemptContainer);
      testTitle.textContent = data.test?.title || "Test";
      form.action = URLS.submit_practice_test.replace("TEST_ID", testId);
      questionContainer.innerHTML = "";
      const sidePanel = document.getElementById("practice-question-side-panel");
      if (sidePanel) sidePanel.innerHTML = "";

      if (practiceTimerInterval) {
        clearInterval(practiceTimerInterval);
        practiceTimerInterval = null;
      }

      let totalDurationSeconds = Math.max(0, Number(data.test?.duration_minutes || 0) * 60);
      let elapsedSeconds = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      let timeLeft = Math.max(0, totalDurationSeconds - elapsedSeconds);
      if (practiceTimerEl) {
        const paintTimer = () => {
          const m = Math.floor(timeLeft / 60);
          const s = timeLeft % 60;
          practiceTimerEl.textContent = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
          practiceTimerEl.classList.remove("green", "yellow", "red");
          if (timeLeft <= 300) practiceTimerEl.classList.add("red");
          else if (timeLeft <= 900) practiceTimerEl.classList.add("yellow");
          else practiceTimerEl.classList.add("green");
        };
        paintTimer();
        if (timeLeft > 0) {
          practiceTimerInterval = setInterval(() => {
            timeLeft -= 1;
            paintTimer();
            if (timeLeft <= 0) {
              clearInterval(practiceTimerInterval);
              practiceTimerInterval = null;
              form.requestSubmit();
            }
          }, 1000);
        }
      }

      if (!data.questions || !data.questions.length) {
        questionContainer.innerHTML = "<p>No questions found for this test.</p>";
        return;
      }

      // Fresh attempt should start with empty coding editors.
      if (!isReload) {
        clearPracticeCodeDrafts(data.questions);
        // Also clear other saved answers for this test
        const userId = getPracticeUserId();
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`practice_ans_${userId}_${testId}_`)) {
            localStorage.removeItem(key);
          }
        });
      }

      data.questions.forEach((q, index) => {
        const div = document.createElement("div");
        div.classList.add("question-block");
        div.dataset.questionId = q.id;
        div.dataset.questionType = q.type;

        const p = document.createElement("p");
        p.innerHTML = `<strong>Q${index + 1}:</strong> ${escapeHtml(q.question_text)}`;
        div.appendChild(p);

        // OK If image exists, render it
        if (q.image_url) {
          const img = document.createElement("img");
          img.src = q.image_url;
          img.alt = "Question Image";
          img.className = "question-image";
          div.appendChild(img);
        }

        const userId = getPracticeUserId();
        const savedAnswerKey = `practice_ans_${userId}_${testId}_${q.id}`;
        const savedAnswer = localStorage.getItem(savedAnswerKey);

        if (q.type === "MCQ" || q.type === "TF") {
          (q.options || []).forEach((opt) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "radio";
            input.name = `q_${escapeHtml(q.id)}`;
            input.value = escapeHtml(opt);
            if (savedAnswer === escapeHtml(opt)) {
              input.checked = true;
            }
            label.appendChild(input);
            label.appendChild(document.createTextNode(" " + escapeHtml(opt)));
            div.appendChild(label);
            div.appendChild(document.createElement("br"));
          });
        }
        else if (q.type === "CODE") {
          // Create note in question block
          const codeNote = document.createElement("p");
          codeNote.textContent = "Write your code below:";
          codeNote.style.marginTop = "10px";
          codeNote.style.fontWeight = "500";
          div.appendChild(codeNote);
        }
        else {
          const textarea = document.createElement("textarea");
          textarea.name = `q_${escapeHtml(q.id)}`;
          textarea.rows = 4;
          textarea.cols = 80;
          textarea.placeholder = "Type your answer...";
          if (savedAnswer !== null) {
            textarea.value = savedAnswer;
          }
          div.appendChild(textarea);
        }

        questionContainer.appendChild(div);

        // Initialize compiler AFTER adding to DOM - render it OUTSIDE the question block
        if (q.type === "CODE") {
          const compilerWrapper = document.createElement("div");
          compilerWrapper.id = `practice-compiler-container-${q.id}`;
          compilerWrapper.style.marginBottom = "30px";
          questionContainer.appendChild(compilerWrapper);

          practiceCompilers[q.id] = new ExamCompiler(`practice-compiler-container-${q.id}`, q.id, q, '/practicetest/api/compile-code/', 'practiceCompilers');
        }
      });

      setupPracticeQuestionFlow(form);

      // Auto-save MCQ/TF/DESC answers
      form.addEventListener("change", (e) => {
        const target = e.target;
        if (target.name && target.name.startsWith("q_")) {
          const questionId = target.name.replace("q_", "");
          const userId = getPracticeUserId();
          const key = `practice_ans_${userId}_${testId}_${questionId}`;
          if (target.type === "radio" && target.checked) {
            localStorage.setItem(key, target.value);
          }
        }
      });

      form.addEventListener("input", (e) => {
        const target = e.target;
        if (target.tagName === "TEXTAREA" && target.name && target.name.startsWith("q_")) {
          const questionId = target.name.replace("q_", "");
          const userId = getPracticeUserId();
          const key = `practice_ans_${userId}_${testId}_${questionId}`;
          localStorage.setItem(key, target.value);
        }
      });
    } catch (err) {
      alert("Failed to load questions. Please try again.");
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    URLS = getApiUrls();
    loadDomains();
    if (domainSelect) {
      domainSelect.addEventListener("change", loadPracticeTestsForDomain);
    }
    loadPracticeTestsForDomain();

    // Auto-resume active practice test if page was refreshed/reloaded
    const activeTestId = sessionStorage.getItem("active_practice_test_id");
    if (activeTestId) {
      startTest(activeTestId);
    }

    // Auto-heals / triggers fullscreen upon interaction if test is active
    document.addEventListener("click", function requestFS() {
      if (sessionStorage.getItem("active_practice_test_id") && !document.fullscreenElement) {
        enterFullscreen();
      }
    });

    // Handle form submission to collect code from compilers
    form.addEventListener("submit", function (e) {
      if (practiceTimerInterval) {
        clearInterval(practiceTimerInterval);
        practiceTimerInterval = null;
      }
      
      const testIdMatch = form.action.match(/\/([a-f0-9-]+)\/$/);
      let testId = "";
      if (testIdMatch) {
        testId = testIdMatch[1];
        const startTime = sessionStorage.getItem(`practice_test_${testId}_start_time`);
        if (startTime) {
          const timeTakenSeconds = Math.floor((Date.now() - parseInt(startTime)) / 1000);

          // Add time_taken to form
          let timeInput = form.querySelector('input[name="time_taken"]');
          if (!timeInput) {
            timeInput = document.createElement("input");
            timeInput.type = "hidden";
            timeInput.name = "time_taken";
            form.appendChild(timeInput);
          }
          timeInput.value = timeTakenSeconds;

          // Clear stored start time
          sessionStorage.removeItem(`practice_test_${testId}_start_time`);
        }
      }

      // Check if there are any CODE questions with compilers
      const questionBlocks = document.querySelectorAll(".question-block");
      let hasCodeQuestions = false;

      questionBlocks.forEach(block => {
        const questionId = block.dataset.questionId;
        const questionType = block.dataset.questionType;

        if (questionType === 'CODE' && practiceCompilers[questionId]) {
          hasCodeQuestions = true;
          const compiler = practiceCompilers[questionId];
          const code = compiler.saveCode();
          const language = document.getElementById(`lang-${questionId}`).value;

          // Create hidden input for code submission
          let hiddenInput = form.querySelector(`input[name="q_${questionId}"]`);
          if (!hiddenInput) {
            hiddenInput = document.createElement("input");
            hiddenInput.type = "hidden";
            hiddenInput.name = `q_${questionId}`;
            form.appendChild(hiddenInput);
          }
          hiddenInput.value = JSON.stringify({ code: code, language: language });
        }
      });

      // Prevent previous-attempt code from reappearing on next test start.
      const questionData = Array.from(questionBlocks).map((b) => ({
        id: b.dataset.questionId,
        type: b.dataset.questionType
      }));
      clearPracticeCodeDrafts(questionData);

      // Clear all saved practice test answers and active test id from localStorage
      if (testId) {
        const userId = getPracticeUserId();
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`practice_ans_${userId}_${testId}_`)) {
            localStorage.removeItem(key);
          }
        });
      }
      sessionStorage.removeItem("active_practice_test_id");
      document.body.classList.remove("practice-active");

      // Exit fullscreen if active
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

      // Let form submit naturally (no preventDefault)
    });
  });
})();