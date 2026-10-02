// static/js/resume.js
(function () {
    "use strict";

    // ============ Utility Functions ============= //
    function getCSRFToken() {
        const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
        return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
    }
    function isValidEmail(email) {
        return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(email);
    }
    function isValidPhoneNumber(phone) {
        return /^[+]?[0-9\s()-]{8,20}$/.test(phone);
    }
    function isValidUrl(string) {
        try { new URL(string); return true; } catch (_) { return false; }
    }
    function isValidLinkedInUrl(url) {
        if (!/^https?:\/\//.test(url)) url = 'https://' + url;
        if (!isValidUrl(url)) return false;
        return /^https:\/\/(www\.)?linkedin\.com\//.test(url);
    }
    function isValidGitHubUrl(url) {
        if (!/^https?:\/\//.test(url)) url = 'https://' + url;
        if (!isValidUrl(url)) return false;
        return /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/?$/.test(url);
    }
   function isValidDOB18Plus(dateString) {

    // Format check dd-mm-yyyy
    if (!/^\d{2}-\d{2}-\d{4}$/.test(dateString)) return false;

    const [d, m, y] = dateString.split('-').map(Number);
    const dob = new Date(y, m - 1, d);
    if (isNaN(dob.getTime())) return false;

    const today = new Date();

    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < dob.getDate())
    ) {
        age--;
    }

    return age >= 18;
}

    function clearContainer(container) {
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    // =========== Dynamic Entry Functions =========== //
    function addEntry(containerId, html) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'entry-item';
        div.innerHTML = html;
        container.appendChild(div);

        // Remove button: only after DOM insertion!
        const btn = div.querySelector('.remove-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                div.remove();
            });
        }
    }

    // ========== Add/Remove Dynamic Sections ========== //
    function addPersonalSkill() {
        addEntry('personal-skills-container',
            `<input type="text" class="personal-skill" maxlength="50" placeholder="Personal Attribute" />
            <button type="button" class="remove-btn">Remove</button>`);
    }
    function addTechnicalSkill() {
        addEntry('technical-skills-container',
            `<input type="text" class="technical-skill" maxlength="50" placeholder="Technical Skill" />
            <button type="button" class="remove-btn">Remove</button>`);
    }
    function addExperience() {
        addEntry('experience-container',
            `<input type="text" class="job-title" maxlength="60" placeholder="Job Title" />
            <input type="text" class="job-date" maxlength="30" placeholder="Date Range" />
            <input type="text" class="company" maxlength="60" placeholder="Company" />
            <textarea class="description" rows="3" maxlength="200" placeholder="Description (one per line)"></textarea>
            <button type="button" class="remove-btn">Remove</button>`);
    }
    function addEducation() {
        addEntry('education-container',
            `<input type="text" class="degree" maxlength="60" placeholder="Degree" />
            <input type="text" class="field" maxlength="60" placeholder="Field of Study" />
            <input type="text" class="university" maxlength="60" placeholder="University" />
            <input type="text" class="year" maxlength="10" placeholder="Year" />
            <input type="text" class="gpa" maxlength="15" placeholder="GPA/Percentage" />
            <button type="button" class="remove-btn">Remove</button>`);
    }
    function addInternship() {
        addEntry('internship-container',
            `<input type="text" class="internship-name" maxlength="60" placeholder="Organization" />
            <input type="text" class="internship-date" maxlength="30" placeholder="Date Range" />
            <input type="text" class="internship-role" maxlength="40" placeholder="Role" />
            <textarea class="internship-description" rows="3" maxlength="200" placeholder="Description (one per line)"></textarea>
            <button type="button" class="remove-btn">Remove</button>`);
    }
    function addProject() {
        addEntry('project-container',
            `<input type="text" class="project-name" maxlength="60" placeholder="Project Name" />
            <input type="text" class="project-tech" maxlength="80" placeholder="Technologies Used" />
            <textarea class="project-description" rows="2" maxlength="200" placeholder="Brief Project Description"></textarea>
            <textarea class="project-roles" rows="3" maxlength="200" placeholder="Roles & Responsibilities (one per line)"></textarea>
            <input type="text" class="project-team" maxlength="20" placeholder="Team Size" />
            <button type="button" class="remove-btn">Remove</button>`);
    }

    // ============= Resume Generation Logic ============= //
    function generateResume() {
        // Fetch all input values (escape if needed)
        const getVal = id => (document.getElementById(id)?.value || '').trim();
        const esc = txt => document.createTextNode(txt).textContent;

        // Validate mandatory fields
        if (!getVal('full-name') || !getVal('email') || !getVal('declaration')) {
            alert("Please fill all required fields.");
            return false;
        }
        if (!isValidEmail(getVal('email'))) {
            alert("Invalid email address.");
            return false;
        }
        if (getVal('phone') && !isValidPhoneNumber(getVal('phone'))) {
            alert("Invalid phone number.");
            return false;
        }
        if (getVal('linkedin') && !isValidLinkedInUrl(getVal('linkedin'))) {
            alert("Invalid LinkedIn URL.");
            return false;
        }
        if (getVal('github') && !isValidGitHubUrl(getVal('github'))) {
            alert("Invalid GitHub URL.");
            return false;
        }
       if (getVal('dob') && !isValidDOB18Plus(getVal('dob'))) {
    alert("You must be at least 18 years old.");
    return false;
}


        // Gather dynamic sections
        function gatherInputs(containerId, inputClass) {
            return Array.from(document.querySelectorAll(`#${containerId} .${inputClass}`))
                .map(input => esc(input.value || '')).filter(Boolean);
        }
        function gatherExperience() {
            return Array.from(document.querySelectorAll('#experience-container .entry-item')).map(div => {
                return {
                    title: esc(div.querySelector('.job-title')?.value || ''),
                    date: esc(div.querySelector('.job-date')?.value || ''),
                    company: esc(div.querySelector('.company')?.value || ''),
                    description: (div.querySelector('.description')?.value || '').split('\n').map(esc).filter(Boolean)
                };
            }).filter(e => e.title || e.company || e.description.length);
        }
        function gatherEducation() {
            return Array.from(document.querySelectorAll('#education-container .entry-item')).map(div => ({
                degree: esc(div.querySelector('.degree')?.value || ''),
                field: esc(div.querySelector('.field')?.value || ''),
                university: esc(div.querySelector('.university')?.value || ''),
                year: esc(div.querySelector('.year')?.value || ''),
                gpa: esc(div.querySelector('.gpa')?.value || '')
            })).filter(e => e.degree || e.university);
        }
        function gatherInternships() {
            return Array.from(document.querySelectorAll('#internship-container .entry-item')).map(div => ({
                org: esc(div.querySelector('.internship-name')?.value || ''),
                date: esc(div.querySelector('.internship-date')?.value || ''),
                role: esc(div.querySelector('.internship-role')?.value || ''),
                desc: (div.querySelector('.internship-description')?.value || '').split('\n').map(esc).filter(Boolean)
            })).filter(e => e.org || e.role);
        }
        function gatherProjects() {
            return Array.from(document.querySelectorAll('#project-container .entry-item')).map(div => ({
                name: esc(div.querySelector('.project-name')?.value || ''),
                tech: esc(div.querySelector('.project-tech')?.value || ''),
                desc: esc(div.querySelector('.project-description')?.value || ''),
                roles: (div.querySelector('.project-roles')?.value || '').split('\n').map(esc).filter(Boolean),
                team: esc(div.querySelector('.project-team')?.value || '')
            })).filter(e => e.name);
        }

        // Assemble resume preview DOM
        const out = document.getElementById('resume-output');
        clearContainer(out);

        // -- Name and Contact --
        const nameSec = document.createElement('div');
        nameSec.className = "name-section";
        nameSec.innerHTML = `
            <div class="name">${esc(getVal('full-name'))}</div>
            <div class="contact-info">
                <span>${esc(getVal('email'))}</span>
                ${getVal('phone') ? ' | <span>' + esc(getVal('phone')) + '</span>' : ''}
                ${getVal('linkedin') ? ' | <a href="' + encodeURI(getVal('linkedin')) + '" target="_blank" rel="noopener">LinkedIn</a>' : ''}
                ${getVal('github') ? ' | <a href="' + encodeURI(getVal('github')) + '" target="_blank" rel="noopener">GitHub</a>' : ''}
            </div>
        `;
        out.appendChild(nameSec);

        // -- Objective --
        if (getVal('objective')) {
            const objSec = document.createElement('div');
            objSec.className = "section";
            objSec.innerHTML = `<div class="section-title">Career Objective</div>
                <div>${esc(getVal('objective'))}</div>`;
            out.appendChild(objSec);
        }

        // -- Personal Attributes --
        const persAttrs = gatherInputs('personal-skills-container', 'personal-skill');
        if (persAttrs.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Personal Attributes</div>`;
            const ul = document.createElement('ul');
            persAttrs.forEach(txt => {
                const li = document.createElement('li'); li.textContent = txt; ul.appendChild(li);
            });
            sec.appendChild(ul); out.appendChild(sec);
        }

        // -- Technical Skills --
        const techSkills = gatherInputs('technical-skills-container', 'technical-skill');
        if (techSkills.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Technical Skills</div>`;
            const ul = document.createElement('ul');
            techSkills.forEach(txt => {
                const li = document.createElement('li'); li.textContent = txt; ul.appendChild(li);
            });
            sec.appendChild(ul); out.appendChild(sec);
        }

        // -- Experience --
        const expArr = gatherExperience();
        if (expArr.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Work Experience</div>`;
            expArr.forEach(e => {
                const jobDiv = document.createElement('div');
                jobDiv.className = "job-item";
                jobDiv.innerHTML = `<div class="job-header">
                        <span class="job-title">${e.title}</span>
                        <span class="job-date">${e.date}</span>
                    </div>
                    <div class="company">${e.company}</div>`;
                if (e.description.length) {
                    const ul = document.createElement('ul');
                    e.description.forEach(line => {
                        const li = document.createElement('li'); li.textContent = line; ul.appendChild(li);
                    });
                    jobDiv.appendChild(ul);
                }
                sec.appendChild(jobDiv);
            });
            out.appendChild(sec);
        }

        // -- Education --
        const eduArr = gatherEducation();
        if (eduArr.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Education</div>`;
            eduArr.forEach(e => {
                const edDiv = document.createElement('div');
                edDiv.innerHTML = `<b>${e.degree}</b> - ${e.field}<br>
                                   ${e.university} (${e.year}) ${e.gpa ? ' | ' + e.gpa : ''}`;
                sec.appendChild(edDiv);
            });
            out.appendChild(sec);
        }

        // -- Internships --
        const intArr = gatherInternships();
        if (intArr.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Internships</div>`;
            intArr.forEach(e => {
                const intDiv = document.createElement('div');
                intDiv.innerHTML = `<div class="internship-header">${e.org} (${e.date})</div>
                    <div class="internship-role">${e.role}</div>`;
                if (e.desc.length) {
                    const ul = document.createElement('ul');
                    e.desc.forEach(line => {
                        const li = document.createElement('li'); li.textContent = line; ul.appendChild(li);
                    });
                    intDiv.appendChild(ul);
                }
                sec.appendChild(intDiv);
            });
            out.appendChild(sec);
        }

        // -- Projects --
        const prjArr = gatherProjects();
        if (prjArr.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Projects</div>`;
            prjArr.forEach(p => {
                const pDiv = document.createElement('div');
                pDiv.className = "project-grid";
                pDiv.innerHTML = `<div class="project-title">${p.name}</div>
                                  <div>Technologies</div><div>${p.tech}</div>
                                  <div>Description</div><div>${p.desc}</div>
                                  <div>Roles & Responsibilities</div><div>
                                    <ul>${p.roles.map(r => `<li>${r}</li>`).join('')}</ul>
                                  </div>
                                  <div>Team Size</div><div>${p.team}</div>`;
                sec.appendChild(pDiv);
            });
            out.appendChild(sec);
        }

        // -- Certifications --
        if (getVal('certifications')) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Certifications</div>
                <div>${esc(getVal('certifications'))}</div>`;
            out.appendChild(sec);
        }

        // -- Personal Details --
        const personalDetails = [
            ['Date of Birth', getVal('dob')],
            ["Father's Name", getVal('father-name')],
            ['Gender', getVal('gender')],
            ['Languages Known', getVal('languages')],
            ['Address', getVal('address')]
        ].filter(([lbl, val]) => val);
        if (personalDetails.length) {
            const sec = document.createElement('div');
            sec.className = "section";
            sec.innerHTML = `<div class="section-title">Personal Details</div>`;
            const table = document.createElement('div');
            table.className = 'personal-details';
            personalDetails.forEach(([lbl, val]) => {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'detail-label';
                labelDiv.textContent = lbl;
                const valDiv = document.createElement('div');
                valDiv.textContent = val;
                table.appendChild(labelDiv);
                table.appendChild(valDiv);
            });
            sec.appendChild(table);
            out.appendChild(sec);
        }

        // -- Declaration & Signature --
        const decl = document.createElement('div');
        decl.className = "declaration";
        decl.innerHTML = `<div class="section-title">Declaration</div>
            <div class="declaration-text">${esc(getVal('declaration'))}</div>
            <div class="signature-line">
                <div></div>
                <div class="signature-place">Signature</div>
            </div>`;
        out.appendChild(decl);

        // Show/hide builder & resume
        document.getElementById('builder-view').style.display = 'none';
        document.getElementById('resume-view').style.display = 'block';
        document.getElementById('toggle-btn').style.display = 'block';
        window.scrollTo(0, 0);
        return true;
    }

    // ============= Download & Print ============= //
    function downloadResume() {
        if (!generateResume()) return;
        setTimeout(function () {
            const element = document.getElementById('resume-output');
            const fullName = (document.getElementById('full-name').value.trim() || 'resume').replace(/\s+/g, '_');
            const fileName = `${fullName}_resume.pdf`;

            html2pdf().from(element).outputPdf('blob').then(function (pdfBlob) {
                // Download PDF
                const link = document.createElement('a');
                link.href = URL.createObjectURL(pdfBlob);
                link.download = fileName;
                link.click();

                // Secure upload
                const formData = new FormData();
                formData.append('resume', pdfBlob, fileName);

                fetch('/student/upload_resume/', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                    headers: { 'X-CSRFToken': getCSRFToken() }
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            alert("Resume uploaded and saved successfully.");
                        } else {
                            alert("Resume upload failed.");
                        }
                    })
                    .catch(() => { alert('Upload failed.'); });
            });
        }, 100);
    }

    function printResume() {
        if (!generateResume()) return;
        setTimeout(function () { window.print(); }, 100);
    }

    // ============= Toggle View ============= //
    function toggleView() {
        const builderView = document.getElementById('builder-view');
        const resumeView = document.getElementById('resume-view');
        const toggleBtn = document.getElementById('toggle-btn');
        if (builderView.style.display === 'none') {
            builderView.style.display = 'block';
            resumeView.style.display = 'none';
            toggleBtn.style.display = 'none';
        } else {
            generateResume();
        }
    }

    // ============= Initialize All ============= //
    document.addEventListener('DOMContentLoaded', function () {
        // Datepicker
   if (typeof flatpickr !== "undefined") {

    // 🎯 Calculate date exactly 18 years ago
    const today = new Date();
    const minAgeDate = new Date(
        today.getFullYear() - 18,
        today.getMonth(),
        today.getDate()
    );

    flatpickr("#dob", {
        dateFormat: "d-m-Y",
        maxDate: minAgeDate,   // OK cannot select if age < 18
        allowInput: true,
        disableMobile: true,
        monthSelectorType: "dropdown",
        yearSelectorType: "dropdown"
    });

} else {
    console.error("Flatpickr not loaded");
}



        // Default: One education field & declaration
        addEducation();
        document.getElementById('declaration').value =
            "I hereby declare that the information furnished above is true, complete, and correct to the best of my knowledge and belief.";

        // Add button event handlers (NO inline handlers in HTML!)
        document.getElementById('add-personal-skill').addEventListener('click', addPersonalSkill);
        document.getElementById('add-technical-skill').addEventListener('click', addTechnicalSkill);
        document.getElementById('add-experience').addEventListener('click', addExperience);
        document.getElementById('add-education').addEventListener('click', addEducation);
        document.getElementById('add-internship').addEventListener('click', addInternship);
        document.getElementById('add-project').addEventListener('click', addProject);

        // Main action buttons
        document.getElementById('generate-resume').addEventListener('click', generateResume);
        document.getElementById('download-resume').addEventListener('click', downloadResume);
        if (document.getElementById('toggle-btn'))
            document.getElementById('toggle-btn').addEventListener('click', toggleView);

        // Default view
        document.getElementById('resume-view').style.display = 'none';
        document.getElementById('toggle-btn').style.display = 'none';

        // ============= Multi-Step Wizard Logic ============= //
        let currentStep = 1;
        const totalSteps = 4;

        function showStep(stepNum) {
            stepNum = Math.max(1, Math.min(totalSteps, stepNum));

            // Show active step card, hide others
            document.querySelectorAll('.step-card').forEach(card => {
                if (parseInt(card.dataset.step) === stepNum) {
                    card.classList.add('active-step');
                } else {
                    card.classList.remove('active-step');
                }
            });

            // Update Stepper Progress Bar
            document.querySelectorAll('.step-item').forEach(item => {
                const itemStep = parseInt(item.dataset.step);
                item.classList.remove('active', 'completed');
                if (itemStep === stepNum) {
                    item.classList.add('active');
                } else if (itemStep < stepNum) {
                    item.classList.add('completed');
                }
            });

            document.querySelectorAll('.step-line').forEach((line, index) => {
                if (index + 1 < stepNum) {
                    line.classList.add('active');
                } else {
                    line.classList.remove('active');
                }
            });

            currentStep = stepNum;
            const builderView = document.getElementById('builder-view');
            if (builderView) {
                builderView.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // Next Step Buttons
        document.querySelectorAll('.wizard-btn.btn-next').forEach(btn => {
            btn.addEventListener('click', function () {
                const nextStep = parseInt(this.dataset.next);

                // Step 1 Validation before proceeding
                if (currentStep === 1) {
                    const fullName = (document.getElementById('full-name')?.value || '').trim();
                    const email = (document.getElementById('email')?.value || '').trim();

                    if (!fullName) {
                        alert("Please enter your Full Name before proceeding.");
                        document.getElementById('full-name')?.focus();
                        return;
                    }
                    if (!email) {
                        alert("Please enter your Email Address before proceeding.");
                        document.getElementById('email')?.focus();
                        return;
                    }
                    if (!isValidEmail(email)) {
                        alert("Please enter a valid Email Address.");
                        document.getElementById('email')?.focus();
                        return;
                    }
                }

                showStep(nextStep);
            });
        });

        // Previous Step Buttons
        document.querySelectorAll('.wizard-btn.btn-prev').forEach(btn => {
            btn.addEventListener('click', function () {
                const prevStep = parseInt(this.dataset.prev);
                showStep(prevStep);
            });
        });

        // Click on Stepper items to jump to completed/earlier steps
        document.querySelectorAll('.step-item').forEach(item => {
            item.addEventListener('click', function () {
                const targetStep = parseInt(this.dataset.step);
                if (targetStep < currentStep || this.classList.contains('completed')) {
                    showStep(targetStep);
                }
            });
        });

        // Initialize Step 1
        showStep(1);
    });

    // (Optional: Expose for console debug)
    window.generateResume = generateResume;
    window.downloadResume = downloadResume;
    window.toggleView = toggleView;

})();
