// static/js/admin_trainer.js
(function () {
  'use strict';

  // ---------------- DOM References ----------------
  const pageEl = document.getElementById('trainerPageEl');
  if (!pageEl) return;

  const urlsRoot = document.getElementById('trainer-api-urls');
  if (!urlsRoot) {
    console.warn('API URLs element not found.');
    return;
  }

  const URLS = {
    list: urlsRoot.dataset.listUrl,
    delete: urlsRoot.dataset.deleteUrl,
    download: urlsRoot.dataset.downloadUrl,
  };

  const tbody = document.querySelector('#trainerTable tbody');
  const cardsGrid = document.getElementById('trainerCardsGrid');
  const tableWrapper = document.getElementById('trainerTableWrapper');
  const searchInput = document.getElementById('trainerSearch');
  const refreshBtn = document.getElementById('refreshBtn');
  
  const viewGridBtn = document.getElementById('viewGridBtn');
  const viewTableBtn = document.getElementById('viewTableBtn');

  let paginationEl = document.getElementById('trainerPagination');
  if (!paginationEl) {
    paginationEl = document.createElement('div');
    paginationEl.id = 'trainerPagination';
    paginationEl.className = 'pagination-container table-footer-controls';
    pageEl.appendChild(paginationEl);
  }

  // ---------------- State ----------------
  let TRAINERS = [];
  let FILTER = '';
  let currentPage = 1;
  const perPage = 12; // 12 cards look better on grids
  let viewMode = localStorage.getItem('trainer_view_mode') || 'grid'; // default 'grid'
  let isLoading = false;

  let pageMeta = {
    page: 1,
    num_pages: 1,
    total: 0,
    has_next: false,
    has_prev: false,
  };

  // ---------------- Helpers & Utilities ----------------
  function getCsrfFromCookie(name = 'csrftoken') {
    const input = document.querySelector('[name=csrfmiddlewaretoken]');
    if (input && input.value) return input.value;
    const cookieStr = document.cookie || '';
    const cookies = cookieStr.split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === name) return decodeURIComponent(v || '');
    }
    return '';
  }

  function toast(msg, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-fade-out');
      setTimeout(() => el.remove(), 400);
    }, 3500);
  }

  function replaceIdInUrl(url, id) {
    return String(url).replace(/00000000-0000-0000-0000-000000000000/g, String(id));
  }

  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  // Color gradient sets for dynamic initials avatar backgrounds
  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Indigo/Purple
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Mint/Green
    'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', // Warm Orange/Red
    'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', // Ocean Blue
    'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)', // Pink/Coral
    'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)', // Steel Slate Blue
  ];

  function getAvatarStyle(name) {
    let hash = 0;
    const str = name || 'TR';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[idx];
  }

  function getInitials(name) {
    if (!name) return 'TR';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  function setLoader(state = true) {
    if (state) {
      if (viewMode === 'grid' && cardsGrid) {
        cardsGrid.innerHTML = `
          <div class="loading-td" style="grid-column: 1 / -1;">
            <div class="loader-wrapper">
              <div class="spinner"></div>
              <p>Querying trainer database profiles...</p>
            </div>
          </div>
        `;
      } else if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="loading-td">
              <div class="loader-wrapper">
                <div class="spinner"></div>
                <p>Querying trainer database profiles...</p>
              </div>
            </td>
          </tr>
        `;
      }
    }
  }

  // ---------------- Rendering Modes ----------------
  function renderCards() {
    if (!cardsGrid) return;
    cardsGrid.innerHTML = '';

    if (!TRAINERS.length) {
      cardsGrid.innerHTML = `
        <div class="no-data-td" style="grid-column: 1 / -1;">
          <div class="no-data-wrapper">
            <span class="no-data-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></span>
            <p>${FILTER ? 'No trainers match your criteria.' : 'No trainer profiles registered yet.'}</p>
          </div>
        </div>
      `;
      return;
    }

    TRAINERS.forEach(t => {
      const card = document.createElement('div');
      card.className = 'trainer-card card card-hover animate-slide-up';

      // Avatar Circle Header
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'trainer-avatar-circle';
      avatarDiv.style.background = getAvatarStyle(t.name);
      avatarDiv.textContent = getInitials(t.name);

      const nameH3 = document.createElement('h3');
      nameH3.textContent = t.name || '—';

      const emailP = document.createElement('p');
      emailP.className = 'trainer-email';
      emailP.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> <a href="mailto:${t.email}">${t.email || '—'}</a>`;

      // Skills summary
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'trainer-skills-block';
      const summaryTitle = document.createElement('span');
      summaryTitle.className = 'block-label';
      summaryTitle.textContent = 'Skills Overview:';
      const summaryText = document.createElement('p');
      summaryText.textContent = t.skill_summary || 'No skills summary provided.';
      summaryDiv.append(summaryTitle, summaryText);

      // Domains
      const domainsDiv = document.createElement('div');
      domainsDiv.className = 'trainer-domains-block';
      const domains = Array.isArray(t.domains) ? t.domains : (t.domains ? String(t.domains).split(',') : []);
      const subdomains = Array.isArray(t.subdomains) ? t.subdomains : (t.subdomains ? String(t.subdomains).split(',') : []);
      
      const allTags = [...domains, ...subdomains].filter(Boolean);
      if (allTags.length > 0) {
        allTags.forEach(tag => {
          const tagSpan = document.createElement('span');
          tagSpan.className = 'text-tag';
          tagSpan.textContent = tag;
          domainsDiv.appendChild(tagSpan);
        });
      } else {
        domainsDiv.innerHTML = '<span class="text-tag" style="background:#f1f5f9; color:#64748b;">No domains configured</span>';
      }

      // Actions Footer
      const footerActions = document.createElement('div');
      footerActions.className = 'trainer-card-footer';

      if (t.profile_pdf_url) {
        const viewLink = document.createElement('a');
        viewLink.href = t.profile_pdf_url;
        viewLink.target = '_blank';
        viewLink.rel = 'noopener';
        viewLink.className = 'btn btn-primary-sm btn-icon-left';
        viewLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> View PDF`;
        footerActions.appendChild(viewLink);
      } else {
        const noPdf = document.createElement('span');
        noPdf.className = 'badge';
        noPdf.style.background = '#f1f5f9';
        noPdf.style.color = '#64748b';
        noPdf.textContent = 'No Profile PDF';
        footerActions.appendChild(noPdf);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-neutral-sm';
      delBtn.style.color = '#ef4444';
      delBtn.style.border = '1px solid #fee2e2';
      delBtn.style.background = '#fef2f2';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => delTrainer(t.id));
      footerActions.appendChild(delBtn);

      card.append(avatarDiv, nameH3, emailP, summaryDiv, domainsDiv, footerActions);
      cardsGrid.appendChild(card);
    });
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!TRAINERS.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="no-data-td">
            <div class="no-data-wrapper">
              <span class="no-data-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></span>
              <p>${FILTER ? 'No trainers match your criteria.' : 'No trainer profiles registered yet.'}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    TRAINERS.forEach((t, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover-row-effect';

      const tdIdx = document.createElement('td');
      const startIndex = (pageMeta.page - 1) * perPage;
      tdIdx.textContent = String(startIndex + idx + 1);
      tr.appendChild(tdIdx);

      const tdName = document.createElement('td');
      tdName.className = 'td-bold';
      tdName.textContent = t.name || '—';
      tr.appendChild(tdName);

      const tdEmail = document.createElement('td');
      tdEmail.innerHTML = `<a href="mailto:${t.email}">${t.email || '—'}</a>`;
      tr.appendChild(tdEmail);

      const tdSummary = document.createElement('td');
      tdSummary.textContent = t.skill_summary || '—';
      tr.appendChild(tdSummary);

      const tdDomains = document.createElement('td');
      const domains = Array.isArray(t.domains) ? t.domains : (t.domains ? String(t.domains).split(',') : []);
      const subs = Array.isArray(t.subdomains) ? t.subdomains : (t.subdomains ? String(t.subdomains).split(',') : []);
      const combinedTags = [...domains, ...subs].filter(Boolean);
      
      if (combinedTags.length > 0) {
        combinedTags.forEach(tag => {
          const span = document.createElement('span');
          span.className = 'text-tag';
          span.textContent = tag;
          tdDomains.appendChild(span);
        });
      } else {
        tdDomains.textContent = '—';
      }
      tr.appendChild(tdDomains);

      // PDF Link Column
      const tdPdf = document.createElement('td');
      tdPdf.style.textAlign = 'center';
      if (t.profile_pdf_url) {
        const a = document.createElement('a');
        a.href = t.profile_pdf_url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'btn btn-primary-sm btn-icon-left';
        a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> View`;
        tdPdf.appendChild(a);
      } else {
        tdPdf.innerHTML = `<span class="badge" style="background:#f1f5f9; color:#64748b;">No PDF</span>`;
      }
      tr.appendChild(tdPdf);

      // Delete action column
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'center';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-neutral-sm';
      delBtn.style.color = '#ef4444';
      delBtn.style.border = '1px solid #fee2e2';
      delBtn.style.background = '#fef2f2';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => delTrainer(t.id));
      tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  function renderPagination() {
    if (!paginationEl) return;
    const { page, num_pages, has_prev, has_next, total } = pageMeta;
    paginationEl.innerHTML = '';

    if (num_pages <= 1) {
      paginationEl.style.display = 'none';
      return;
    }
    paginationEl.style.display = 'flex';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'pagination-info';
    const startIndex = (page - 1) * perPage + 1;
    const endIndex = Math.min(startIndex + perPage - 1, total);
    infoDiv.textContent = total > 0 ? `Showing ${startIndex} to ${endIndex} of ${total} trainers` : 'No trainers';
    paginationEl.appendChild(infoDiv);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'pagination-controls';

    // Prev Button
    const prevBtn = document.createElement('button');
    prevBtn.className = `btn btn-neutral-sm ${!has_prev ? 'disabled' : ''}`;
    prevBtn.disabled = !has_prev;
    prevBtn.innerHTML = '&larr; Prev';
    prevBtn.addEventListener('click', () => {
      if (has_prev) {
        currentPage = Math.max(1, page - 1);
        loadTrainers();
      }
    });
    controlsDiv.appendChild(prevBtn);

    // Dynamic numeric controls
    const maxPages = 5;
    let startPage = Math.max(1, page - Math.floor(maxPages / 2));
    let endPage = Math.min(num_pages, startPage + maxPages - 1);
    if (endPage - startPage + 1 < maxPages) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `btn btn-neutral-sm ${i === page ? 'active-page' : ''}`;
      pageBtn.textContent = i;
      pageBtn.addEventListener('click', () => {
        currentPage = i;
        loadTrainers();
      });
      controlsDiv.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = `btn btn-neutral-sm ${!has_next ? 'disabled' : ''}`;
    nextBtn.disabled = !has_next;
    nextBtn.innerHTML = "Next &rarr;";
    nextBtn.addEventListener('click', () => {
      if (has_next) {
        currentPage = Math.min(num_pages, page + 1);
        loadTrainers();
      }
    });
    controlsDiv.appendChild(nextBtn);

    paginationEl.appendChild(controlsDiv);
  }

  function syncViewToggleUI() {
    if (viewMode === 'grid') {
      if (cardsGrid) cardsGrid.style.display = 'grid';
      if (tableWrapper) tableWrapper.style.display = 'none';
      if (viewGridBtn) {
        viewGridBtn.className = 'btn btn-primary toggle-btn active-toggle';
      }
      if (viewTableBtn) {
        viewTableBtn.className = 'btn btn-neutral toggle-btn';
      }
    } else {
      if (cardsGrid) cardsGrid.style.display = 'none';
      if (tableWrapper) tableWrapper.style.display = 'block';
      if (viewGridBtn) {
        viewGridBtn.className = 'btn btn-neutral toggle-btn';
      }
      if (viewTableBtn) {
        viewTableBtn.className = 'btn btn-primary toggle-btn active-toggle';
      }
    }
  }

  function render() {
    syncViewToggleUI();
    if (viewMode === 'grid') {
      renderCards();
    } else {
      renderTable();
    }
    renderPagination();
  }

  // ---------------- Data Loading & API Calls ----------------
  async function loadTrainers() {
    if (isLoading) return;
    isLoading = true;
    if (refreshBtn) refreshBtn.disabled = true;
    setLoader(true);

    try {
      const url = new URL(URLS.list, window.location.origin);
      if (FILTER) url.searchParams.set('q', FILTER);
      url.searchParams.set('page', String(currentPage));
      url.searchParams.set('per_page', String(perPage));

      const res = await fetch(url.toString(), { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`List failed: ${res.status}`);
      }

      const data = await res.json();
      
      TRAINERS = data.results || [];
      pageMeta = {
        page: data.page || 1,
        num_pages: data.num_pages || 1,
        total: data.total || 0,
        has_next: Boolean(data.has_next),
        has_prev: Boolean(data.has_prev),
      };

      render();
    } catch (e) {
      console.error(e);
      toast('Unable to query trainers profile records.', 'error');
    } finally {
      isLoading = false;
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function delTrainer(id) {
    if (!id) return;
    const ok = confirm('Are you sure you want to delete this trainer profile? This action is irreversible.');
    if (!ok) return;

    try {
      const url = replaceIdInUrl(URLS.delete, id);
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrfFromCookie() },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        throw new Error(`Deletion failed: ${res.status}`);
      }
      toast('Trainer profile successfully removed.', 'success');
      loadTrainers();
    } catch (e) {
      console.error(e);
      toast('Failed to remove trainer profile.', 'error');
    }
  }

  // ---------------- Event Listeners ----------------
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      FILTER = searchInput.value.trim();
      currentPage = 1;
      loadTrainers();
    }, 350));
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      toast('Syncing records...');
      loadTrainers();
    });
  }

  // Toggles view mode
  viewGridBtn?.addEventListener('click', () => {
    if (viewMode === 'grid') return;
    viewMode = 'grid';
    localStorage.setItem('trainer_view_mode', 'grid');
    render();
  });

  viewTableBtn?.addEventListener('click', () => {
    if (viewMode === 'table') return;
    viewMode = 'table';
    localStorage.setItem('trainer_view_mode', 'table');
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadTrainers();
    }
  });

  // ---------------- Init ----------------
  loadTrainers();
})();
