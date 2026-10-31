function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function addItem(containerId) {
    const container = document.getElementById(containerId);

    // Prevent adding more than 3 items
    const existingInputs = container.querySelectorAll('input').length;
    if (existingInputs >= 3) {
        alert('Maximum 3 items allowed for this section.');
        return;
    }

    const div = document.createElement('div');
    div.className = 'list-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dynamic-input';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove-btn';
    btn.innerText = 'X';

    btn.onclick = () => div.remove();

    div.append(input, btn);
    container.appendChild(div);
}

function getListHtml(containerId) {
    const inputs = document.querySelectorAll(`#${containerId} input`);
    let html = '<ul>';

    const values = [];
    inputs.forEach(input => {
        if (input.value && input.value.trim()) {
            values.push(input.value.trim());
        }
    });

    // Limit to first 3 entries
    values.slice(0, 3).forEach(v => {
        html += `<li>${escapeHtml(v)}</li>`;
    });

    html += '</ul>';
    return html;
}

function validateOnePageContent() {
    const totalText =
        document.getElementById('summary').value.length +
        document.getElementById('education').value.length;

    if (totalText > 2500) {
        alert("Content exceeds one-page limit. Please reduce content.");
        return false;
    }

    return true;
}

function autoFitProfileToOnePage() {
    const page = document.getElementById('trainerProfileSection');
    const wrapper = document.getElementById('resumeContentWrapper');
    if (!page || !wrapper) return;

    function applyScale(scale) {
        // Clamp scale factor between 0.50 and 1.50
        scale = Math.max(0.50, Math.min(scale, 1.50));

        // Proportional font sizes
        const bodySize = Math.round(15 * scale * 10) / 10;
        const headingSize = Math.round(20 * scale * 10) / 10;
        const nameSize = Math.round(28 * scale * 10) / 10;
        const titleSize = Math.round(16 * scale * 10) / 10;

        // Line height scales smoothly: 1.15 at 0.50 scale -> 1.58 at 1.50 scale
        const lineHeight = (1.10 + 0.32 * scale).toFixed(2);

        // Spacings and gaps scale proportionally
        const sectionGap = Math.max(4, Math.round(16 * scale));
        const listGap = Math.max(2, Math.round(5 * scale));
        const headerBottom = Math.max(6, Math.round(16 * scale));
        const headingBottom = Math.max(2, Math.round(6 * scale));
        const padTop = Math.max(12, Math.round(20 * scale));
        const padBottom = Math.max(14, Math.round(22 * scale));
        const padSide = Math.max(30, Math.round(50 * scale));
        const logoWidth = Math.max(110, Math.round(160 * scale));

        page.style.setProperty('--body-font-size', `${bodySize}px`);
        page.style.setProperty('--heading-font-size', `${headingSize}px`);
        page.style.setProperty('--name-font-size', `${nameSize}px`);
        page.style.setProperty('--title-font-size', `${titleSize}px`);
        page.style.setProperty('--line-height', lineHeight);
        page.style.setProperty('--section-gap', `${sectionGap}px`);
        page.style.setProperty('--list-item-gap', `${listGap}px`);
        page.style.setProperty('--header-margin-bottom', `${headerBottom}px`);
        page.style.setProperty('--heading-margin-bottom', `${headingBottom}px`);
        page.style.setProperty('--page-pad-top', `${padTop}px`);
        page.style.setProperty('--page-pad-bottom', `${padBottom}px`);
        page.style.setProperty('--page-pad-side', `${padSide}px`);
        page.style.setProperty('--logo-width', `${logoWidth}px`);
    }

    // Set to unconstrained natural flow during measurement
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.justifyContent = 'flex-start';
    wrapper.style.height = 'auto';

    // Binary search to find the highest scale that fits without overflowing
    let low = 0.50;
    let high = 1.45;
    let bestScale = 1.0;

    for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2;
        applyScale(mid);

        const padTop = parseFloat(window.getComputedStyle(page).paddingTop) || 0;
        const padBottom = parseFloat(window.getComputedStyle(page).paddingBottom) || 0;
        const availableHeight = page.clientHeight - padTop - padBottom;
        const contentHeight = wrapper.offsetHeight;

        if (contentHeight <= availableHeight) {
            bestScale = mid;
            low = mid; // Fits, try higher scale to fill more
        } else {
            high = mid; // Too big, reduce scale
        }
    }

    // Apply the optimal scale
    applyScale(bestScale);

    // Lock wrapper to 100% height and space-between to evenly distribute across the full page
    wrapper.style.height = '100%';
    const padTop = parseFloat(window.getComputedStyle(page).paddingTop) || 0;
    const padBottom = parseFloat(window.getComputedStyle(page).paddingBottom) || 0;
    const availableHeight = page.clientHeight - padTop - padBottom;

    if (wrapper.offsetHeight > availableHeight + 1) {
        wrapper.style.justifyContent = 'flex-start';
    } else {
        wrapper.style.justifyContent = 'space-between';
    }
}

function generateProfile() {
    if (!validateOnePageContent()) return;

    document.getElementById('nameDisplay').innerText =
        document.getElementById('fullName').value;

    document.getElementById('titleDisplay').innerText =
        document.getElementById('jobTitle').value;

    // Limit summary to 60 words
    const MAX_SUMMARY_WORDS = 60;
    let summaryTextRaw = document.getElementById('summary').value
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const summaryWords = summaryTextRaw ? summaryTextRaw.split(/\s+/).filter(Boolean) : [];
    const summaryText = summaryWords.slice(0, MAX_SUMMARY_WORDS).join(' ');

    document.getElementById('summaryDisplay').textContent = summaryText;

    document.getElementById('experienceDisplay').innerHTML =
        getListHtml('experienceList');

    document.getElementById('skillsDisplay').innerHTML =
        getListHtml('skillsList');

    document.getElementById('achievementsDisplay').innerHTML =
        getListHtml('achievementsList');

    document.getElementById('educationDisplay').innerHTML =
        escapeHtml(document.getElementById('education').value).replace(/\n/g, '<br>');

    document.getElementById('form-section').classList.add('hidden');
    document.getElementById('resume-output').classList.remove('hidden');

    // Auto-fit immediately and refine after next tick / fonts ready
    autoFitProfileToOnePage();
    requestAnimationFrame(autoFitProfileToOnePage);
    setTimeout(autoFitProfileToOnePage, 60);

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(autoFitProfileToOnePage);
    }
}

function goBack() {
    document.getElementById('resume-output').classList.add('hidden');
    document.getElementById('form-section').classList.remove('hidden');
}

async function downloadPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const section = document.getElementById('trainerProfileSection');

        // Re-fit right before capture to guarantee 100% single page fit
        autoFitProfileToOnePage();

        const canvas = await html2canvas(section, {
            scale: 2,
            useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');

        const doc = new jsPDF('p', 'mm', 'a4');

        const width = doc.internal.pageSize.getWidth();
        const height = (canvas.height * width) / canvas.width;

        doc.addImage(imgData, 'PNG', 0, 0, width, height);

        // Local download
        doc.save('Trainer_Profile.pdf');

        // Create PDF blob for upload
        const pdfBlob = doc.output('blob');

        // Upload to backend
        const csrfToken = getCSRFToken();
        const formData = new FormData();
        formData.append('profile_pdf', pdfBlob, 'Trainer_Profile.pdf');
        if (csrfToken) {
            formData.append('csrfmiddlewaretoken', csrfToken);
        }

        const saveUrl = document.getElementById('profile-urls')
            .dataset.saveUrl;

        const headers = {};
        if (csrfToken) {
            headers['X-CSRFToken'] = csrfToken;
        }

        const response = await fetch(saveUrl, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (!response.ok) {
            let errorMsg = `Server responded with status ${response.status}`;
            try {
                const errData = await response.json();
                if (errData && (errData.error || errData.errors)) {
                    errorMsg = errData.error || errData.errors;
                }
            } catch (_) {}
            throw new Error(errorMsg);
        }

        const result = await response.json();

        if (result.success) {
            alert("PDF saved successfully to database.");
        } else {
            alert("PDF upload failed: " + (result.error || result.errors || "Unknown error"));
        }

    } catch (error) {
        console.error(error);
        alert("PDF generation/upload failed: " + (error.message || error));
    }
}

function getCSRFToken() {
    // 1. Dataset attribute on #profile-urls
    const urlsEl = document.getElementById('profile-urls');
    if (urlsEl && urlsEl.dataset && urlsEl.dataset.csrfToken) {
        return urlsEl.dataset.csrfToken;
    }

    // 2. Hidden input rendered by {% csrf_token %}
    const tokenInput = document.querySelector('input[name="csrfmiddlewaretoken"]') ||
                       document.querySelector('[name=csrfmiddlewaretoken]');
    if (tokenInput && tokenInput.value) {
        return tokenInput.value;
    }

    // 3. Meta tag if present
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag && metaTag.content) {
        return metaTag.content;
    }

    // 4. Cookie fallback (if not HttpOnly)
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
        cookie = cookie.trim();

        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }

    return '';
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', function() {
            addItem(btn.dataset.addItem);
        });
    });

    document.getElementById('generateBtn').addEventListener('click', generateProfile);
    document.getElementById('backBtn').addEventListener('click', goBack);
    document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

    window.addEventListener('resize', () => {
        const output = document.getElementById('resume-output');
        if (output && !output.classList.contains('hidden')) {
            autoFitProfileToOnePage();
        }
    });
    
    // Enforce 60-word limit on Professional Summary
    const MAX_SUMMARY_WORDS = 60;
    const summaryEl = document.getElementById('summary');
    if (summaryEl) {
        // create a small counter element after the textarea
        const counter = document.createElement('div');
        counter.className = 'word-counter';
        counter.style.fontSize = '0.9em';
        counter.style.color = '#555';
        counter.style.marginTop = '6px';
        counter.innerText = `0/${MAX_SUMMARY_WORDS} words`;
        summaryEl.parentNode.insertBefore(counter, summaryEl.nextSibling);

        const updateCounter = () => {
            const words = summaryEl.value.trim().split(/\s+/).filter(Boolean);
            if (words.length > MAX_SUMMARY_WORDS) {
                // Trim to max words
                summaryEl.value = words.slice(0, MAX_SUMMARY_WORDS).join(' ');
                counter.innerText = `${MAX_SUMMARY_WORDS}/${MAX_SUMMARY_WORDS} words`;
            } else {
                counter.innerText = `${words.length}/${MAX_SUMMARY_WORDS} words`;
            }
        };

        // initialize counter
        updateCounter();
        summaryEl.addEventListener('input', updateCounter);
    }
});
