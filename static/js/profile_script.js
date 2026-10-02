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

    if (totalText > 1800) {
        alert("Content exceeds one-page limit. Please reduce content.");
        return false;
    }

    return true;
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
}

function goBack() {
    document.getElementById('resume-output').classList.add('hidden');
    document.getElementById('form-section').classList.remove('hidden');
}

async function downloadPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const section = document.getElementById('trainerProfileSection');

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
        const formData = new FormData();
        formData.append('profile_pdf', pdfBlob, 'Trainer_Profile.pdf');

        const saveUrl = document.getElementById('profile-urls')
            .dataset.saveUrl;

        const response = await fetch(saveUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken()
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert("PDF saved successfully to database.");
        } else {
            alert("PDF upload failed: " + result.error);
        }

    } catch (error) {
        console.error(error);
        alert("PDF generation/upload failed.");
    }
}

function getCSRFToken() {
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