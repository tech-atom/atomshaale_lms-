/* static/js/tpo_resume.js */

document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("resumeSearchInput");
  const tableBody = document.getElementById("resumeTableBody");
  const showingStart = document.getElementById("showingStart");
  const showingEnd = document.getElementById("showingEnd");

  const selectAllCheckbox = document.getElementById("selectAllResumes");
  const bulkBtn = document.getElementById("bulkDownloadZipBtn");
  const configEl = document.getElementById("tpo-resume-config");
  const bulkDownloadUrl = configEl ? configEl.dataset.bulkDownloadUrl : "";

  // 1. Search Filter Logic
  if (searchInput && tableBody) {
    searchInput.addEventListener("keyup", function () {
      const query = this.value.toLowerCase().trim();
      const rows = tableBody.querySelectorAll("tr:not(.no-records-row)");
      let visibleCount = 0;

      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(query)) {
          row.style.display = "";
          visibleCount++;
        } else {
          row.style.display = "none";
          // Uncheck checkbox if hidden
          const cb = row.querySelector(".resume-checkbox");
          if (cb) cb.checked = false;
        }
      });

      if (showingStart && showingEnd) {
        showingStart.textContent = visibleCount > 0 ? "1" : "0";
        showingEnd.textContent = visibleCount.toString();
      }
      updateSelectAllState();
      updateBulkButtonText();
    });
  }

  // 2. Checkboxes Logic
  if (tableBody) {
    tableBody.addEventListener("change", function (e) {
      if (e.target.classList.contains("resume-checkbox")) {
        updateSelectAllState();
        updateBulkButtonText();
      }
    });
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", function () {
      const isChecked = this.checked;
      const visibleCheckboxes = tableBody.querySelectorAll("tr:not([style*='display: none']) .resume-checkbox:not(:disabled)");
      visibleCheckboxes.forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkButtonText();
    });
  }

  function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    const visibleCheckboxes = tableBody.querySelectorAll("tr:not([style*='display: none']) .resume-checkbox:not(:disabled)");
    const checkedVisible = tableBody.querySelectorAll("tr:not([style*='display: none']) .resume-checkbox:not(:disabled):checked");
    
    if (visibleCheckboxes.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
    } else {
      selectAllCheckbox.disabled = false;
      selectAllCheckbox.checked = (visibleCheckboxes.length === checkedVisible.length);
    }
  }

  function updateBulkButtonText() {
    if (!bulkBtn) return;
    const checked = tableBody.querySelectorAll(".resume-checkbox:checked");
    if (checked.length > 0) {
      bulkBtn.innerHTML = `<i class="fas fa-file-archive"></i> Download ZIP (${checked.length})`;
      bulkBtn.style.opacity = "1";
      bulkBtn.style.cursor = "pointer";
    } else {
      bulkBtn.innerHTML = `<i class="fas fa-file-archive"></i> Download ZIP`;
    }
  }

  // Initial state check
  updateSelectAllState();

  // 3. Bulk ZIP Download Submission
  if (bulkBtn) {
    bulkBtn.addEventListener("click", function () {
      const checked = tableBody.querySelectorAll(".resume-checkbox:checked");
      if (checked.length === 0) {
        alert("Please select at least one student resume to download.");
        return;
      }

      if (!bulkDownloadUrl) {
        console.error("Bulk download URL not configured");
        return;
      }

      const studentIds = Array.from(checked).map(cb => cb.dataset.studentId);
      const downloadLink = `${bulkDownloadUrl}?student_ids=${studentIds.join(",")}`;
      
      // Trigger browser download
      window.location.href = downloadLink;
    });
  }
});
