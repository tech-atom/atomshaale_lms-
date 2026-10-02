/* admin_college.js
   FINAL SYNCHRONIZED VERSION
   Features:
   - College CRUD (Add, Edit, Delete)
   - Course CRUD (Add, Edit, Delete)
   - Section CRUD (Add, Edit, Delete)
   - Unified delete modal for all entities
   - Safe DOM updates, CSRF protection, and accessible modals
   Author: Code GPT
*/

// =======================
// === CSRF Utilities ===
// =======================
function getCSRFToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
  const cookieMatch = document.cookie.match('(^|;)\\s*csrftoken\\s*=\\s*([^;]+)');
  return cookieMatch ? cookieMatch.pop() : null;
}

// =======================
// === URL Builders ======
// =======================
function getApiUrl(type, uuid = null) {
  const urlsDiv = document.getElementById('college-api-urls');
  const uuidPlaceholder = '00000000-0000-0000-0000-000000000000';
  if (!urlsDiv) return '';
  if (type === 'add') return urlsDiv.dataset.addCollege;
  if (type === 'update' && uuid) return urlsDiv.dataset.updateCollege.replace(uuidPlaceholder, uuid);
  if (type === 'delete' && uuid) return urlsDiv.dataset.deleteCollege.replace(uuidPlaceholder, uuid);
  return '';
}

function getCourseApiUrl(action, id = null) {
  const urlsDiv = document.getElementById('college-api-urls');
  if (!urlsDiv) return '';
  if (action === 'add') return urlsDiv.dataset.addCourse || '';
  if (action === 'update' && id) return (urlsDiv.dataset.updateCourse || '').replace('0', id);
  if (action === 'delete' && id) return (urlsDiv.dataset.deleteCourse || '').replace('0', id);
  return '';
}

function getSectionApiUrl(action, name = null) {
  if (action === 'add') return '/college/add-section/';
  if (action === 'update' && name) return `/college/update-section/${encodeURIComponent(name)}/`;
  if (action === 'delete' && name) return `/college/delete-section/${encodeURIComponent(name)}/`;
  return '';
}

function getMappingApiUrl(type, uuid = null) {
  const urlsDiv = document.getElementById('college-api-urls');
  const uuidPlaceholder = '00000000-0000-0000-0000-000000000000';
  if (!urlsDiv) return '';
  if (type === 'list' && uuid) return urlsDiv.dataset.getMappings.replace(uuidPlaceholder, uuid);
  if (type === 'add' && uuid) return urlsDiv.dataset.addMapping.replace(uuidPlaceholder, uuid);
  if (type === 'remove' && uuid) return urlsDiv.dataset.removeMapping.replace(uuidPlaceholder, uuid);
  return '';
}

// =======================
// === Fetch JSON Helper =
// =======================
async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, options);
  let json = null;
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.indexOf('application/json') !== -1) {
    try { json = await resp.json(); } catch { json = null; }
  }
  if (!resp.ok) {
    const err = json || { message: resp.statusText || `Request failed with status ${resp.status}` };
    throw err;
  }
  return json;
}

// =======================
// === Toast Utility =====
// =======================
function showToast(message, type = "success") {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'error' ? 'error' : 'success');
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// =======================
// === Modal Helpers =====
// =======================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  const first = modal.querySelector('input,textarea,button');
  if (first) first.focus();
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  const addCollegeBtn = document.getElementById('addCollegeBtn');
  if (addCollegeBtn) addCollegeBtn.focus();
}

// =======================
// === Safe DOM Builders ==
// =======================
function buildCollegeRowDOM(college) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-id', college.id);
  tr.innerHTML = `
    <td></td>
    <td class="col-name">${college.name || ''}</td>
    <td class="col-email">${college.contact_email || ''}</td>
    <td class="col-phone">${college.contact_number || ''}</td>
    <td class="col-address">${college.address || ''}</td>
    <td>
      <button class="edit-btn"
        data-id="${college.id}"
        data-url="${getApiUrl('update', college.id)}"
        data-name="${college.name}"
        data-email="${college.contact_email}"
        data-phone="${college.contact_number}"
        data-address="${college.address}">
        <i class="fa fa-edit"></i> Edit
      </button>
      <button class="delete-btn"
        data-url="${getApiUrl('delete', college.id)}"
        data-id="${college.id}"
        data-name="${college.name}">
        <i class="fa fa-trash"></i> Delete
      </button>
    </td>`;
  return tr;
}

function buildCourseRowDOM(course) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-id', course.id);
  tr.innerHTML = `
    <td></td>
    <td class="course-name">${course.name || ''}</td>
    <td>
      <button class="course-edit-btn"
        data-id="${course.id}"
        data-url="${getCourseApiUrl('update', course.id)}"
        data-name="${course.name}">
        <i class="fa fa-edit"></i> Edit
      </button>
      <button class="course-delete-btn"
        data-id="${course.id}"
        data-url="${getCourseApiUrl('delete', course.id)}"
        data-name="${course.name}">
        <i class="fa fa-trash"></i> Delete
      </button>
    </td>`;
  return tr;
}

function buildSectionRowDOM(section) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-name', section.name);
  tr.innerHTML = `
    <td></td>
    <td class="section-name">${section.name || ''}</td>
    <td>
      <button class="section-edit-btn" data-name="${section.name}">
        <i class="fa fa-edit"></i> Edit
      </button>
      <button class="section-delete-btn" data-name="${section.name}">
        <i class="fa fa-trash"></i> Delete
      </button>
    </td>`;
  return tr;
}

// =======================
// === Helper DOM Actions ==
// =======================
function updateRowNumbers() {
  document.querySelectorAll('#collegeTable tbody tr[data-id]').forEach((r, i) => r.querySelector('td').textContent = i + 1);
  document.querySelectorAll('#courseTable tbody tr[data-id]').forEach((r, i) => r.querySelector('td').textContent = i + 1);
  document.querySelectorAll('#sectionTable tbody tr[data-name]').forEach((r, i) => r.querySelector('td').textContent = i + 1);
}

// =======================
// === DOM Ready Block ===
// =======================
document.addEventListener('DOMContentLoaded', () => {

  // === Modal Initialization ===
  const modalMap = [
    ['addCollegeBtn', 'addModal', 'addCollegeForm'],
    ['addCourseBtn', 'addCourseModal', 'addCourseForm'],
    ['addSectionBtn', 'addSectionModal', 'addSectionForm']
  ];

  modalMap.forEach(([btn, modal, form]) => {
    document.getElementById(btn)?.addEventListener('click', () => {
      document.getElementById(form)?.reset();
      openModal(modal);
    });
  });

  document.querySelectorAll('.close-modal').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.closest('.modal').id))
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
  });
  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); })
  );

  // === College CRUD ===
  document.getElementById('collegeTable')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.edit-btn');
    const delBtn = e.target.closest('.delete-btn');
    if (editBtn) {
      document.getElementById('editCollegeName').value = editBtn.dataset.name;
      document.getElementById('editCollegeEmail').value = editBtn.dataset.email;
      document.getElementById('editCollegePhone').value = editBtn.dataset.phone;
      document.getElementById('editCollegeAddress').value = editBtn.dataset.address;
      document.getElementById('editCollegeForm').setAttribute('data-url', editBtn.dataset.url);
      openModal('editModal');
    }
    if (delBtn) {
      const form = document.getElementById('deleteCollegeForm');
      form.setAttribute('data-url', delBtn.dataset.url);
      form.setAttribute('data-id', delBtn.dataset.id);
      form.setAttribute('data-target', 'college');
      document.getElementById('deleteText').innerText = `Delete "${delBtn.dataset.name}"?`;
      openModal('deleteModal');
    }
  });

  document.getElementById('addCollegeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Adding...';
    try {
      const data = {
        name: document.getElementById('newCollegeName').value.trim(),
        contact_email: document.getElementById('newCollegeEmail').value.trim(),
        contact_number: document.getElementById('newCollegePhone').value.trim(),
        address: document.getElementById('newCollegeAddress').value.trim()
      };
      const json = await fetchJSON(getApiUrl('add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success' && json.college) {
        document.querySelector('#collegeTable tbody').prepend(buildCollegeRowDOM(json.college));
        closeModal('addModal');
        showToast('College added successfully');
        updateRowNumbers();
      } else showToast(json.message || 'Error adding college', 'error');
    } catch (err) {
      showToast(err.message || 'Error adding college', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Add College';
    }
  });

  document.getElementById('editCollegeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const data = {
        name: document.getElementById('editCollegeName').value.trim(),
        contact_email: document.getElementById('editCollegeEmail').value.trim(),
        contact_number: document.getElementById('editCollegePhone').value.trim(),
        address: document.getElementById('editCollegeAddress').value.trim()
      };
      const url = form.getAttribute('data-url');
      const json = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success' && json.college) {
        const row = document.querySelector(`#collegeTable tr[data-id="${json.college.id}"]`);
        if (row) row.replaceWith(buildCollegeRowDOM(json.college));
        closeModal('editModal');
        showToast('College updated successfully');
        updateRowNumbers();
      } else showToast(json.message || 'Error updating college', 'error');
    } catch (err) {
      showToast(err.message || 'Error updating college', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  });

const collegeSearch = document.getElementById('searchInput');

    collegeSearch?.addEventListener('input', function () {
    const value = this.value.toLowerCase();

    document.querySelectorAll('#collegeTable tbody tr').forEach(row => {
    const name = row.querySelector('.col-name')?.textContent.toLowerCase() || '';
    const email = row.querySelector('.col-email')?.textContent.toLowerCase() || '';
    const phone = row.querySelector('.col-phone')?.textContent.toLowerCase() || '';
    const address = row.querySelector('.col-address')?.textContent.toLowerCase() || '';

    if (name.includes(value) || email.includes(value) || phone.includes(value) || address.includes(value)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
      }
    });
  });


  // === Course CRUD ===
  document.getElementById('courseTable')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.course-edit-btn');
    const delBtn = e.target.closest('.course-delete-btn');
    if (editBtn) {
      document.getElementById('editCourseName').value = editBtn.dataset.name;
      document.getElementById('editCourseForm').setAttribute('data-url', editBtn.dataset.url);
      openModal('editCourseModal');
    }
    if (delBtn) {
      const form = document.getElementById('deleteCollegeForm');
      form.setAttribute('data-id', delBtn.dataset.id);
      form.setAttribute('data-target', 'course');
      document.getElementById('deleteText').innerText = `Delete "${delBtn.dataset.name}"?`;
      openModal('deleteModal');
    }
  });

  document.getElementById('addCourseForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Adding...';
    try {
      const data = { name: document.getElementById('newCourseName').value.trim() };
      const json = await fetchJSON(getCourseApiUrl('add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success') {
        const courses = json.courses || (json.course ? [json.course] : []);
        courses.forEach(c => {
          document.querySelector('#courseTable tbody').prepend(buildCourseRowDOM(c));
        });

        // Sync Mapping checkboxes in Mapping Modal
        const mappingScroller = document.querySelector("#mappingModal .checkbox-scroller");
        if (mappingScroller) {
          courses.forEach(c => {
            if (!mappingScroller.querySelector(`input[value="${c.id}"]`)) {
              const label = document.createElement("label");
              label.className = "checkbox-label";
              label.innerHTML = `
                <input type="checkbox" name="map_courses" value="${c.id}">
                <span class="custom-checkbox-text">${c.name}</span>
              `;
              mappingScroller.appendChild(label);
            }
          });
        }

        // Update Courses Count Stat Card
        const statCoursesCount = document.getElementById("stat-courses-count");
        if (statCoursesCount) {
          const currentCount = parseInt(statCoursesCount.textContent, 10) || 0;
          statCoursesCount.textContent = currentCount + courses.length;
        }

        closeModal('addCourseModal');
        showToast(json.message || 'Course(s) added successfully');
        updateRowNumbers();
      } else {
        showToast(json.message || 'Error adding course', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error adding course', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Add Course(s)';
    }
  });

  document.getElementById('editCourseForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const data = { name: document.getElementById('editCourseName').value.trim() };
      const url = form.getAttribute('data-url');
      const json = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success' && json.course) {
        const row = document.querySelector(`#courseTable tr[data-id="${json.course.id}"]`);
        if (row) row.replaceWith(buildCourseRowDOM(json.course));
        closeModal('editCourseModal');
        showToast('Course updated successfully');
        updateRowNumbers();
      } else showToast(json.message || 'Error updating course', 'error');
    } catch (err) {
      showToast(err.message || 'Error updating course', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  });

    const courseSearch = document.getElementById('searchCourseInput');

  courseSearch?.addEventListener('input', function () {
  const value = this.value.toLowerCase();

  document.querySelectorAll('#courseTable tbody tr').forEach(row => {
    const name = row.querySelector('.course-name')?.textContent.toLowerCase() || '';

    row.style.display = name.includes(value) ? '' : 'none';
   });
  });



  // === Section CRUD ===
  document.getElementById('sectionTable')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.section-edit-btn');
    const delBtn = e.target.closest('.section-delete-btn');
    if (editBtn) {
      const name = editBtn.dataset.name;
      document.getElementById('editOldSectionName').value = name;
      document.getElementById('editSectionName').value = name;
      openModal('editSectionModal');
    }
    if (delBtn) {
      const name = delBtn.dataset.name;
      const form = document.getElementById('deleteCollegeForm');
      form.setAttribute('data-name', name);
      form.setAttribute('data-target', 'section');
      document.getElementById('deleteText').innerText = `Delete section "${name}"?`;
      openModal('deleteModal');
    }
  });

  document.getElementById('addSectionForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Adding...';
    try {
      const data = { name: document.getElementById('newSectionName').value.trim() };
      const json = await fetchJSON(getSectionApiUrl('add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success' && json.section) {
        const tbody = document.querySelector('#sectionTable tbody');
        tbody.prepend(buildSectionRowDOM(json.section));
        closeModal('addSectionModal');
        showToast('Section added successfully');
        updateRowNumbers();
      } else showToast(json.message || 'Error adding section', 'error');
    } catch (err) {
      showToast(err.message || 'Error adding section', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Add Section';
    }
  });

  document.getElementById('editSectionForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const oldName = document.getElementById('editOldSectionName').value.trim();
      const newName = document.getElementById('editSectionName').value.trim();
      const data = { name: newName };
      const json = await fetchJSON(getSectionApiUrl('update', oldName), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify(data)
      });
      if (json.status === 'success' && json.section) {
        const row = document.querySelector(`#sectionTable tr[data-name="${oldName}"]`);
        if (row) row.replaceWith(buildSectionRowDOM(json.section));
        closeModal('editSectionModal');
        showToast('Section updated successfully');
        updateRowNumbers();
      } else showToast(json.message || 'Error updating section', 'error');
    } catch (err) {
      showToast(err.message || 'Error updating section', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  });

  const sectionSearch = document.getElementById('searchSectionInput');

sectionSearch?.addEventListener('input', function () {
  const value = this.value.toLowerCase();

  document.querySelectorAll('#sectionTable tbody tr').forEach(row => {
    const name = row.querySelector('.section-name')?.textContent.toLowerCase() || '';

    row.style.display = name.includes(value) ? '' : 'none';
  });
});

  // === Unified Delete ===
  document.getElementById('deleteCollegeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const target = form.dataset.target || 'college';
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Deleting...';
    try {
      let url;
      if (target === 'college') url = form.dataset.url;
      else if (target === 'course') url = getCourseApiUrl('delete', form.dataset.id);
      else if (target === 'section') url = getSectionApiUrl('delete', form.dataset.name);
      const json = await fetchJSON(url, { method: 'POST', headers: { 'X-CSRFToken': getCSRFToken() } });
      if (json.status === 'success') {
        if (target === 'college') document.querySelector(`#collegeTable tr[data-id="${form.dataset.id}"]`)?.remove();
        if (target === 'course') document.querySelector(`#courseTable tr[data-id="${form.dataset.id}"]`)?.remove();
        if (target === 'section') document.querySelector(`#sectionTable tr[data-name="${form.dataset.name}"]`)?.remove();
        closeModal('deleteModal');
        showToast(`${target.charAt(0).toUpperCase() + target.slice(1)} deleted successfully`);
        updateRowNumbers();
      } else showToast(json.message || 'Error deleting', 'error');
    } catch (err) {
      showToast(err.message || 'Error deleting item', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Yes';
    }
  });

  // === Tab Switching Logic ===
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active-pane'));
      
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(`${tabId}-tab`)?.classList.add('active-pane');
    });
  });

  updateRowNumbers();
});

// ==========================
// VIEW COLLEGE STUDENTS
// ==========================

document.getElementById('collegeTable')?.addEventListener('click', async (e)=>{

const btn = e.target.closest('.view-students-btn');
if(!btn) return;

const collegeId = btn.dataset.college;
const collegeName = btn.dataset.name;

document.getElementById("collegeStudentSection").style.display="block";
document.getElementById("selectedCollegeTitle").innerText =
"Students in " + collegeName;

try{

const res = await fetch(`/college/${collegeId}/student-groups/`);
const data = await res.json();

const tbody = document.querySelector("#collegeStudentGroups tbody");
tbody.innerHTML="";

data.groups.forEach(g=>{

const tr=document.createElement("tr");

tr.innerHTML=`
<td>${g.year}</td>
<td>${g.semester}</td>
<td>${g.section}</td>
<td>${g.course}</td>
<td>${g.count}</td>
<td>
<button class="view-group-btn"
data-college="${collegeId}"
data-year="${g.year}"
data-sem="${g.semester}"
data-section="${g.section}"
data-course="${g.course}">
View
</button>
</td>
`;

tbody.appendChild(tr);

});

}catch(err){
showToast("Error loading student groups","error");
}

});

document.addEventListener("click", async function(e){

const btn = e.target.closest(".view-group-btn");
if(!btn) return;

const college = btn.dataset.college;
const year = btn.dataset.year;
const sem = btn.dataset.sem;
const section = btn.dataset.section;
const course = btn.dataset.course;

try{

const url = `/college/students/?college=${college}&year=${year}&semester=${sem}&section=${section}&course=${course}`;

const res = await fetch(url);
const data = await res.json();

const tbody=document.getElementById("studentsTableBody");
tbody.innerHTML="";

data.students.forEach(s=>{

const tr=document.createElement("tr");

tr.innerHTML=`
<td>${s.usn}</td>
<td>${s.name}</td>
<td>${s.email}</td>
<td>${s.course}</td>
<td>${s.year}</td>
<td>${s.semester}</td>
<td>${s.section}</td>
`;

tbody.appendChild(tr);

});

document.getElementById("collegeStudentsList").style.display="block";

}catch(err){
showToast("Error loading students","error");
}

});

// =====================================
// === College Course Mapping Module ===
// =====================================
let currentMappingCollegeId = null;

document.addEventListener("click", async (e) => {
  const mapBtn = e.target.closest(".map-btn");
  if (!mapBtn) return;

  currentMappingCollegeId = mapBtn.dataset.id;
  const collegeName = mapBtn.dataset.name;

  document.getElementById("mappingTitle").innerText = `Map Courses & Sections for ${collegeName}`;
  
  // Clear course and section checkboxes
  document.querySelectorAll('input[name="map_courses"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="map_sections"]').forEach(cb => cb.checked = false);

  openModal("mappingModal");
  await loadCollegeMappings(currentMappingCollegeId);
});

async function loadCollegeMappings(collegeId) {
  const tbody = document.querySelector("#mappingTable tbody");
  tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 10px; color: #777;">Loading mappings...</td></tr>';

  try {
    const res = await fetch(getMappingApiUrl('list', collegeId));
    const data = await res.json();

    if (data.status === "success" && data.mappings.length > 0) {
      tbody.innerHTML = "";
      data.mappings.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="padding: 8px; border: 1px solid #ddd;">${m.course_name}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${m.sections.join(", ") || "None"}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
            <button class="remove-mapping-btn" data-course-id="${m.course_id}" style="background-color: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
              <i class="fa fa-trash"></i> Remove
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 10px; color: #777;">No mappings configured yet.</td></tr>';
    }
  } catch (err) {
    console.error("Error loading mappings:", err);
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 10px; color: #dc3545;">Error loading mappings.</td></tr>';
  }
}

// Handle Form Submission to save mapping
document.getElementById("mappingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentMappingCollegeId) return;

  const courseIds = Array.from(document.querySelectorAll('input[name="map_courses"]:checked')).map(cb => cb.value);
  const sections = Array.from(document.querySelectorAll('input[name="map_sections"]:checked')).map(cb => cb.value);

  if (courseIds.length === 0) {
    showToast("Please select at least one course.", "error");
    return;
  }

  try {
    const token = getCSRFToken();
    const res = await fetch(getMappingApiUrl('add', currentMappingCollegeId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": token
      },
      body: JSON.stringify({
        course_ids: courseIds,
        sections: sections
      })
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("Mapping saved successfully!");
      // Reset checkboxes
      document.querySelectorAll('input[name="map_courses"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="map_sections"]').forEach(cb => cb.checked = false);
      await loadCollegeMappings(currentMappingCollegeId);
    } else {
      showToast(data.message || "Error saving mapping", "error");
    }
  } catch (err) {
    console.error("Error saving mapping:", err);
    showToast("Error saving mapping.", "error");
  }
});

// Handle Delete Mapping Click
document.getElementById("mappingTable")?.addEventListener("click", async (e) => {
  const removeBtn = e.target.closest(".remove-mapping-btn");
  if (!removeBtn || !currentMappingCollegeId) return;

  const courseId = removeBtn.dataset.courseId;

  if (!confirm("Are you sure you want to remove this course mapping?")) return;

  try {
    const token = getCSRFToken();
    const res = await fetch(getMappingApiUrl('remove', currentMappingCollegeId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": token
      },
      body: JSON.stringify({
        course_id: courseId
      })
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("Mapping removed successfully!");
      await loadCollegeMappings(currentMappingCollegeId);
    } else {
      showToast(data.message || "Error removing mapping", "error");
    }
  } catch (err) {
    console.error("Error removing mapping:", err);
    showToast("Error removing mapping.", "error");
  }
});