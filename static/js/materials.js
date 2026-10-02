"use strict";

(function () {

  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"'`=\/]/g, s => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#x60;",
      "=": "&#x3D;",
      "/": "&#x2F;"
    }[s]));
  }

  function getCSRFToken() {
    const name = "csrftoken";
    return (
      document.cookie
        .split(";")
        .map(c => c.trim())
        .find(c => c.startsWith(name + "="))
        ?.split("=")[1] || ""
    );
  }

  function getApiUrl(key) {
    const el = document.getElementById("materials-urls");
    if (!el) throw new Error("Missing API URL container.");
    return el.getAttribute("data-" + key.replace(/_/g, "-"));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  const materialsList = document.getElementById("materialsList");
  const categoryFilter = document.getElementById("categoryFilter");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  let rawMaterialsData = [];

  function showLoader() {
    clear(materialsList);
    const loader = document.createElement("div");
    loader.className = "loading-spinner-wrap";
    loader.style.gridColumn = "1 / -1";
    loader.style.textAlign = "center";
    loader.style.padding = "40px";
    loader.style.color = "var(--text-sub, #64748b)";
    loader.style.fontWeight = "600";
    loader.textContent = "Loading study materials...";
    materialsList.appendChild(loader);
  }

  function populateCategories(data) {
    if (!categoryFilter) return;
    const categories = new Set();
    data.forEach(item => {
      if (item.domain) categories.add(item.domain);
    });

    categoryFilter.innerHTML = '<option value="all">All Materials</option>';
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    });
  }

  function filterAndRenderMaterials() {
    if (!materialsList) return;

    let filtered = [...rawMaterialsData];

    // Filter by Category
    const selectedCategory = categoryFilter ? categoryFilter.value : "all";
    if (selectedCategory && selectedCategory !== "all") {
      filtered = filtered.filter(item => item.domain === selectedCategory);
    }

    // Filter by Search Query
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    if (query) {
      filtered = filtered.filter(item =>
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.domain && item.domain.toLowerCase().includes(query)) ||
        (item.module && item.module.toLowerCase().includes(query)) ||
        (item.material_code && item.material_code.toLowerCase().includes(query))
      );
    }

    // Sort
    const sortVal = sortSelect ? sortSelect.value : "newest";
    if (sortVal === "oldest") {
      filtered.reverse();
    }

    renderMaterialsGrid(filtered);
  }

  function renderMaterialsGrid(data) {
    clear(materialsList);

    if (!Array.isArray(data) || !data.length) {
      const p = document.createElement("p");
      p.className = "empty-state-msg";
      p.textContent = "No study materials available.";
      materialsList.appendChild(p);
      return;
    }

    data.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "material-card";

      const tagText = escapeHtml(item.domain || item.module || "General");
      const titleText = escapeHtml(item.title || "Untitled Material");
      const categoryBreadcrumb = escapeHtml([item.domain, item.subdomain || item.module].filter(Boolean).join(" • ") || "General Material");
      const descriptionText = escapeHtml(item.description || item.title || "Material File");
      const materialCode = escapeHtml(item.material_code || `MAT-${String(index + 1).padStart(4, '0')}`);
      const uploadedOn = escapeHtml(item.uploaded_on || "24 Jul 2026");
      const fileSize = escapeHtml(item.file_size || "245 KB");

      let fileTypeLabel = "PDF Document";
      let downloadBtnLabel = "Download PDF";
      let downloadUrl = item.file_url || "#";

      if (item.ppt_url) {
        fileTypeLabel = "PPT Presentation";
        downloadBtnLabel = "Download PPT";
        downloadUrl = item.ppt_url;
      } else if (item.excel_url) {
        fileTypeLabel = "Excel Sheet";
        downloadBtnLabel = "Download Excel";
        downloadUrl = item.excel_url;
      } else if (item.document_url) {
        fileTypeLabel = "Word Document";
        downloadBtnLabel = "Download Document";
        downloadUrl = item.document_url;
      } else if (item.video_file_url) {
        fileTypeLabel = "Video File";
        downloadBtnLabel = "Watch Video";
        downloadUrl = item.video_file_url;
      } else if (item.video_url) {
        fileTypeLabel = "YouTube Video";
        downloadBtnLabel = "Watch Video";
        downloadUrl = item.video_url;
      }

      const tagClass = (index % 2 === 0) ? "green-tag" : "blue-tag";

      card.innerHTML = `
        <div class="card-top-bar">
          <span class="badge-tag ${tagClass}">${tagText}</span>
          <button type="button" class="card-kebab-btn" title="Options">⋮</button>
        </div>

        <h3 class="card-main-title">${titleText}</h3>

        <div class="file-preview-box">
          <div class="preview-file-icon">
            <svg width="28" height="32" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 0C1.79 0 0 1.79 0 4V24C0 26.21 1.79 28 4 28H20C22.21 28 24 26.21 24 24V8L16 0H4Z" fill="#E2E8F0"/>
              <path d="M16 0V8H24L16 0Z" fill="#CBD5E1"/>
              <line x1="5" y1="12" x2="19" y2="12" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
              <line x1="5" y1="17" x2="15" y2="17" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
              <line x1="5" y1="22" x2="17" y2="22" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="preview-file-info">
            <div class="preview-file-name">${descriptionText}</div>
            <div class="preview-meta-line">Material ID: ${materialCode}</div>
            <div class="preview-meta-line">Uploaded on: ${uploadedOn}</div>
          </div>
        </div>

        <div class="card-bottom-footer">
          <div class="footer-file-meta">
            <span class="file-type-icon">📄</span>
            <div class="file-meta-text">
              <div class="file-type-name">${fileTypeLabel}</div>
              <div class="file-size-val">${fileSize}</div>
            </div>
          </div>
          <a href="${downloadUrl}" class="card-download-btn" target="_blank" download>
            <span class="dl-icon">↓</span> ${downloadBtnLabel}
          </a>
        </div>
      `;

      materialsList.appendChild(card);
    });
  }

  async function loadMaterials() {
    showLoader();
    const url = getApiUrl("get_materials");

    try {
      const res = await fetch(url, {
        headers: { "X-CSRFToken": getCSRFToken() }
      });
      const data = await res.json();
      rawMaterialsData = Array.isArray(data) ? data : [];
      populateCategories(rawMaterialsData);
      filterAndRenderMaterials();
    } catch (err) {
      console.error("Failed to load materials:", err);
      clear(materialsList);
      const p = document.createElement("p");
      p.className = "empty-state-msg";
      p.textContent = "Failed to load study materials.";
      materialsList.appendChild(p);
    }
  }

  // Attach Filter Listeners
  if (categoryFilter) categoryFilter.addEventListener("change", filterAndRenderMaterials);
  if (searchInput) searchInput.addEventListener("input", filterAndRenderMaterials);
  if (sortSelect) sortSelect.addEventListener("change", filterAndRenderMaterials);

  // View mode toggle logic
  const gridViewBtn = document.querySelector(".grid-view-btn");
  const listViewBtn = document.querySelector(".list-view-btn");

  if (gridViewBtn && listViewBtn) {
    gridViewBtn.addEventListener("click", function () {
      gridViewBtn.classList.add("active");
      listViewBtn.classList.remove("active");
      materialsList.classList.remove("list-mode");
      localStorage.setItem("study-materials-view-mode", "grid");
    });

    listViewBtn.addEventListener("click", function () {
      listViewBtn.classList.add("active");
      gridViewBtn.classList.remove("active");
      materialsList.classList.add("list-mode");
      localStorage.setItem("study-materials-view-mode", "list");
    });

    // Restore from localStorage
    const savedMode = localStorage.getItem("study-materials-view-mode");
    if (savedMode === "list") {
      listViewBtn.classList.add("active");
      gridViewBtn.classList.remove("active");
      materialsList.classList.add("list-mode");
    }
  }

  document.addEventListener("DOMContentLoaded", loadMaterials);

})();
