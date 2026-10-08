(() => {
  'use strict';

  // Use global examCompilers registry from exam_compiler.js
  const examCompilers = window.examCompilers || {};

  function getApiUrls() {
    const apiDiv = document.getElementById('exam-api-urls');
    if (!apiDiv) throw new Error('API URL div not found!');
    return {
      get_exam: apiDiv.dataset.getExam,
      get_exam_questions: apiDiv.dataset.getQuestions,
      live_update: apiDiv.dataset.liveUpdate,
      submit_exam: apiDiv.dataset.submit,
      get_performance: apiDiv.dataset.performance
    };
  }

  let cachedCsrfToken = "";

  function getCurrentUserId() {
    const apiDiv = document.getElementById('exam-api-urls');
    return (apiDiv && apiDiv.dataset.currentUser) ? apiDiv.dataset.currentUser : 'guest';
  }

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith(name + "=")) {
          cookieValue = decodeURIComponent(trimmed.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  function getCsrfToken() {
    if (cachedCsrfToken) return cachedCsrfToken;

    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input && input.value) {
      cachedCsrfToken = input.value;
      return cachedCsrfToken;
    }

    const cookieToken = getCookie("csrftoken");
    if (cookieToken) {
      cachedCsrfToken = cookieToken;
      return cachedCsrfToken;
    }

    return "";
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function setupQuestionFlow(form, onQuestionChange) {
    const questionBlocks = Array.from(form.querySelectorAll(".question-block"));
    const progressEl = document.getElementById("question-progress");
    if (!questionBlocks.length) {
      if (progressEl) progressEl.textContent = "";
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    if (!submitBtn) return;

    submitBtn.id = "submitBtn";

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
      btn.dataset.filter = key;
      btn.textContent = label;
      if (key === activeFilter) {
        btn.classList.add("active");
      }
      filterButtons[key] = btn;
      filterBar.appendChild(btn);
    });

    const palette = document.createElement("div");
    palette.id = "question-palette";

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

    const legend = document.createElement("div");
    legend.className = "status-legend";
    legend.innerHTML = `
      <div class="legend-item"><span class="legend-dot answered"></span> Answered</div>
      <div class="legend-item"><span class="legend-dot unanswered"></span> Unanswered</div>
      <div class="legend-item"><span class="legend-dot review"></span> Review</div>
    `;

    paletteWrap.appendChild(paletteTitle);
    paletteWrap.appendChild(legend);
    paletteWrap.appendChild(filterBar);
    paletteWrap.appendChild(palette);

    const sidePanel = document.getElementById("question-side-panel");
    if (sidePanel) {
      sidePanel.appendChild(paletteWrap);
    } else {
      form.appendChild(paletteWrap);
    }

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
    form.appendChild(nav);

    let currentIndex = 0;
    const reviewSet = new Set();

    const isAnswered = (block) => {
      const questionType = block.dataset.questionType;
      if (questionType === "Code") {
        const questionId = block.dataset.questionId;
        const compiler = examCompilers[questionId];
        if (!compiler || typeof compiler.saveCode !== "function") return false;
        const code = (compiler.saveCode() || "").trim();
        return code.length > 0;
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

    const firstMatchingIndex = () => {
      for (let i = 0; i < questionBlocks.length; i++) {
        if (matchesFilter(questionBlocks[i], i)) return i;
      }
      return -1;
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

    const hasPrevVisible = () => {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (matchesFilter(questionBlocks[i], i)) return true;
      }
      return false;
    };

    const hasNextVisible = () => {
      for (let i = currentIndex + 1; i < questionBlocks.length; i++) {
        if (matchesFilter(questionBlocks[i], i)) return true;
      }
      return false;
    };

    const updatePaletteState = () => {
      questionBlocks.forEach((block, idx) => {
        const btn = paletteButtons[idx];
        if (!btn) return;
        btn.classList.remove("current", "answered", "not-answered");
        btn.classList.toggle("review", reviewSet.has(idx));
        btn.classList.add(isAnswered(block) ? "answered" : "not-answered");
        btn.style.display = matchesFilter(block, idx) ? "inline-flex" : "none";
        if (idx === currentIndex) {
          btn.classList.add("current");
        }
      });

      Object.entries(filterButtons).forEach(([key, btn]) => {
        btn.classList.toggle("active", key === activeFilter);
      });
    };

    const updateQuestionVisibility = () => {
      questionBlocks.forEach((block, idx) => {
        const isActive = idx === currentIndex && matchesFilter(block, idx);
        block.style.display = isActive ? "block" : "none";
        block.classList.toggle("active-question", isActive);

        const questionId = block.dataset.questionId;
        const compilerContainer = document.getElementById(`compiler-container-${questionId}`);
        if (compilerContainer) {
          compilerContainer.style.display = isActive ? "block" : "none";
        }
      });

      prevBtn.disabled = !hasPrevVisible();
      nextBtn.hidden = !hasNextVisible();
      submitBtn.hidden = currentIndex !== questionBlocks.length - 1;
      markReviewBtn.classList.toggle("active", reviewSet.has(currentIndex));
      markReviewBtn.textContent = reviewSet.has(currentIndex) ? "Unmark Review" : "Mark for Review";

      if (progressEl) {
        progressEl.textContent = `Question ${currentIndex + 1} of ${questionBlocks.length}`;
      }

      updatePaletteState();
      if (typeof onQuestionChange === "function") {
        onQuestionChange(currentIndex + 1);
      }
    };

    prevBtn.addEventListener("click", () => {
      goToAdjacentVisible(-1);
    });

    nextBtn.addEventListener("click", () => {
      goToAdjacentVisible(1);
    });

    markReviewBtn.addEventListener("click", () => {
      if (reviewSet.has(currentIndex)) {
        reviewSet.delete(currentIndex);
      } else {
        reviewSet.add(currentIndex);
      }
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

    form.addEventListener("change", updatePaletteState);
    form.addEventListener("input", updatePaletteState);

    updateQuestionVisibility();
  }

  function autoSubmitExam(reason) {
    if (!examInProgress) return;
    window._autoSubmitReason = "tab_switch_exceeded";
    showSecurityNotice(`WARNING: Tab switch limit exceeded. Auto-submitting exam...`, "error", 4000);
    cleanupSecurity();

    setTimeout(() => {
      const form = document.getElementById("exam-form");
      if (form) {
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        }
      }
    }, 1000);
  }

  function showSecurityNotice(message, tone = "warn", duration = 2200) {
    let notice = document.getElementById("security-warning-center");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "security-warning-center";
      document.body.appendChild(notice);
    }

    notice.classList.remove("warn", "error", "show");
    notice.classList.add(tone === "error" ? "error" : "warn");
    notice.textContent = message;

    requestAnimationFrame(() => {
      notice.classList.add("show");
    });

    if (noticeHideTimer) {
      clearTimeout(noticeHideTimer);
    }
    noticeHideTimer = setTimeout(() => {
      notice.classList.remove("show");
    }, duration);
  }

  function updateSecurityCounter() {
    if (!tabSwitchCounterEl) return;
    tabSwitchCounterEl.hidden = false;
    const remaining = Math.max(allowedTabSwitches - securityViolationCount, 0);
    tabSwitchCounterEl.innerHTML = `Tab Switches: <strong style="color: ${securityViolationCount > 0 ? '#dc2626' : '#008037'}">${securityViolationCount}/${allowedTabSwitches}</strong> (Remaining: ${remaining})`;
    tabSwitchCounterEl.classList.toggle("danger", securityViolationCount > 0);
  }

  function registerSecurityViolation(reason) {
    if (!examInProgress) return;
    const now = Date.now();
    // Browsers can trigger both visibility and blur events together.
    if (now - lastViolationAt < 1200) return;
    lastViolationAt = now;

    securityViolationCount++;
    updateSecurityCounter();
    if (securityViolationCount >= allowedTabSwitches) {
      autoSubmitExam(`${reason} limit reached (${securityViolationCount}/${allowedTabSwitches})`);
      return;
    }

    const remaining = Math.max(allowedTabSwitches - securityViolationCount, 0);
    const isTabSwitch = reason.includes("tab") || reason.includes("window") || reason.includes("blur");
    const message = isTabSwitch
      ? `WARNING: You switched tabs / windows (${securityViolationCount}/${allowedTabSwitches}). Remaining warnings: ${remaining}`
      : `WARNING: Security violation (${reason}) (${securityViolationCount}/${allowedTabSwitches}). Remaining warnings: ${remaining}`;
    showSecurityNotice(message, isTabSwitch ? "error" : "warn", 3500);
  }

  async function sendLiveUpdate(statusOverride = null) {
    if (!LIVE_URLS || !LIVE_URLS.live_update || !scheduledExamId) return;

    // Include elapsed time for the currently open question before each heartbeat.
    accumulateCurrentQuestionTime();

    const payloadStatus = statusOverride || (liveTabSwitchCount > 2 ? "suspicious" : "active");

    // Collect current answers for autosave
    const answers = [];
    const blocks = document.querySelectorAll(".question-block");
    blocks.forEach(block => {
      const questionId = block.dataset.questionId;
      const questionType = block.dataset.questionType;

      if (questionType === 'Code' && examCompilers[questionId]) {
        const compiler = examCompilers[questionId];
        const code = compiler.getCode ? compiler.getCode() : "";
        const langEl = document.getElementById(`lang-${questionId}`);
        const language = langEl ? langEl.value : "";
        answers.push({
          question_id: questionId,
          answer: JSON.stringify({ code: code, language: language })
        });
      } else {
        const input = block.querySelector("input[type='radio']:checked");
        const textarea = block.querySelector("textarea");
        const name = input ? input.name : textarea?.name;
        const value = input ? input.value : textarea?.value;
        if (name) {
          answers.push({ question_id: name.replace("q", ""), answer: value });
        }
      }
    });

    try {
      const response = await fetch(LIVE_URLS.live_update, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        body: JSON.stringify({
          schedule_id: scheduledExamId,
          current_question: currentQuestionNumber,
          tab_switch_count: liveTabSwitchCount,
          question_time_map: questionTimeMap,
          status: payloadStatus,
          temp_answers: answers,
          device_token: deviceToken,
          device_hints: getClientDeviceHints()
        })
      });
      if (response.status === 403) {
        const resData = await response.json();
        if (resData.message === "multiple_devices" || resData.error) {
          handleMultipleDeviceKick(resData.error);
        }
      }
    } catch (err) {
      console.error("Live update failed", err);
    }
  }

  function handleMultipleDeviceKick(errorMsg) {
    cleanupSecurity();
    
    // Clear auto-resume state so reload doesn't auto-resume
    sessionStorage.removeItem("active_exam_scheduled_id");
    sessionStorage.removeItem(`exam_${scheduledExamId}_start_time`);
    
    const examArea = document.getElementById("examArea");
    if (examArea) {
      examArea.innerHTML = `
        <div style="text-align: center; padding: 50px 20px; font-family: sans-serif; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; max-width: 600px; margin: 50px auto;">
          <h2 style="margin-top: 0; font-size: 24px;">Exam Session Terminated</h2>
          <p style="font-size: 16px; margin: 15px 0;">${errorMsg || "Multiple device access detected. This attempt is active on another device/window."}</p>
          <a href="/" style="display: inline-block; background-color: #721c24; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 15px;">Go back to Home</a>
        </div>
      `;
      examArea.hidden = false;
    } else {
      alert(errorMsg || "Multiple device access detected. This attempt is active on another device/window.");
      window.location.href = "/";
    }
  }

  function updateCurrentQuestion(questionNumber) {
    accumulateCurrentQuestionTime();
    currentQuestionNumber = Number(questionNumber) > 0 ? Number(questionNumber) : 1;
    questionEnteredAt = Date.now();
    sendLiveUpdate();
  }

  function accumulateCurrentQuestionTime() {
    if (!currentQuestionNumber || !questionEnteredAt) return;
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - questionEnteredAt) / 1000));
    if (elapsedSeconds <= 0) return;

    const key = String(currentQuestionNumber);
    questionTimeMap[key] = (Number(questionTimeMap[key]) || 0) + elapsedSeconds;
    questionEnteredAt = now;
  }

  function visibilityHandler() {
    if (!examInProgress) return;
    if (document.visibilityState === "hidden") {
      // Allow brief 1.5s grace period immediately upon clicking start for initial full-screen transition
      if (Date.now() - examStartedAt < 1500) return;
      liveTabSwitchCount += 1;
      sendLiveUpdate();
      registerSecurityViolation("tab switch");
    }
  }

  function windowBlurHandler() {
    if (!examInProgress) return;
    if (Date.now() - examStartedAt < 1500) return;
    const now = Date.now();
    if (now - lastViolationAt < 1200) return;
    liveTabSwitchCount += 1;
    sendLiveUpdate();
    registerSecurityViolation("window blur / tab switch");
  }

  function preventCopyHandler(e) {
    if (!examInProgress) return;
    e.preventDefault();
    e.stopPropagation();
    showSecurityNotice("Copying is disabled during the assessment.", "error", 2500);
    return false;
  }

  function preventPasteHandler(e) {
    if (!examInProgress) return;
    e.preventDefault();
    e.stopPropagation();
    showSecurityNotice("Pasting is disabled during the assessment. Please type your answers.", "error", 3000);
    return false;
  }

  function preventCutHandler(e) {
    if (!examInProgress) return;
    e.preventDefault();
    e.stopPropagation();
    showSecurityNotice("Cutting content is disabled during the assessment.", "error", 2500);
    return false;
  }

  function preventContextMenuHandler(e) {
    if (!examInProgress) return;
    e.preventDefault();
    e.stopPropagation();
    showSecurityNotice("Right click is disabled during the assessment.", "error", 2500);
    return false;
  }

  function preventDragDropHandler(e) {
    if (!examInProgress) return;
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function preventSelectStartHandler(e) {
    if (!examInProgress) return;
    const target = e.target;
    // Allow cursor/selection inside code editor textarea for typing/editing
    if (target && (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && target.type === "text"))) {
      return true;
    }
    e.preventDefault();
    return false;
  }

  function keydownSecurityHandler(e) {
    if (!examInProgress) return;
    const key = (e.key || "").toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    // Block Copy (Ctrl+C), Paste (Ctrl+V), Cut (Ctrl+X), Select All (Ctrl+A), Print (Ctrl+P), Save (Ctrl+S), Source (Ctrl+U)
    if (ctrlOrCmd && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      const actionMap = { 'c': 'Copying', 'v': 'Pasting', 'x': 'Cutting', 'a': 'Select all', 'p': 'Printing', 's': 'Saving', 'u': 'Viewing source' };
      showSecurityNotice(`${actionMap[key] || 'Shortcut'} is disabled during the assessment.`, "error", 2500);
      return false;
    }

    // Block Shift+Insert (Paste) and Ctrl+Insert (Copy)
    if ((e.shiftKey && key === "insert") || (ctrlOrCmd && key === "insert")) {
      e.preventDefault();
      e.stopPropagation();
      showSecurityNotice("Clipboard shortcuts are disabled.", "error", 2500);
      return false;
    }

    // Block DevTools shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C)
    if (key === "f12" || (ctrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
      e.preventDefault();
      e.stopPropagation();
      showSecurityNotice("Developer tools are disabled during the assessment.", "error", 2500);
      return false;
    }

    // Block browser refresh (F5, Ctrl+R)
    if (key === "f5" || (ctrlOrCmd && key === 'r')) {
      e.preventDefault();
      e.stopPropagation();
      showSecurityNotice("Page refresh is disabled during the exam.", "warn", 2500);
      return false;
    }

    // Block browser Back navigation keyboard shortcuts (Alt+LeftArrow, Backspace outside input)
    if (e.altKey && (key === "arrowleft" || key === "left")) {
      e.preventDefault();
      e.stopPropagation();
      showSecurityNotice("Back navigation is disabled during the exam.", "warn", 2500);
      return false;
    }

    if (key === "backspace") {
      const target = e.target;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!isInput) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
  }

  function beforeUnloadHandler(e) {
    if (examInProgress) {
      e.preventDefault();
      e.returnValue = "Your exam session is in progress. Leaving this page will submit your test.";
      return e.returnValue;
    }
  }

  function fullscreenChangeHandler() {
    if (!enforceFullscreen || !examInProgress) return;
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement ||
      document.mozFullScreenElement || document.msFullscreenElement);
    if (!isFullscreen) {
      if (document.visibilityState === "hidden") return;
      registerSecurityViolation("fullscreen exit");
      if (securityViolationCount < allowedTabSwitches) {
        enterFullscreen().catch(() => { });
      }
    }
  }

  function cleanupSecurity() {
    window.removeEventListener("keydown", keydownSecurityHandler, true);
    document.removeEventListener("keydown", keydownSecurityHandler, true);
    window.removeEventListener("copy", preventCopyHandler, true);
    document.removeEventListener("copy", preventCopyHandler, true);
    window.removeEventListener("paste", preventPasteHandler, true);
    document.removeEventListener("paste", preventPasteHandler, true);
    window.removeEventListener("cut", preventCutHandler, true);
    document.removeEventListener("cut", preventCutHandler, true);
    window.removeEventListener("contextmenu", preventContextMenuHandler, true);
    document.removeEventListener("contextmenu", preventContextMenuHandler, true);
    window.removeEventListener("drop", preventDragDropHandler, true);
    document.removeEventListener("drop", preventDragDropHandler, true);
    window.removeEventListener("dragstart", preventDragDropHandler, true);
    document.removeEventListener("dragstart", preventDragDropHandler, true);
    window.removeEventListener("selectstart", preventSelectStartHandler, true);
    document.removeEventListener("selectstart", preventSelectStartHandler, true);
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.removeEventListener("blur", windowBlurHandler);
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
    document.removeEventListener("webkitfullscreenchange", fullscreenChangeHandler);
    document.removeEventListener("mozfullscreenchange", fullscreenChangeHandler);
    document.removeEventListener("msfullscreenchange", fullscreenChangeHandler);
    examInProgress = false;
    enforceFullscreen = false;
    if (timerInterval) clearInterval(timerInterval);
    if (liveUpdateInterval) clearInterval(liveUpdateInterval);
  }

  function getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          return {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '',
            renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
          };
        }
      }
    } catch (e) {}
    return { vendor: '', renderer: '' };
  }

  function isMobileDevice() {
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    const touchPoints = navigator.maxTouchPoints || (navigator.msMaxTouchPoints || 0);
    const hasTouch = touchPoints > 0 || ('ontouchstart' in window);
    const isMacPlatform = /Macintosh|MacIntel/i.test(navigator.platform || '') || /Macintosh|Mac OS X/i.test(navigator.userAgent || '');
    if (isMacPlatform && touchPoints > 0) return true;
    const webgl = getWebGLInfo();
    const renderer = (webgl.renderer || '').toLowerCase();
    const vendor = (webgl.vendor || '').toLowerCase();
    const isMobileGpu = /adreno|mali|immortalis|xclipse|powervr/i.test(renderer) || /qualcomm|arm|imagination|mediatek/i.test(vendor);
    if (isMobileGpu) return true;
    const minDim = Math.min(window.screen.width || 0, window.screen.height || 0);
    if (hasTouch && minDim > 0 && minDim <= 550) return true;
    return false;
  }

  function getClientDeviceHints() {
    const webgl = getWebGLInfo();
    const touchPoints = navigator.maxTouchPoints || (navigator.msMaxTouchPoints || 0);
    const hasTouch = touchPoints > 0 || ('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch);
    const width = window.screen ? (window.screen.width || 0) : 0;
    const height = window.screen ? (window.screen.height || 0) : 0;
    const pixelRatio = window.devicePixelRatio || 1;
    
    let uaDataPlatform = '';
    let uaDataMobile = false;
    if (navigator.userAgentData) {
      uaDataPlatform = navigator.userAgentData.platform || '';
      uaDataMobile = !!navigator.userAgentData.mobile;
    }

    return {
      is_mobile: isMobileDevice(),
      screen_width: width,
      screen_height: height,
      screen: `${width}x${height}`,
      pixel_ratio: pixelRatio,
      touch_points: touchPoints,
      has_touch: !!hasTouch,
      webgl_vendor: webgl.vendor || '',
      webgl_renderer: webgl.renderer || '',
      platform: navigator.platform || '',
      ua_data_platform: uaDataPlatform,
      ua_data_mobile: uaDataMobile,
      user_agent: navigator.userAgent || ''
    };
  }

  function supportsFullscreen() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
  }

  async function enterFullscreen() {
    if (!supportsFullscreen()) {
      return false;
    }

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

  let securityViolationCount = 0, timerInterval = null, scheduledExamId = null, examDuration = 0, allowedTabSwitches = 3, lastViolationAt = 0, tabSwitchCounterEl = null, noticeHideTimer = null;
  let liveUpdateInterval = null, liveTabSwitchCount = 0, currentQuestionNumber = 1;
  let questionTimeMap = {}, questionEnteredAt = Date.now();
  let LIVE_URLS = null;
  let examInProgress = false;
  let enforceFullscreen = false;
  let examStartedAt = 0;

  let deviceToken = sessionStorage.getItem('exam_device_token');
  if (!deviceToken) {
    deviceToken = 'dt_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    sessionStorage.setItem('exam_device_token', deviceToken);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    getCsrfToken(); // Cache the CSRF token immediately from the server-rendered template form
    document.body.classList.remove("exam-active");

    // Prevent back button navigation during exam
    history.pushState(null, null, location.href);
    window.onpopstate = function () {
      history.pushState(null, null, location.href);
      if (examInProgress) {
        showSecurityNotice("Back navigation is disabled during the assessment.", "warn", 3000);
      }
    };

    if (isMobileDevice()) {
      showSecurityNotice("Mobile detected. Fullscreen will be requested when you start the exam.", "warn", 2600);
    }

    const URLS = getApiUrls();
    LIVE_URLS = URLS;
    const loader = document.getElementById("exam-loader");
    const declaration = document.getElementById("declaration");
    const startBtn = document.getElementById("startButton");
    const form = document.getElementById("exam-form");
    const table = document.getElementById("exam-details-table");
    const tableBody = document.getElementById("exam-table-body");
    const examArea = document.getElementById("examArea");
    const examTitle = document.getElementById("exam-title");
    tabSwitchCounterEl = document.getElementById("tab-switch-counter");
    const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

    let res, data;

    try {
      res = await fetch(URLS.get_exam, { credentials: 'include' });
      data = await res.json();
    } catch (e) {
      loader.textContent = "Failed to load exams.";
      return;
    }

    const pendingExams = (data.exams || []).filter(e => !e.already_attempted);

    if (pendingExams.length === 0) {
      loader.textContent = "No ongoing exam currently.";
      return;
    }

    loader.hidden = true;
    table.hidden = false;

    const mobileCardContainer = document.getElementById("exam-mobile-card");
    if (mobileCardContainer) {
      mobileCardContainer.innerHTML = "";
    }
    tableBody.innerHTML = "";

    const agreeCheckbox = document.getElementById("agreeDeclaration");
    if (agreeCheckbox) {
      agreeCheckbox.addEventListener("change", function () {
        startBtn.hidden = !this.checked;
      });
    }

    pendingExams.forEach((exam) => {
      const tr = document.createElement("tr");
      [
        exam.title, exam.duration, exam.max_marks || "-",
        exam.negative_mark || "0",
        exam.start_display || new Date(exam.start).toLocaleDateString(),
        exam.start_time_display || new Date(exam.start).toLocaleTimeString(),
        exam.end_display || new Date(exam.end).toLocaleDateString(),
        exam.end_time_display || new Date(exam.end).toLocaleTimeString()
      ].forEach((val) => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });

      const actionTd = document.createElement('td');
      const takeExamBtn = document.createElement('button');
      takeExamBtn.type = "button";
      takeExamBtn.className = "take-exam-btn";
      
      if (exam.already_attempted) {
        takeExamBtn.textContent = "Submitted";
        takeExamBtn.disabled = true;
        takeExamBtn.style.opacity = "0.6";
        takeExamBtn.style.cursor = "not-allowed";
      } else {
        takeExamBtn.textContent = "Take Exam";
      }
      actionTd.appendChild(takeExamBtn);
      tr.appendChild(actionTd);
      tableBody.appendChild(tr);

      // Build Mobile Card View
      let mobileCard = null;
      if (mobileCardContainer) {
        const examTitleVal = exam.title || "Trail";
        const examDurationVal = exam.duration || "10";
        const examMaxMarksVal = exam.max_marks || "5";
        const examNegativeMarkVal = exam.negative_mark || "0";
        const examStartDateVal = exam.start_display || new Date(exam.start).toLocaleDateString();
        const examStartTimeVal = exam.start_time_display || new Date(exam.start).toLocaleTimeString();
        const examEndDateVal = exam.end_display || new Date(exam.end).toLocaleDateString();
        const examEndTimeVal = exam.end_time_display || new Date(exam.end).toLocaleTimeString();

        mobileCard = document.createElement("div");
        mobileCard.className = "mobile-exam-card";
        mobileCard.innerHTML = `
          <div class="mobile-exam-card-header">
            <div class="mobile-exam-header-labels">
              <div>TITLE</div>
              <div>DURATION (MIN)</div>
              <div>TOTAL MARKS</div>
              <div>NEGATIVE MARK</div>
              <div>EXAM DATE</div>
            </div>
            <div class="mobile-exam-header-values">
              <div>${examTitleVal}</div>
              <div>${examDurationVal}</div>
              <div>${examMaxMarksVal}</div>
              <div>${examNegativeMarkVal}</div>
              <div>${examStartDateVal}</div>
            </div>
          </div>
          <div class="mobile-exam-card-body">
            <div class="mobile-exam-detail-item">
              <svg class="mobile-detail-icon" viewBox="0 0 24 24" fill="none" stroke="#008037" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <div class="mobile-detail-text">
                <span class="mobile-detail-label">START TIME</span>
                <span class="mobile-detail-value">${examStartTimeVal}</span>
              </div>
            </div>
            <div class="mobile-exam-detail-item">
              <svg class="mobile-detail-icon" viewBox="0 0 24 24" fill="none" stroke="#008037" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div class="mobile-detail-text">
                <span class="mobile-detail-label">END DATE</span>
                <span class="mobile-detail-value">${examEndDateVal}</span>
              </div>
            </div>
            <div class="mobile-exam-detail-item">
              <svg class="mobile-detail-icon" viewBox="0 0 24 24" fill="none" stroke="#008037" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <div class="mobile-detail-text">
                <span class="mobile-detail-label">END TIME</span>
                <span class="mobile-detail-value">${examEndTimeVal}</span>
              </div>
            </div>
          </div>
          <div class="mobile-exam-card-footer">
            <button type="button" class="take-exam-btn mobile-take-btn-action" ${exam.already_attempted ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>${exam.already_attempted ? 'Submitted' : 'Take Exam'}</button>
          </div>
        `;
        mobileCardContainer.appendChild(mobileCard);
      }

      if (!exam.already_attempted) {
        const handleTakeExamClick = () => {
          scheduledExamId = exam.scheduled_exam_id;
          examDuration = exam.duration;
          const configuredTabLimit = Number(exam.allowed_tab_switches);
          allowedTabSwitches = Number.isFinite(configuredTabLimit) && configuredTabLimit > 0 ? configuredTabLimit : 3;
          updateSecurityCounter();
          if (examTitle) {
            examTitle.textContent = exam.title || "Assessment";
          }

          loader.hidden = true;
          table.hidden = true;
          declaration.hidden = false;
          
          if (agreeCheckbox) {
            agreeCheckbox.checked = false;
          }
          startBtn.hidden = true;
          declaration.scrollIntoView({ behavior: 'smooth' });
        };

        takeExamBtn.addEventListener("click", handleTakeExamClick);

        if (mobileCard) {
          const mobileTakeBtnAction = mobileCard.querySelector(".mobile-take-btn-action");
          if (mobileTakeBtnAction) {
            mobileTakeBtnAction.addEventListener("click", handleTakeExamClick);
          }
        }
      }
    });

    // Auto-resume active exam if page was refreshed/reloaded
    const activeExamId = sessionStorage.getItem("active_exam_scheduled_id");
    if (activeExamId) {
      const activeExam = data.exams.find(e => e.scheduled_exam_id === activeExamId);
      if (activeExam && !activeExam.already_attempted) {
        scheduledExamId = activeExam.scheduled_exam_id;
        examDuration = activeExam.duration;
        const configuredTabLimit = Number(activeExam.allowed_tab_switches);
        allowedTabSwitches = Number.isFinite(configuredTabLimit) && configuredTabLimit > 0 ? configuredTabLimit : 3;
        updateSecurityCounter();
        if (examTitle) {
          examTitle.textContent = activeExam.title || "Assessment";
        }

        loader.hidden = true;
        table.hidden = true;
        declaration.hidden = false;
        
        const agreeCheckbox = document.getElementById("agreeDeclaration");
        if (agreeCheckbox) {
          agreeCheckbox.checked = true;
        }
        startBtn.textContent = "Resume Exam";
        startBtn.hidden = false;
        
        showSecurityNotice("Exam in progress. Click 'Resume Exam' to continue.", "info", 3000);
      }
    }

    startBtn.addEventListener("click", async () => {
      // Request fullscreen immediately to preserve user gesture context before fetch
      const fullscreenEntered = await enterFullscreen();
      enforceFullscreen = fullscreenEntered;

      if (!fullscreenEntered && isMobileDevice()) {
        showSecurityNotice("Fullscreen is limited on this mobile browser. Continuing with full-screen layout.", "warn", 2800);
      }

      document.body.classList.add("exam-active");
      examInProgress = true;
      examStartedAt = Date.now();

      // Save active exam details to sessionStorage for reload resilience
      sessionStorage.setItem("active_exam_scheduled_id", scheduledExamId);
      if (!sessionStorage.getItem(`exam_${scheduledExamId}_start_time`)) {
        sessionStorage.setItem(`exam_${scheduledExamId}_start_time`, Date.now());
      }

      table.hidden = true;
      declaration.hidden = true;
      startBtn.hidden = true;

      const sidebar = document.querySelector(".sidebar");
      if (sidebar) sidebar.style.display = "none";

      let qRes, qData;
      try {
        qRes = await fetch(URLS.get_exam_questions.replace(PLACEHOLDER_UUID, scheduledExamId) + "?device_token=" + deviceToken, { credentials: 'include' });
        qData = await qRes.json();
      } catch (err) {
        alert("Failed to load questions.");
        window.location.reload();
        return;
      }

      if (qData.error) {
        if (qData.code === "MULTIPLE_DEVICE") {
          handleMultipleDeviceKick(qData.error);
          return;
        }
        alert(qData.error);
        window.location.reload();
        return;
      }

      const questions = qData.questions;
      const savedAnswers = qData.saved_answers || {};
      shuffleArray(questions);
      while (form.firstChild) form.removeChild(form.firstChild);

      const csrfToken = getCsrfToken();
      if (csrfToken && !form.querySelector("input[name='csrfmiddlewaretoken']")) {
        const csrfInput = document.createElement("input");
        csrfInput.type = "hidden";
        csrfInput.name = "csrfmiddlewaretoken";
        csrfInput.value = csrfToken;
        form.appendChild(csrfInput);
      }

      questions.forEach((q, index) => {
        const qDiv = document.createElement("div");
        qDiv.classList.add("question-block");

        // Store question metadata
        qDiv.dataset.questionId = q.id;
        qDiv.dataset.questionType = q.type;

        const qText = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `Q${index + 1}: `;
        qText.appendChild(strong);
        qText.appendChild(document.createTextNode(q.text));
        qDiv.appendChild(qText);

        if (q.section_tag) {
          const topicEl = document.createElement("p");
          topicEl.className = "question-topic question-topic-corner";
          topicEl.textContent = `Section / Topic: ${q.section_tag}`;
          qDiv.appendChild(topicEl);
        }

        if (q.image_url) {
          const img = document.createElement("img");
          img.src = q.image_url;
          img.alt = "Question Image";
          img.style.maxWidth = "300px";
          img.style.display = "block";
          img.style.margin = "10px 0";
          qDiv.appendChild(img);
        }

        if (q.type === "MCQ" && typeof q.options === "object") {
          let options = q.options;
          if (Array.isArray(options)) {
            let mapped = {};
            options.forEach((val, idx) => {
              let key = String.fromCharCode(65 + idx);
              mapped[key] = val;
            });
            options = mapped;
          }
          Object.entries(options).forEach(([key, value]) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "radio";
            input.name = `q${q.id}`;
            input.value = value;

            const savedAnswerKey = `exam_ans_${getCurrentUserId()}_${scheduledExamId}_${q.id}`;
            let savedAnswer = localStorage.getItem(savedAnswerKey);
            if (savedAnswer === null && savedAnswers[q.id] !== undefined) {
              savedAnswer = savedAnswers[q.id];
              localStorage.setItem(savedAnswerKey, savedAnswer);
            }
            if (savedAnswer === value) {
              input.checked = true;
            }

            label.appendChild(input);
            label.appendChild(document.createTextNode(` (${key}) ${value}`));
            qDiv.appendChild(label);
            qDiv.appendChild(document.createElement("br"));
          });
        }

        if (q.type === "TF") {
          const savedAnswerKey = `exam_ans_${getCurrentUserId()}_${scheduledExamId}_${q.id}`;
          let savedAnswer = localStorage.getItem(savedAnswerKey);
          if (savedAnswer === null && savedAnswers[q.id] !== undefined) {
            savedAnswer = savedAnswers[q.id];
            localStorage.setItem(savedAnswerKey, savedAnswer);
          }

          const labelTrue = document.createElement("label");
          const inputTrue = document.createElement("input");
          inputTrue.type = "radio";
          inputTrue.name = `q${q.id}`;
          inputTrue.value = "True";
          if (savedAnswer === "True") {
            inputTrue.checked = true;
          }
          labelTrue.appendChild(inputTrue);
          labelTrue.appendChild(document.createTextNode(" True"));
          qDiv.appendChild(labelTrue);
          qDiv.appendChild(document.createElement("br"));

          const labelFalse = document.createElement("label");
          const inputFalse = document.createElement("input");
          inputFalse.type = "radio";
          inputFalse.name = `q${q.id}`;
          inputFalse.value = "False";
          if (savedAnswer === "False") {
            inputFalse.checked = true;
          }
          labelFalse.appendChild(inputFalse);
          labelFalse.appendChild(document.createTextNode(" False"));
          qDiv.appendChild(labelFalse);
          qDiv.appendChild(document.createElement("br"));
        }

        if (q.type === "DESC") {
          const textarea = document.createElement("textarea");
          textarea.name = `q${q.id}`;
          textarea.rows = 5;
          textarea.style.width = "100%";
          textarea.placeholder = "Enter your answer here...";

          const savedAnswerKey = `exam_ans_${getCurrentUserId()}_${scheduledExamId}_${q.id}`;
          let savedAnswer = localStorage.getItem(savedAnswerKey);
          if (savedAnswer === null && savedAnswers[q.id] !== undefined) {
            savedAnswer = savedAnswers[q.id];
            localStorage.setItem(savedAnswerKey, savedAnswer);
          }
          if (savedAnswer !== null) {
            textarea.value = savedAnswer;
          }

          qDiv.appendChild(textarea);
        }

        if (q.type === "Code") {
          // For code questions, just add a note in the question block
          const codeNote = document.createElement("p");
          codeNote.textContent = "Write your code below:";
          codeNote.style.marginTop = "10px";
          codeNote.style.fontWeight = "500";
          qDiv.appendChild(codeNote);
        }

        form.appendChild(qDiv);

        // Initialize compiler AFTER adding question to DOM - render it OUTSIDE the question block
        if (q.type === "Code") {
          const compilerWrapper = document.createElement("div");
          compilerWrapper.id = `compiler-container-${q.id}`;
          compilerWrapper.style.marginBottom = "30px";
          form.appendChild(compilerWrapper);

          examCompilers[q.id] = new ExamCompiler(`compiler-container-${q.id}`, q.id);

          const storageKey = examCompilers[q.id].getStorageKey();
          let savedAnswer = localStorage.getItem(storageKey);
          if (!savedAnswer && savedAnswers[q.id]) {
            try {
              const parsed = JSON.parse(savedAnswers[q.id]);
              if (parsed && parsed.code) {
                examCompilers[q.id].setCode(parsed.code);
                localStorage.setItem(storageKey, parsed.code);
                if (parsed.language) {
                  const langSelect = document.getElementById(`lang-${q.id}`);
                  if (langSelect) langSelect.value = parsed.language;
                }
              }
            } catch (err) {
              examCompilers[q.id].setCode(savedAnswers[q.id]);
              localStorage.setItem(storageKey, savedAnswers[q.id]);
            }
          }
        }
      });

      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.textContent = "Submit Exam";
      form.appendChild(submitBtn);
      setupQuestionFlow(form, updateCurrentQuestion);

      // Auto-save MCQ/TF/DESC answers
      form.addEventListener("change", (e) => {
        const target = e.target;
        if (target.name && target.name.startsWith("q") && target.type === "radio" && target.checked) {
          const questionId = target.name.substring(1);
          const currentUserId = getCurrentUserId();
          const key = `exam_ans_${currentUserId}_${scheduledExamId}_${questionId}`;
          localStorage.setItem(key, target.value);
        }
      });

      form.addEventListener("input", (e) => {
        const target = e.target;
        if (target.tagName === "TEXTAREA" && target.name && target.name.startsWith("q")) {
          const questionId = target.name.substring(1);
          const currentUserId = getCurrentUserId();
          const key = `exam_ans_${currentUserId}_${scheduledExamId}_${questionId}`;
          localStorage.setItem(key, target.value);
        }
      });

      examArea.hidden = false;

      // Initial heartbeat for live monitoring when exam starts.
      currentQuestionNumber = 1;
      liveTabSwitchCount = 0;
      questionTimeMap = {};
      questionEnteredAt = Date.now();
      sendLiveUpdate("active");
      if (liveUpdateInterval) clearInterval(liveUpdateInterval);
      liveUpdateInterval = setInterval(() => {
        sendLiveUpdate();
      }, 20000);



      let startTime = sessionStorage.getItem(`exam_${scheduledExamId}_start_time`);
      if (!startTime) {
        startTime = Date.now();
        sessionStorage.setItem(`exam_${scheduledExamId}_start_time`, startTime);
      }
      let totalDurationSeconds = examDuration * 60;
      let elapsedSeconds = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      let timeLeft = Math.max(0, totalDurationSeconds - elapsedSeconds);

      const timerEl = document.getElementById("timer");
      timerInterval = setInterval(() => {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerEl.textContent = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;

        if (timerEl) {
          timerEl.classList.remove("green", "yellow", "red");
          if (timeLeft <= 300) {
            timerEl.classList.add("red");
          } else if (timeLeft <= 900) {
            timerEl.classList.add("yellow");
          } else {
            timerEl.classList.add("green");
          }
        }

        if (--timeLeft < 0) {
          clearInterval(timerInterval);
          form.requestSubmit();
        }
      }, 1000);

      // Anti-cheat Event Listeners
      window.addEventListener("keydown", keydownSecurityHandler, true);
      document.addEventListener("keydown", keydownSecurityHandler, true);
      window.addEventListener("copy", preventCopyHandler, true);
      document.addEventListener("copy", preventCopyHandler, true);
      window.addEventListener("paste", preventPasteHandler, true);
      document.addEventListener("paste", preventPasteHandler, true);
      window.addEventListener("cut", preventCutHandler, true);
      document.addEventListener("cut", preventCutHandler, true);
      window.addEventListener("contextmenu", preventContextMenuHandler, true);
      document.addEventListener("contextmenu", preventContextMenuHandler, true);
      window.addEventListener("drop", preventDragDropHandler, true);
      document.addEventListener("drop", preventDragDropHandler, true);
      window.addEventListener("dragstart", preventDragDropHandler, true);
      document.addEventListener("dragstart", preventDragDropHandler, true);
      window.addEventListener("selectstart", preventSelectStartHandler, true);
      document.addEventListener("selectstart", preventSelectStartHandler, true);
      window.addEventListener("beforeunload", beforeUnloadHandler);
      document.addEventListener("visibilitychange", visibilityHandler);
      window.addEventListener("blur", windowBlurHandler);
      document.addEventListener("fullscreenchange", fullscreenChangeHandler);
      document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);
      document.addEventListener("mozfullscreenchange", fullscreenChangeHandler);
      document.addEventListener("msfullscreenchange", fullscreenChangeHandler);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      accumulateCurrentQuestionTime();
      sendLiveUpdate("submitted");
      const answers = [];
      const blocks = document.querySelectorAll(".question-block");
      blocks.forEach(block => {
        const questionId = block.dataset.questionId;
        const questionType = block.dataset.questionType;

        // Handle Code questions with compiler
        if (questionType === 'Code' && examCompilers[questionId]) {
          const compiler = examCompilers[questionId];
          const code = compiler.saveCode(); // Get code from compiler
          const language = document.getElementById(`lang-${questionId}`).value;
          answers.push({
            question_id: questionId,
            answer: JSON.stringify({ code: code, language: language })
          });
        } else {
          // Handle other question types (MCQ, TF, DESC)
          const input = block.querySelector("input[type='radio']:checked");
          const textarea = block.querySelector("textarea");
          const name = input ? input.name : textarea?.name;
          const value = input ? input.value : textarea?.value;
          if (name) {
            answers.push({ question_id: name.replace("q", ""), answer: value });
          }
        }
      });

      const submissionReason = window._autoSubmitReason || (securityViolationCount >= allowedTabSwitches ? "tab_switch_exceeded" : "normal");

      fetch(URLS.submit_exam.replace(PLACEHOLDER_UUID, scheduledExamId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        body: JSON.stringify({
          answers,
          question_time_map: questionTimeMap,
          device_token: deviceToken,
          device_hints: getClientDeviceHints(),
          tab_switch_count: liveTabSwitchCount || securityViolationCount,
          reason: submissionReason
        }),
        credentials: "include"
      })
        .then(async (res) => {
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            const raw = await res.text();
            const snippet = raw.replace(/\s+/g, " ").slice(0, 180);
            throw new Error(`Server returned non-JSON response (HTTP ${res.status}). ${snippet}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.error) {
            alert("ERROR " + data.error);
            cleanupSecurity();
            document.exitFullscreen?.();
            window.location.reload();
            return;
          }

          // Clear all saved exam codes, answers and session state from localStorage
          const currentUserId = getCurrentUserId();
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('exam_code_') || key.startsWith(`exam_ans_${currentUserId}_${scheduledExamId}_`)) {
              localStorage.removeItem(key);
            }
          });
          sessionStorage.removeItem("active_exam_scheduled_id");
          sessionStorage.removeItem(`exam_${scheduledExamId}_start_time`);

          // Redirect to result page
          cleanupSecurity();
          document.exitFullscreen?.();
          const sidebar = document.querySelector(".sidebar");
          if (sidebar) sidebar.style.display = "block";

          // Use replace to prevent back navigation
          if (data.redirect_url) {
            window.location.replace(data.redirect_url);
          } else if (URLS.get_performance) {
            let targetUrl = URLS.get_performance;
            if (data.result_id && !targetUrl.includes("thank-you")) {
              targetUrl += (targetUrl.includes("?") ? "&" : "?") + `result_id=${data.result_id}`;
            }
            window.location.replace(targetUrl);
          } else if (data.result_id) {
            window.location.replace(`/exam/result/?result_id=${data.result_id}`);
          } else {
            window.location.replace("/");
          }
        })
        .catch(err => {
          alert("ERROR Submission failed: " + err.message);
          // Don't mark as submitted on error
          cleanupSecurity();
          document.exitFullscreen?.();
          window.location.reload();
        });
    });
  });
})();
