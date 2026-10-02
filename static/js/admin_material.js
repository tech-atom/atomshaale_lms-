// static/js/admin_material.js

document.addEventListener("DOMContentLoaded", () => {
  const apiEl = document.getElementById("material-api-urls");
  if (!apiEl) return console.error("API URL container not found.");

  const api = apiEl.dataset;
  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;

  const materialForm = document.getElementById("material-form");
  const tableBody = document.querySelector("#materials-table tbody");
  const scheduleTable = document.querySelector("#scheduled-table tbody");
  const searchInput = document.getElementById("search-material");
  const toastContainer = document.querySelector(".toast-container");

  const domainSelect = document.getElementById("domain");
  const subdomainSelect = document.getElementById("subdomain");
  const moduleSelect = document.getElementById("module");
  const fileInput = document.getElementById("universal_file");

  let materialsCache = [];
  let schedulesCache = [];

  /* ---------- Toast ---------- */
  function toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /* ---------- Utils ---------- */
  async function safeJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  function createOption(value, text) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  }

  async function fetchOptions(url, select, placeholder = "Select") {
    select.innerHTML = "";
    select.appendChild(createOption("", placeholder));
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      data.forEach(i => select.appendChild(createOption(i.id, i.name)));
    } catch (err) {
      console.error("Dropdown load failed", err);
      toast("Dropdown load failed", "error");
    }
  }
    async function fetchOptions(url, select, placeholder = "Select") {
    select.innerHTML = "";
    select.appendChild(createOption("", placeholder));

    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      console.log("Dropdown API:", data);

      const items = Array.isArray(data)
        ? data
        : (data.subdomains || data.modules || data.domains || []);

      items.forEach(i => {
        const text =
          i.name ||
          i.subdomain_name ||
          i.module_name ||
          i.domain_name ||
          i.title ||
          "";

        select.appendChild(createOption(i.id, text));
      });

    } catch (err) {
      console.error("Dropdown load failed", err);
      toast("Dropdown load failed", "error");
    }
  }

  /* ---------- Dropdown Initialization ---------- */
  (async () => {
    await fetchOptions(api.getDomains, domainSelect, "Select Domain");
  })();

  domainSelect.addEventListener("change", async () => {
    const domainId = domainSelect.value;
    subdomainSelect.innerHTML = "";
    moduleSelect.innerHTML = "";
    if (!domainId) return;

    let subUrl = api.getSubdomains.replace("00000000-0000-0000-0000-000000000000", domainId);
    await fetchOptions(subUrl, subdomainSelect, "Select Subdomain");

    const modUrl = `${api.getModules}?domain_id=${domainId}`;
    await fetchOptions(modUrl, moduleSelect, "Select Module");
  });

  subdomainSelect.addEventListener("change", async () => {
    const domainId = domainSelect.value;
    const subId = subdomainSelect.value;
    if (!domainId) return;

    const url = `${api.getModules}?domain_id=${domainId}&subdomain_id=${subId}`;
    await fetchOptions(url, moduleSelect, "Select Module");
  });


  /* ---------- Upload Material ---------- */
  materialForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = materialForm.title.value.trim();
    const desc = materialForm.description.value.trim();
    const domain = domainSelect.value;
    const moduleVal = moduleSelect.value;
    const files = fileInput.files;

    if (!title || !desc || !domain || !moduleVal || files.length === 0) {
      toast("All fields and at least one file are required.", "error");
      return;
    }

    const fd = new FormData();
    fd.append("title", title);
    fd.append("description", desc);
    fd.append("domain", domain);
    fd.append("subdomain", subdomainSelect.value);
    fd.append("module", moduleVal);
    fd.append("video_url", materialForm.video_url.value);

    for (const file of files) fd.append("files", file);

    try {
      const res = await fetch(api.uploadMaterial, {
        method: "POST",
        headers: { "X-CSRFToken": csrfToken },
        body: fd,
        credentials: "same-origin",
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast(data.message || "Material uploaded");
      materialForm.reset();
      await loadMaterials();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  /* ---------- Load Materials ---------- */
  async function loadMaterials() {
    try {
      const res = await fetch(api.listMaterials, { credentials: "same-origin" });
      const data = await res.json();
      materialsCache = data;
      renderMaterials();
    } catch {
      toast("Failed to load materials", "error");
    }
  }

  function renderMaterials() {
    tableBody.innerHTML = "";
    if (!materialsCache.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="center-text">No materials found</td>`;
      tableBody.appendChild(tr);
      return;
    }

    materialsCache.forEach(m => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${m.title}</td>
        <td>${m.domain}</td>
        <td>${m.subdomain || "-"}</td>
        <td>${m.module}</td>
        <td>
          <button class="btn-schedule" data-id="${m.id}">Schedule</button>
          <button class="btn-delete" data-id="${m.id}">Delete</button>
        </td>`;
      tableBody.appendChild(tr);
    });

    tableBody.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", () => deleteMaterial(btn.dataset.id));
    });

    tableBody.querySelectorAll(".btn-schedule").forEach(btn => {
      btn.addEventListener("click", () => openScheduleForm(btn.dataset.id));
    });
  }

  async function deleteMaterial(id) {
    if (!confirm("Delete this material?")) return;
    const url = api.deleteMaterial.replace("00000000-0000-0000-0000-000000000000", id);
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-CSRFToken": csrfToken },
      credentials: "same-origin",
    });
    const data = await safeJson(res);
    if (!res.ok) toast(data.error, "error");
    else toast("Deleted successfully");
    await loadMaterials();
  }

  /* ---------- Inline Schedule Form ---------- */
  async function openScheduleForm(materialId) {
    const existing = document.getElementById("schedule-form-row");
    if (existing) existing.remove();

    const row = document.querySelector(`button[data-id="${materialId}"]`).closest("tr");
    const formRow = document.createElement("tr");
    formRow.id = "schedule-form-row";
    const cell = document.createElement("td");
    cell.colSpan = 5;

    const form = document.createElement("form");
    form.className = "inline-schedule-form";
    form.innerHTML = `
      <select name="college" required></select>
      <select name="course" required></select>
      <select name="section" required></select>
      <select name="semester" required></select>
      <select name="year" required></select>
      <input type="datetime-local" name="start_datetime" required>
      <input type="datetime-local" name="end_datetime" required>
      <button type="submit" class="btn-primary">Save</button>
      <button type="button" class="btn-delete btn-cancel">Cancel</button>
    `;
    cell.appendChild(form);
    formRow.appendChild(cell);
    row.insertAdjacentElement("afterend", formRow);

    const collegeSel = form.querySelector('[name="college"]');
    const courseSel = form.querySelector('[name="course"]');
    const sectionSel = form.querySelector('[name="section"]');
    const semSel = form.querySelector('[name="semester"]');
    const yearSel = form.querySelector('[name="year"]');

    await fetchOptions(api.getColleges, collegeSel, "Select College");
    await fetchOptions(api.getSemesters, semSel, "Select Semester");
    await fetchOptions(api.getYears, yearSel, "Select Year");

    collegeSel.addEventListener("change", async () => {
      const collegeId = collegeSel.value;
      if (!collegeId) return;
      const url = api.getCourses.replace("00000000-0000-0000-0000-000000000000", collegeId);
      await fetchOptions(url, courseSel, "Select Course");
    });

    courseSel.addEventListener("change", async () => {
      const courseId = courseSel.value;
      if (!courseId) return;
      const url = api.getSections.replace("00000000-0000-0000-0000-000000000000", courseId);
      await fetchOptions(url, sectionSel, "Select Section");
    });

    form.querySelector(".btn-cancel").addEventListener("click", () => formRow.remove());

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.append("material_id", materialId);
      try {
        const res = await fetch(api.scheduleMaterial, {
          method: "POST",
          headers: { "X-CSRFToken": csrfToken },
          body: fd,
          credentials: "same-origin"
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || "Schedule failed");
        toast("Material scheduled");
        formRow.remove();
        await loadSchedules();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  /* ---------- Load Schedules ---------- */
  async function loadSchedules() {
    try {
      const res = await fetch(api.listSchedules, { credentials: "same-origin" });
      const data = await res.json();
      schedulesCache = data;
      renderSchedules();
    } catch {
      toast("Failed to load schedules", "error");
    }
  }

  function renderSchedules() {
    scheduleTable.innerHTML = "";
    if (!schedulesCache.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9" class="center-text">No schedules</td>`;
      scheduleTable.appendChild(tr);
      return;
    }
    schedulesCache.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.material_title}</td>
        <td>${s.college}</td>
        <td>${s.course}</td>
        <td>${s.section}</td>
        <td>${s.semester}</td>
        <td>${s.year}</td>
        <td>${s.start_datetime}</td>
        <td>${s.end_datetime}</td>
        <td><button class="btn-delete" data-id="${s.id}">Delete</button></td>`;
      scheduleTable.appendChild(tr);
    });

    scheduleTable.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!confirm("Delete this schedule?")) return;
        const url = api.deleteSchedule.replace("00000000-0000-0000-0000-000000000000", id);
        const res = await fetch(url, {
          method: "POST",
          headers: { "X-CSRFToken": csrfToken },
          credentials: "same-origin"
        });
        const data = await safeJson(res);
        if (!res.ok) toast(data.error, "error");
        else toast("Schedule deleted");
        await loadSchedules();
      });
    });
  }

  /* ---------- Search ---------- */
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = materialsCache.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.domain || "").toLowerCase().includes(q) ||
      (m.module || "").toLowerCase().includes(q)
    );
    materialsCache = filtered.length ? filtered : materialsCache;
    renderMaterials();
  });

  /* ---------- Initialize ---------- */
  (async () => {
    await loadMaterials();
    await loadSchedules();
  })();
});
