// --- CSRF Helper ---
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const cookie = c.trim();
      if (cookie.startsWith(name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// --- Toast Helper ---
function showToast(msg, type='success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  
  // Trigger entry animation frame
  requestAnimationFrame(() => {
    toast.classList.add('active');
  });

  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- Modal Controls ---
function showModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.getElementById('modalBackdrop');
  if (modal && backdrop) {
    backdrop.classList.add('active');
    modal.classList.add('active');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.getElementById('modalBackdrop');
  if (modal && backdrop) {
    modal.classList.remove('active');
    // Keep backdrop active if another modal is open (e.g., confirm nested within edit)
    const activeModals = document.querySelectorAll('.modal.active, .confirm-modal.active');
    if (activeModals.length <= 1) {
      backdrop.classList.remove('active');
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Grab URLs and configuration from template attributes
  const urlsDiv = document.getElementById('domain-api-urls');
  if (!urlsDiv) return;
  
  const URLS = {
    addDomain: urlsDiv.dataset.addDomain,
    updateDomain: urlsDiv.dataset.updateDomain,
    deleteDomain: urlsDiv.dataset.deleteDomain,
    addSubdomain: urlsDiv.dataset.addSubdomain,
    updateSubdomain: urlsDiv.dataset.updateSubdomain,
    deleteSubdomain: urlsDiv.dataset.deleteSubdomain,
    addModule: urlsDiv.dataset.addModule,
    updateModule: urlsDiv.dataset.updateModule,
    deleteModule: urlsDiv.dataset.deleteModule,
    getSubdomains: urlsDiv.dataset.getSubdomains,
    csrf: urlsDiv.dataset.csrfToken
  };

  // Cache counts selectors
  const countDomains = document.getElementById('count-domains');
  const countSubdomains = document.getElementById('count-subdomains');
  const countModules = document.getElementById('count-modules');

  // Cache dropdown selectors across modals
  const subDomainSelect = document.getElementById('subDomainSelect');
  const modDomainSelect = document.getElementById('modDomainSelect');
  const modSubSelect = document.getElementById('modSubSelect');

  // --- Dynamic Tab Controller ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });

  // --- Close modal backdrops ---
  document.getElementById('modalBackdrop').addEventListener('click', () => {
    document.querySelectorAll('.modal.active, .confirm-modal.active').forEach(modal => {
      closeModal(modal.id);
    });
  });

  // ==========================================
  // DOMAIN HANDLERS & DYNAMIC UDPATE
  // ==========================================
  
  // Helper to re-bind edit/delete event handlers on dynamically created rows
  function bindDomainActions(row) {
    row.querySelector('.edit-domain-btn').onclick = function() {
      document.getElementById('domainModalTitle').innerText = 'Edit Domain';
      document.getElementById('domainId').value = this.dataset.id;
      document.getElementById('domainName').value = this.dataset.name;
      showModal('domainModal');
    };
    row.querySelector('.delete-domain-btn').onclick = function() {
      openConfirmDelete('domain', this.dataset.id);
    };
  }

  // Bind initial DOM rows
  document.querySelectorAll('.edit-domain-btn').forEach(btn => {
    btn.onclick = function() {
      document.getElementById('domainModalTitle').innerText = 'Edit Domain';
      document.getElementById('domainId').value = this.dataset.id;
      document.getElementById('domainName').value = this.dataset.name;
      showModal('domainModal');
    };
  });
  document.querySelectorAll('.delete-domain-btn').forEach(btn => {
    btn.onclick = function() { openConfirmDelete('domain', this.dataset.id); };
  });

  document.getElementById('openDomainModalBtn').onclick = function() {
    document.getElementById('domainForm').reset();
    document.getElementById('domainId').value = '';
    document.getElementById('domainModalTitle').innerText = 'Add Domain';
    showModal('domainModal');
  };
  document.getElementById('closeDomainModalBtn').onclick = function() {
    closeModal('domainModal');
  };

  document.getElementById('domainForm').onsubmit = function(e) {
    e.preventDefault();
    const id = document.getElementById('domainId').value;
    const name = document.getElementById('domainName').value.trim();
    const url = id ? URLS.updateDomain.replace('00000000-0000-0000-0000-000000000000', id) : URLS.addDomain;
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || URLS.csrf },
      body: JSON.stringify({ domain_name: name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'success') {
        if (id) {
          // UPDATE MODE
          const row = document.getElementById(`domain-row-${id}`);
          if (row) {
            row.querySelector('.td-name').textContent = name;
            const editBtn = row.querySelector('.edit-domain-btn');
            if (editBtn) editBtn.dataset.name = name;
          }
          
          // Sync select lists in subdomains/modules modals
          updateSelectOptionText(subDomainSelect, id, name);
          updateSelectOptionText(modDomainSelect, id, name);
          
          showToast('Domain updated successfully.');
        } else {
          // CREATE MODE
          const newId = data.domain.id;
          const newName = data.domain.name;
          const tbody = document.getElementById('domainBody');
          
          const tr = document.createElement('tr');
          tr.id = `domain-row-${newId}`;
          tr.innerHTML = `
            <td data-label="Name" class="td-name font-semibold">${newName}</td>
            <td class="table-actions" data-label="Actions">
              <button class="btn-edit edit-domain-btn" data-id="${newId}" data-name="${newName}" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="btn-delete delete-domain-btn" data-id="${newId}" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          `;
          tbody.appendChild(tr);
          bindDomainActions(tr);
          
          // Increment metric
          countDomains.textContent = parseInt(countDomains.textContent) + 1;
          
          // Sync options select list in modals and filters
          appendSelectOption(subDomainSelect, newId, newName);
          appendSelectOption(modDomainSelect, newId, newName);
          appendSelectOption(document.getElementById('subdomainDomainFilter'), newName, newName);
          appendSelectOption(document.getElementById('moduleDomainFilter'), newName, newName);

          showToast('Domain added successfully.');
        }
        closeModal('domainModal');
      } else {
        showToast(data.errors || data.message, 'error');
      }
    })
    .catch(err => {
      console.error(err);
      showToast('An error occurred.', 'error');
    });
  };

  // Helper utility function to sync options updates
  function updateSelectOptionText(select, value, text) {
    if (!select) return;
    const option = select.querySelector(`option[value="${value}"]`);
    if (option) option.textContent = text;
  }

  function appendSelectOption(select, value, text) {
    if (!select) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  }

  function removeSelectOption(select, value) {
    if (!select) return;
    const option = select.querySelector(`option[value="${value}"]`);
    if (option) option.remove();
  }

  // ==========================================
  // SUBDOMAIN HANDLERS & DYNAMIC UPDATE
  // ==========================================
  
  function bindSubdomainActions(row) {
    row.querySelector('.edit-sub-btn').onclick = function() {
      document.getElementById('subModalTitle').innerText = 'Edit Subdomain';
      document.getElementById('subId').value = this.dataset.id;
      document.getElementById('subDomainSelect').value = this.dataset.domainId;
      document.getElementById('subName').value = this.dataset.name;
      showModal('subModal');
    };
    row.querySelector('.delete-subdomain-btn').onclick = function() {
      openConfirmDelete('subdomain', this.dataset.id);
    };
  }

  document.querySelectorAll('.edit-sub-btn').forEach(btn => {
    btn.onclick = function() {
      document.getElementById('subModalTitle').innerText = 'Edit Subdomain';
      document.getElementById('subId').value = this.dataset.id;
      document.getElementById('subDomainSelect').value = this.dataset.domainId;
      document.getElementById('subName').value = this.dataset.name;
      showModal('subModal');
    };
  });
  document.querySelectorAll('.delete-subdomain-btn').forEach(btn => {
    btn.onclick = function() { openConfirmDelete('subdomain', this.dataset.id); };
  });

  document.getElementById('openSubModalBtn').onclick = function() {
    document.getElementById('subForm').reset();
    document.getElementById('subId').value = '';
    document.getElementById('subModalTitle').innerText = 'Add Subdomain';
    showModal('subModal');
  };
  document.getElementById('closeSubModalBtn').onclick = function() {
    closeModal('subModal');
  };

  document.getElementById('subForm').onsubmit = function(e) {
    e.preventDefault();
    const id = document.getElementById('subId').value;
    const domainId = document.getElementById('subDomainSelect').value;
    const name = document.getElementById('subName').value.trim();
    const domainText = subDomainSelect.options[subDomainSelect.selectedIndex].text;
    const url = id ? URLS.updateSubdomain.replace('00000000-0000-0000-0000-000000000000', id) : URLS.addSubdomain;
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || URLS.csrf },
      body: JSON.stringify({ domain: domainId, subdomain_name: name, id })
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'success') {
        if (id) {
          // UPDATE MODE
          const row = document.getElementById(`subdomain-row-${id}`);
          if (row) {
            row.querySelector('.badge-domain').textContent = domainText;
            row.querySelector('.td-name').textContent = name;
            const editBtn = row.querySelector('.edit-sub-btn');
            if (editBtn) {
              editBtn.dataset.name = name;
              editBtn.dataset.domainId = domainId;
            }
          }
          showToast('Subdomain updated successfully.');
        } else {
          // CREATE MODE
          const newId = data.subdomain.id;
          const newName = data.subdomain.name;
          const newDomain = data.subdomain.domain;
          const tbody = document.getElementById('subBody');
          
          const tr = document.createElement('tr');
          tr.id = `subdomain-row-${newId}`;
          tr.innerHTML = `
            <td data-label="Domain"><span class="badge badge-domain">${newDomain}</span></td>
            <td data-label="Subdomain" class="td-name font-semibold">${newName}</td>
            <td class="table-actions" data-label="Actions">
              <button class="btn-edit edit-sub-btn" data-id="${newId}" data-domain-id="${domainId}" data-name="${newName}" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="btn-delete delete-subdomain-btn" data-id="${newId}" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          `;
          tbody.appendChild(tr);
          bindSubdomainActions(tr);
          
          // Increment metric
          countSubdomains.textContent = parseInt(countSubdomains.textContent) + 1;
          
          // Sync options filter dropdown on modules tab
          const subFilterSelect = document.getElementById('moduleSubdomainFilter');
          const opt = document.createElement('option');
          opt.value = newName;
          opt.textContent = newName;
          opt.dataset.domain = newDomain;
          subFilterSelect.appendChild(opt);

          showToast('Subdomain added successfully.');
        }
        closeModal('subModal');
      } else {
        showToast(data.errors || data.message, 'error');
      }
    })
    .catch(err => {
      console.error(err);
      showToast('An error occurred.', 'error');
    });
  };

  // ==========================================
  // MODULE HANDLERS & DYNAMIC UPDATE
  // ==========================================
  
  function bindModuleActions(row) {
    row.querySelector('.edit-module-btn').onclick = function() {
      document.getElementById('moduleModalTitle').innerText = 'Edit Module';
      document.getElementById('moduleId').value = this.dataset.id;
      document.getElementById('modDomainSelect').value = this.dataset.domainId;
      loadSubOptions(this.dataset.domainId, this.dataset.subId);
      document.getElementById('moduleNameInput').value = this.dataset.name;
      showModal('moduleModal');
    };
    row.querySelector('.delete-module-btn').onclick = function() {
      openConfirmDelete('module', this.dataset.id);
    };
  }

  document.querySelectorAll('.edit-module-btn').forEach(btn => {
    btn.onclick = function() {
      document.getElementById('moduleModalTitle').innerText = 'Edit Module';
      document.getElementById('moduleId').value = this.dataset.id;
      document.getElementById('modDomainSelect').value = this.dataset.domainId;
      loadSubOptions(this.dataset.domainId, this.dataset.subId);
      document.getElementById('moduleNameInput').value = this.dataset.name;
      showModal('moduleModal');
    };
  });
  document.querySelectorAll('.delete-module-btn').forEach(btn => {
    btn.onclick = function() { openConfirmDelete('module', this.dataset.id); };
  });

  document.getElementById('openModuleModalBtn').onclick = function() {
    document.getElementById('moduleForm').reset();
    document.getElementById('moduleId').value = '';
    document.getElementById('modSubSelect').innerHTML = '<option value="">-- Optional --</option>';
    document.getElementById('moduleModalTitle').innerText = 'Add Module';
    showModal('moduleModal');
  };
  document.getElementById('closeModuleModalBtn').onclick = function() {
    closeModal('moduleModal');
  };

  document.getElementById('moduleForm').onsubmit = function(e) {
    e.preventDefault();
    const id = document.getElementById('moduleId').value;
    const domId = document.getElementById('modDomainSelect').value;
    const subId = document.getElementById('modSubSelect').value;
    const name = document.getElementById('moduleNameInput').value.trim();
    
    const domainText = modDomainSelect.options[modDomainSelect.selectedIndex].text;
    const subText = modSubSelect.selectedIndex >= 0 ? modSubSelect.options[modSubSelect.selectedIndex].text : '-';
    
    const url = id ? URLS.updateModule.replace('00000000-0000-0000-0000-000000000000', id) : URLS.addModule;
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || URLS.csrf },
      body: JSON.stringify({ domain: domId, subdomain: subId, module_name: name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'success') {
        if (id) {
          // UPDATE MODE
          const row = document.getElementById(`module-row-${id}`);
          if (row) {
            row.querySelector('.badge-domain').textContent = domainText;
            row.querySelector('.badge-subdomain').textContent = subId ? subText : '-';
            row.querySelector('.td-name').textContent = name;
            const editBtn = row.querySelector('.edit-module-btn');
            if (editBtn) {
              editBtn.dataset.name = name;
              editBtn.dataset.domainId = domId;
              editBtn.dataset.subId = subId;
            }
          }
          showToast('Module updated successfully.');
        } else {
          // CREATE MODE
          const newId = data.module.id;
          const newName = data.module.name;
          const tbody = document.getElementById('moduleBody');
          
          const tr = document.createElement('tr');
          tr.id = `module-row-${newId}`;
          tr.innerHTML = `
            <td data-label="Domain"><span class="badge badge-domain">${domainText}</span></td>
            <td data-label="Subdomain"><span class="badge badge-subdomain">${subId ? subText : '-'}</span></td>
            <td data-label="Module" class="td-name font-semibold">${newName}</td>
            <td class="table-actions" data-label="Actions">
              <button class="btn-edit edit-module-btn" data-id="${newId}" data-domain-id="${domId}" data-sub-id="${subId}" data-name="${newName}" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="btn-delete delete-module-btn" data-id="${newId}" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          `;
          tbody.appendChild(tr);
          bindModuleActions(tr);
          
          // Increment metric
          countModules.textContent = parseInt(countModules.textContent) + 1;

          showToast('Module added successfully.');
        }
        closeModal('moduleModal');
      } else {
        showToast(data.errors || data.message, 'error');
      }
    })
    .catch(err => {
      console.error(err);
      showToast('An error occurred.', 'error');
    });
  };

  // ==========================================
  // CONFIRM DELETE REDIRECT-LESS
  // ==========================================
  
  let deleteType = '', deleteId = '';
  
  function openConfirmDelete(type, id) {
    deleteType = type; 
    deleteId = id;
    document.getElementById('confirmTitle').innerText = `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    document.getElementById('confirmMsg').innerText = `Are you sure you want to delete this ${type}?`;
    showModal('confirmDeleteModal');
  }
  window.openConfirmDelete = openConfirmDelete; // Expose globally for row action bindings

  document.getElementById('closeConfirmModalBtn').onclick = function() {
    closeModal('confirmDeleteModal');
  };
  document.getElementById('cancelConfirmDeleteBtn').onclick = function() {
    closeModal('confirmDeleteModal');
  };

  document.getElementById('confirmDeleteBtn').onclick = function() {
    let url = '';
    if (deleteType === 'domain') url = URLS.deleteDomain.replace('00000000-0000-0000-0000-000000000000', deleteId);
    else if (deleteType === 'subdomain') url = URLS.deleteSubdomain;
    else url = URLS.deleteModule.replace('00000000-0000-0000-0000-000000000000', deleteId);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || URLS.csrf },
      body: deleteType === 'subdomain' ? JSON.stringify({ id: deleteId }) : null
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'success' || data.message === 'Subdomain deleted') {
        if (deleteType === 'domain') {
          const row = document.getElementById(`domain-row-${deleteId}`);
          if (row) {
            const domainNameText = row.querySelector('.td-name').textContent;
            row.remove();
            // Decrement metric
            countDomains.textContent = Math.max(0, parseInt(countDomains.textContent) - 1);
            
            // Sync option selects
            removeSelectOption(subDomainSelect, deleteId);
            removeSelectOption(modDomainSelect, deleteId);
            removeSelectOption(document.getElementById('subdomainDomainFilter'), domainNameText);
            removeSelectOption(document.getElementById('moduleDomainFilter'), domainNameText);
          }
          showToast('Domain deleted successfully.');
        } else if (deleteType === 'subdomain') {
          const row = document.getElementById(`subdomain-row-${deleteId}`);
          if (row) {
            const subNameText = row.querySelector('.td-name').textContent;
            row.remove();
            // Decrement metric
            countSubdomains.textContent = Math.max(0, parseInt(countSubdomains.textContent) - 1);
            
            // Sync option filters
            removeSelectOption(document.getElementById('moduleSubdomainFilter'), subNameText);
          }
          showToast('Subdomain deleted successfully.');
        } else if (deleteType === 'module') {
          const row = document.getElementById(`module-row-${deleteId}`);
          if (row) row.remove();
          // Decrement metric
          countModules.textContent = Math.max(0, parseInt(countModules.textContent) - 1);
          showToast('Module deleted successfully.');
        }
      } else {
        showToast(data.errors || data.message, 'error');
      }
      closeModal('confirmDeleteModal');
    })
    .catch(err => {
      console.error(err);
      showToast('An error occurred during deletion.', 'error');
      closeModal('confirmDeleteModal');
    });
  };

  // --- Subdomain Fetch Helper for Module Form ---
  function loadSubOptions(domainId, selectedId='') {
    const sel = document.getElementById('modSubSelect');
    sel.innerHTML = '<option value="">-- Optional --</option>';
    if (!domainId) return;

    fetch(URLS.getSubdomains.replace('00000000-0000-0000-0000-000000000000', domainId))
      .then(r => r.json())
      .then(d => {
        const subs = Array.isArray(d) ? d : (d.subdomains || []);
        subs.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.subdomain_name;
          if (s.id === selectedId) opt.selected = true;
          sel.appendChild(opt);
        });
      })
      .catch(err => console.error("Subdomain load error:", err));
  }
  window.loadSubOptions = loadSubOptions;

  document.getElementById('modDomainSelect').addEventListener('change', e => {
    loadSubOptions(e.target.value);
  });

  // ==========================================
  // LIVE CLIENT-SIDE FILTERING & SEARCH
  // ==========================================

  // --- Domains Search Filter ---
  const domainSearch = document.getElementById('domainSearch');
  if (domainSearch) {
    domainSearch.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#domainBody tr').forEach(row => {
        const name = row.querySelector('.td-name').textContent.toLowerCase();
        row.style.display = name.includes(q) ? '' : 'none';
      });
    });
  }

  // --- Subdomains Filter & Search ---
  const subdomainSearch = document.getElementById('subdomainSearch');
  const subdomainDomainFilter = document.getElementById('subdomainDomainFilter');

  function filterSubdomains() {
    const q = subdomainSearch.value.toLowerCase();
    const domainFilter = subdomainDomainFilter.value.toLowerCase();

    document.querySelectorAll('#subBody tr').forEach(row => {
      const domainVal = row.querySelector('[data-label="Domain"]').textContent.toLowerCase();
      const subNameVal = row.querySelector('.td-name').textContent.toLowerCase();
      
      const matchesSearch = subNameVal.includes(q);
      const matchesDomain = !domainFilter || domainVal === domainFilter;

      row.style.display = (matchesSearch && matchesDomain) ? '' : 'none';
    });
  }

  if (subdomainSearch) subdomainSearch.addEventListener('input', filterSubdomains);
  if (subdomainDomainFilter) subdomainDomainFilter.addEventListener('change', filterSubdomains);

  // --- Modules Filter & Search ---
  const moduleSearch = document.getElementById('moduleSearch');
  const moduleDomainFilter = document.getElementById('moduleDomainFilter');
  const moduleSubdomainFilter = document.getElementById('moduleSubdomainFilter');

  function filterModules() {
    const q = moduleSearch.value.toLowerCase();
    const domainFilter = moduleDomainFilter.value.toLowerCase();
    const subdomainFilter = moduleSubdomainFilter.value.toLowerCase();

    document.querySelectorAll('#moduleBody tr').forEach(row => {
      const domainVal = row.querySelector('[data-label="Domain"]').textContent.toLowerCase();
      const subdomainVal = row.querySelector('[data-label="Subdomain"]').textContent.toLowerCase();
      const moduleNameVal = row.querySelector('.td-name').textContent.toLowerCase();

      const matchesSearch = moduleNameVal.includes(q);
      const matchesDomain = !domainFilter || domainVal === domainFilter;
      const matchesSubdomain = !subdomainFilter || subdomainVal === subdomainFilter;

      row.style.display = (matchesSearch && matchesDomain && matchesSubdomain) ? '' : 'none';
    });
  }

  // Cascading filters: when domain filter changes, update subdomain filter list options
  if (moduleDomainFilter) {
    moduleDomainFilter.addEventListener('change', function() {
      const domainVal = this.value;
      
      // Reset subdomain filter choice
      moduleSubdomainFilter.value = "";
      
      // Filter options in the subdomain filter select element
      const options = moduleSubdomainFilter.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return; // Keep "All Subdomains"
        const optDomain = opt.dataset.domain;
        if (!domainVal || optDomain === domainVal) {
          opt.style.display = '';
        } else {
          opt.style.display = 'none';
        }
      });
      
      filterModules();
    });
  }

  if (moduleSearch) moduleSearch.addEventListener('input', filterModules);
  if (moduleSubdomainFilter) moduleSubdomainFilter.addEventListener('change', filterModules);

});
