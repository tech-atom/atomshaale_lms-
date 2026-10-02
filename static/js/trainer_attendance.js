// Get CSRF Token from DOM
function getCSRFToken() {
  const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
  if (tokenInput) return tokenInput.value;

  const match = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

// Calculate initials for student avatar placeholder
function getInitials(name) {
  if (!name) return 'S';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

// Live recalculate student counts in modal
function updateMetricsCount() {
  const checkboxes = document.querySelectorAll("#studentCardsList input[type=checkbox]");
  const total = checkboxes.length;
  let present = 0;
  
  checkboxes.forEach(chk => {
    if (chk.checked) present++;
  });
  
  const absent = total - present;

  document.getElementById("metricTotal").textContent = total;
  document.getElementById("metricPresent").textContent = present;
  document.getElementById("metricAbsent").textContent = absent;
}

// Load students for a selected session via fetch API
function loadStudents(sessionId) {
  const listContainer = document.getElementById("studentCardsList");
  listContainer.innerHTML = `<div style="text-align:center; padding: 20px; font-weight:bold; color:#008037;">Loading student roster...</div>`;

  fetch(`/trainer/attendance/students/${sessionId}/`)
    .then(res => {
      if (!res.ok) throw new Error("Failed to fetch students");
      return res.json();
    })
    .then(data => {
      listContainer.innerHTML = "";
      document.getElementById("session_id").value = sessionId;

      if (data.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:#64748b;">No students found for this session section.</div>`;
        updateMetricsCount();
        return;
      }

      // Populate student card row elements dynamically (with staggered index delays)
      data.forEach((stud, idx) => {
        const isPresent = stud.existing_status === "Present" || !stud.existing_status;
        const statusLetter = isPresent ? "P" : "A";
        
        const card = document.createElement("div");
        card.className = "student-row-card " + (isPresent ? "is-present" : "is-absent");
        card.setAttribute("data-student-name", stud.user__full_name.toLowerCase());
        card.setAttribute("data-student-roll", (stud.roll_number || "").toLowerCase());
        card.style.animationDelay = (idx * 0.035) + 's';

        card.innerHTML = `
          <div class="student-info-left">
            <div class="student-avatar" style="cursor: pointer; user-select: none;">${statusLetter}</div>
            <div class="student-name-block">
              <span class="student-name-txt">${stud.user__full_name}</span>
              <span class="student-roll-txt">${stud.roll_number || "-"}</span>
            </div>
            <input type="checkbox" id="chk_${stud.id}" name="status_${stud.id}" ${isPresent ? "checked" : ""} style="display: none;">
          </div>
        `;
        listContainer.appendChild(card);
      });

      // Recalculate metrics on initial load
      updateMetricsCount();

      // Bind dynamic toggle logic on card box click
      document.querySelectorAll(".student-row-card").forEach(card => {
        card.style.cursor = "pointer";
        card.style.userSelect = "none";
        
        card.addEventListener("click", e => {
          const input = card.querySelector("input[type=checkbox]");
          const avatar = card.querySelector(".student-avatar");
          
          input.checked = !input.checked;
          
          if (input.checked) {
            card.classList.remove("is-absent");
            card.classList.add("is-present");
            avatar.textContent = "P";
          } else {
            card.classList.remove("is-present");
            card.classList.add("is-absent");
            avatar.textContent = "A";
          }
          
          updateMetricsCount();
        });
      });
    })
    .catch(err => {
      listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:#dc2626; font-weight:bold;">Error loading students. Please try again.</div>`;
      console.error(err);
    });
}

// Initialize components when DOM is fully ready
document.addEventListener("DOMContentLoaded", () => {

  const searchInput = document.getElementById("sessionSearchInput");
  const statusFilter = document.getElementById("sessionStatusFilter");
  const sessionCards = document.querySelectorAll(".session-card");

  // ---------- Sessions Search & Filter List ----------
  function filterSessions() {
    const query = searchInput.value.toLowerCase().trim();
    const status = statusFilter.value; // 'all', 'marked', 'pending'

    sessionCards.forEach(card => {
      const course = card.dataset.course;
      const college = card.dataset.college;
      const domain = card.dataset.domain;
      const cardStatus = card.dataset.status;

      const matchesSearch = course.includes(query) || college.includes(query) || domain.includes(query);
      const matchesStatus = (status === "all") || (cardStatus === status);

      if (matchesSearch && matchesStatus) {
        card.classList.remove("hidden");
      } else {
        card.classList.add("hidden");
      }
    });
  }

  if (searchInput) searchInput.addEventListener("input", filterSessions);
  if (statusFilter) statusFilter.addEventListener("change", filterSessions);


  // ---------- Drawer Opening / Closing ----------
  const drawerOverlay = document.getElementById("attendance-box");
  const markButtons = document.querySelectorAll(".load-attendance-btn");

  markButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".session-card");
      const sessionId = btn.dataset.sessionId;

      const date = card.dataset.date;
      const slot = card.dataset.slot;
      const section = card.dataset.section;
      
      document.getElementById("drawerSessionDetails").textContent = `${date} | ${slot} | Sec ${section.toUpperCase()}`;

      // Open drawer modal
      drawerOverlay.classList.remove("hidden");
      setTimeout(() => {
        drawerOverlay.classList.add("show");
      }, 50);

      loadStudents(sessionId);
    });
  });

  function closeDrawer() {
    drawerOverlay.classList.remove("show");
    setTimeout(() => {
      drawerOverlay.classList.add("hidden");
      // Reset student search input on close
      document.getElementById("studentSearchInput").value = "";
    }, 300);
  }

  ["closeModal", "cancelModal"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", closeDrawer);
  });

  drawerOverlay.addEventListener("click", e => {
    if (e.target === drawerOverlay) closeDrawer();
  });


  // ---------- Student Search inside Drawer ----------
  const studentSearch = document.getElementById("studentSearchInput");
  if (studentSearch) {
    studentSearch.addEventListener("input", () => {
      const rawQuery = studentSearch.value.toLowerCase().trim();
      const rows = document.querySelectorAll(".student-row-card");
      
      if (!rawQuery) {
        rows.forEach(row => row.classList.remove("hidden"));
        return;
      }

      // Split comma separated queries
      const queries = rawQuery.split(",").map(q => q.trim()).filter(q => q !== "");

      rows.forEach(row => {
        const name = row.dataset.studentName;
        const roll = row.dataset.studentRoll;
        
        // Match if ANY sub-query fits name or roll
        const matches = queries.some(q => name.includes(q) || roll.includes(q));

        if (matches) {
          row.classList.remove("hidden");
        } else {
          row.classList.add("hidden");
        }
      });
    });
  }


  // ---------- Bulk Actions (All Present / All Absent) ----------
  document.getElementById("markAllPresentBtn")?.addEventListener("click", () => {
    // Only toggle rows that are NOT currently filtered out/hidden by search
    const visibleCards = document.querySelectorAll(".student-row-card:not(.hidden)");
    visibleCards.forEach(card => {
      const input = card.querySelector("input[type=checkbox]");
      input.checked = true;
      card.classList.remove("is-absent");
      card.classList.add("is-present");
      card.querySelector(".student-avatar").textContent = "P";
    });
    updateMetricsCount();
  });

  document.getElementById("markAllAbsentBtn")?.addEventListener("click", () => {
    const visibleCards = document.querySelectorAll(".student-row-card:not(.hidden)");
    visibleCards.forEach(card => {
      const input = card.querySelector("input[type=checkbox]");
      input.checked = false;
      card.classList.remove("is-present");
      card.classList.add("is-absent");
      card.querySelector(".student-avatar").textContent = "A";
    });
    updateMetricsCount();
  });


  // ---------- Attendance Submission Form Handler ----------
  const form = document.getElementById("attendanceForm");
  const saveSpinner = document.getElementById("saveSpinner");
  const submitBtn = document.getElementById("submitBtn");

  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      
      const url = form.dataset.submitUrl;
      const csrfToken = getCSRFToken();
      const sessionId = document.getElementById("session_id").value;

      // Show save loader
      submitBtn.disabled = true;
      saveSpinner.classList.remove("hidden");

      const formData = new FormData();
      formData.append("session_id", sessionId);

      document.querySelectorAll("#studentCardsList input[type=checkbox]").forEach(input => {
        const id = input.name.split("_")[1];
        const status = input.checked ? "Present" : "Absent";
        formData.append(`status_${id}`, status);
      });

      // Submit via Fetch
      fetch(url, {
        method: "POST",
        headers: {
          "X-CSRFToken": csrfToken,
        },
        body: formData,
        credentials: "same-origin",
      })
        .then(res => {
          if (!res.ok) throw new Error("Submission failed");
          return res.json();
        })
        .then(data => {
          // Hide loader and button lock
          submitBtn.disabled = false;
          saveSpinner.classList.add("hidden");

          // Close Drawer panel
          closeDrawer();

          // Refresh the updated session card status in UI dynamically
          const sessionCard = document.querySelector(`.session-card[data-session-id="${sessionId}"]`);
          if (sessionCard) {
            sessionCard.classList.remove("status-pending");
            sessionCard.classList.add("status-marked");
            sessionCard.querySelector(".status-text").textContent = "Marked";
            sessionCard.querySelector(".load-attendance-btn").innerHTML = "Edit Records &rarr;";
            
            // Adjust card custom data attributes
            sessionCard.setAttribute("data-status", "marked");
          }

          // Trigger smooth local alert toast
          const toast = document.createElement("div");
          toast.style.position = "fixed";
          toast.style.bottom = "20px";
          toast.style.left = "50%";
          toast.style.transform = "translateX(-50%)";
          toast.style.background = "#008037";
          toast.style.color = "#ffffff";
          toast.style.padding = "12px 24px";
          toast.style.borderRadius = "8px";
          toast.style.fontWeight = "bold";
          toast.style.boxShadow = "0 4px 15px rgba(0, 128, 55, 0.25)";
          toast.style.zIndex = "999999";
          toast.style.fontFamily = "'Century Gothic', sans-serif";
          toast.style.fontSize = "13px";
          toast.style.transition = "opacity 0.3s";
          toast.textContent = "Attendance saved successfully!";
          
          document.body.appendChild(toast);
          setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
          }, 3000);
        })
        .catch(err => {
          submitBtn.disabled = false;
          saveSpinner.classList.add("hidden");
          alert("Error saving attendance records. Please try again.");
          console.error(err);
        });
    });
  }
});
