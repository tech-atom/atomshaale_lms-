// static/js/admin_registration.js

document.addEventListener('DOMContentLoaded', () => {
  const backdrop = document.getElementById('modalBackdrop');
  const toast = document.getElementById('toast');
  // Store which button opened each modal for focus restoration
  const modalOpeners = {
    'studentModal': 'btnAddStudent',
    'bulkModal': 'btnBulkStudents',
    'trainerModal': 'btnAddTrainer',
    'tpoModal': 'btnAddTpo',
  };
  let lastOpenedModal = null;

  // Modal open handling
  Object.entries(modalOpeners).forEach(([modalId, btnId]) => {
    const opener = document.getElementById(btnId);
    if (opener) {
      opener.addEventListener('click', () => {
        openModal(modalId);
        lastOpenedModal = modalId;
      });
    }
  });

  // Open modal with focus trap/focus
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    backdrop.style.display = 'block';
    // Focus the first input or the close button
    const focusElem = modal.querySelector('input, select, textarea, button, .close');
    if (focusElem) focusElem.focus();
    lastOpenedModal = id;
  }

  // Close modal, blur focus, restore focus to opener
  function closeModal(modal, openerBtnId = null) {
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    backdrop.style.display = 'none';
    // Blur if focused element is inside modal
    if (modal.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    // Restore focus to opener button (if provided)
    if (openerBtnId) {
      const openerBtn = document.getElementById(openerBtnId);
      if (openerBtn) openerBtn.focus();
    }
  }

  // Close handlers for × and backdrop
  document.querySelectorAll('.modal .close').forEach(span =>
    span.addEventListener('click', function () {
      const modal = this.closest('.modal');
      const openerId = modalOpeners[modal.id] || null;
      closeModal(modal, openerId);
    })
  );
  backdrop.addEventListener('click', () => {
    // Hide all modals and blur focus
    document.querySelectorAll('.modal').forEach(modal => {
      closeModal(modal, modalOpeners[modal.id] || null);
    });
  });

  // Toast helper
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.style.background = isError ? '#dc3545' : '#008037';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  }

  // For Django messages and form errors (from window.DJANGO_MESSAGES, window.FORM_ERRORS)
  let DJANGO_MESSAGES = [];
  let FORM_ERRORS = {};
  // Support data-injected (recommended) or global (fallback)
  const dataDiv = document.getElementById('dj-data');
  if (dataDiv) {
    try {
      DJANGO_MESSAGES = JSON.parse(dataDiv.dataset.messages || '[]');
      FORM_ERRORS = JSON.parse(dataDiv.dataset.formErrors || '{}');
    } catch (e) {
      DJANGO_MESSAGES = [];
      FORM_ERRORS = {};
    }
  } else if (window.DJANGO_MESSAGES) {
    DJANGO_MESSAGES = window.DJANGO_MESSAGES;
    FORM_ERRORS = window.FORM_ERRORS || {};
  }

  // Show Django messages
  if (Array.isArray(DJANGO_MESSAGES)) {
    const bulkStatus = document.getElementById('bulkStatus');
    DJANGO_MESSAGES.forEach(m => {
      const isError = m.tags && m.tags.indexOf('error') !== -1;
      showToast(m.text, isError);
      if (bulkStatus) {
        const p = document.createElement('p');
        p.textContent = m.text;
        p.style.color = isError ? '#dc3545' : '#28a745';
        bulkStatus.appendChild(p);
      }
    });
  }

  // Auto-open modal on form errors/messages
  if (FORM_ERRORS) {
    if (FORM_ERRORS.student) {
      openModal('studentModal');
    } else if (FORM_ERRORS.bulk || (DJANGO_MESSAGES && DJANGO_MESSAGES.length)) {
      openModal('bulkModal');
    } else if (FORM_ERRORS.trainer) {
      openModal('trainerModal');
    } else if (FORM_ERRORS.tpo) {
      openModal('tpoModal');
    }
  }

  // Allow pressing "Escape" to close the open modal (optional)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lastOpenedModal) {
        closeModal(document.getElementById(lastOpenedModal), modalOpeners[lastOpenedModal] || null);
        lastOpenedModal = null;
      }
    }
  });
});
