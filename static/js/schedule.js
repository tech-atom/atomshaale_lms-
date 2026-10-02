function getCSRFToken() {
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith(name + '=')) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return '';
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"]/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[match]);
}

async function loadSchedule() {
  const tbody = document.getElementById("scheduleTableBody");
  tbody.innerHTML = '<tr><td colspan="5" class="centered-text">Loading schedule...</td></tr>';

  try {
    const res = await fetch("/trainer/api/schedule/", {
      method: 'GET',
      headers: { 'X-CSRFToken': getCSRFToken() },
      credentials: 'include'
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error);

    let data = result.schedule || [];

    // Sort by date and slot number
    data.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
      return a.slotNo - b.slotNo;
    });

    // Date filtering — only today's and future unmarked sessions
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight reset

    // Show all scheduled sessions
    let filtered = data;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="centered-text">No scheduled sessions found.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    filtered.forEach(item => {
      let statusCell = '';
      if (item.is_attendance_marked) {
        if (item.has_report) {
          statusCell = `<span class="status-inline status-done" style="display:inline-flex; align-items:center; background: rgba(0, 128, 55, 0.08); color: #008037; border: 1px solid rgba(0, 128, 55, 0.15); padding: 4px 10px; border-radius: 20px; font-weight:700; font-size:12px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M20 6L9 17L4 12"/></svg>Report Submitted
            </span>`;
        } else {
          statusCell = `<a href="/trainer/report/?session_id=${item.session_id}" class="status-action-btn" style="background:#008037; color:#fff; padding:6px 12px; border-radius:8px; font-weight:700; text-decoration:none; font-size:12px; display:inline-flex; align-items:center; transition: all 0.2s ease; border: 1.5px solid #008037; box-shadow: 0 2px 8px rgba(0, 128, 55, 0.2);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Fill Daily Report
            </a>`;
        }
      } else {
        statusCell = `<a href="/trainer/attendance/" class="status-action-btn" style="background:transparent; color:#d97706; border:1.5px solid #d97706; padding:6px 12px; border-radius:8px; font-weight:700; text-decoration:none; font-size:12px; display:inline-flex; align-items:center; transition: all 0.2s ease;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Mark Attendance
          </a>`;
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHTML(item.date)}</td>
        <td>${escapeHTML(item.collegeName)}</td>
        <td>${escapeHTML(item.batch)}</td>
        <td>${escapeHTML(item.session)}</td>
        <td>${statusCell}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (err) {
    console.error("Error loading schedule:", err);
    tbody.innerHTML = '<tr><td colspan="5" class="centered-text">Failed to load schedule.</td></tr>';
  }
}

document.addEventListener("DOMContentLoaded", loadSchedule);
