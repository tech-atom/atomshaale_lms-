/* Company Preparation Test Controller (Slide & Timer Management) */

let currentSlideIndex = 0;
let totalSlides = 0;
let testTimerInterval = null;

function initTestConsole(total, durationMins, formId) {
    totalSlides = total;
    if (totalSlides > 0) {
        showSlide(0);
        updateAnsweredCount();
    }

    // Timer Initialization
    const durationMinutes = durationMins || 15;
    let totalSeconds = durationMinutes * 60;
    const timerDisplay = document.getElementById('timer-display');
    const examForm = document.getElementById(formId || 'exam-form');

    function updateTimer() {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        
        if (timerDisplay) {
            timerDisplay.textContent = `${formattedMinutes}:${formattedSeconds}`;
        }

        if (totalSeconds <= 0) {
            clearInterval(testTimerInterval);
            alert("⏰ Time is up! Your exam answers are being submitted automatically.");
            if (examForm) {
                const requiredInputs = examForm.querySelectorAll('[required]');
                requiredInputs.forEach(input => input.removeAttribute('required'));
                examForm.submit();
            }
        } else {
            totalSeconds--;
        }
    }

    updateTimer();
    testTimerInterval = setInterval(updateTimer, 1000);
}

function showSlide(index) {
    if (index < 0 || index >= totalSlides) return;

    for (let i = 0; i < totalSlides; i++) {
        const slide = document.getElementById('slide-' + i);
        const navBtn = document.getElementById('q-nav-btn-' + i);
        if (slide) slide.style.display = 'none';

        if (navBtn) {
            const isAns = checkIsAnswered(i);
            if (isAns) {
                navBtn.style.background = '#008037';
                navBtn.style.color = '#ffffff';
                navBtn.style.borderColor = '#008037';
            } else {
                navBtn.style.background = '';
                navBtn.style.color = '';
                navBtn.style.borderColor = '';
            }
            navBtn.style.boxShadow = 'none';
            navBtn.style.transform = 'scale(1)';
        }
    }

    const activeSlide = document.getElementById('slide-' + index);
    const activeNavBtn = document.getElementById('q-nav-btn-' + index);
    if (activeSlide) activeSlide.style.display = 'block';

    if (activeNavBtn) {
        activeNavBtn.style.boxShadow = '0 0 0 3px rgba(0, 128, 55, 0.3)';
        activeNavBtn.style.transform = 'scale(1.06)';
        if (!checkIsAnswered(index)) {
            activeNavBtn.style.borderColor = '#008037';
        }
    }

    const prevBtn = activeSlide ? activeSlide.querySelector('#btn-prev') : null;
    const nextBtn = activeSlide ? activeSlide.querySelector('#btn-next') : null;
    const submitBtn = activeSlide ? activeSlide.querySelector('#btn-submit') : null;

    if (prevBtn) {
        if (index === 0) {
            prevBtn.style.opacity = '0.5';
            prevBtn.style.pointerEvents = 'none';
        } else {
            prevBtn.style.opacity = '1';
            prevBtn.style.pointerEvents = 'auto';
        }
    }

    if (index === totalSlides - 1) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-block';
    } else {
        if (nextBtn) nextBtn.style.display = 'inline-block';
        if (submitBtn) submitBtn.style.display = 'none';
    }

    currentSlideIndex = index;
}

function nextSlide() {
    if (currentSlideIndex < totalSlides - 1) {
        showSlide(currentSlideIndex + 1);
    }
}

function prevSlide() {
    if (currentSlideIndex > 0) {
        showSlide(currentSlideIndex - 1);
    }
}

function goToSlide(index) {
    showSlide(index);
}

function checkIsAnswered(index) {
    const slide = document.getElementById('slide-' + index);
    if (!slide) return false;
    const radios = slide.querySelectorAll('input[type="radio"]');
    for (let r of radios) {
        if (r.checked) return true;
    }
    const compileSuccess = slide.querySelector('input[id^="compile-success-"]');
    if (compileSuccess && compileSuccess.value === 'true') return true;
    return false;
}

function markQuestionAnswered(index) {
    showSlide(currentSlideIndex);
    updateAnsweredCount();
}

function updateAnsweredCount() {
    let count = 0;
    for (let i = 0; i < totalSlides; i++) {
        if (checkIsAnswered(i)) count++;
    }
    const txt = document.getElementById('answered-count-text');
    if (txt) txt.textContent = `${count} / ${totalSlides} Answered`;
}

async function runCompiler(qId, expectedAnswer) {
    const codeText = document.getElementById('code-' + qId).value;
    const lang = document.getElementById('lang-' + qId).value;
    const stdin = document.getElementById('stdin-' + qId).value;
    const stdoutConsole = document.getElementById('stdout-' + qId);
    const statusDiv = document.getElementById('status-' + qId);
    const compileSuccessField = document.getElementById('compile-success-' + qId);
    const codeAnswerField = document.getElementById('code-answer-' + qId);
    
    stdoutConsole.textContent = "Compiling and running code... Please wait...";
    statusDiv.innerHTML = "";
    
    const payload = {
        code: codeText,
        language: lang,
        input: stdin,
        question_id: null
    };
    
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    
    try {
        const response = await fetch('/exam/api/compile-code/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(payload)
        });
        
        const resData = await response.json();
        
        if (resData.success) {
            const output = resData.output.trim();
            stdoutConsole.textContent = output;
            stdoutConsole.style.color = '#38bdf8';
            
            codeAnswerField.value = codeText;
            
            const cleanedExpected = expectedAnswer.trim();
            if (output.includes(cleanedExpected) || output === cleanedExpected) {
                statusDiv.innerHTML = `<span class="status-badge badge-success"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Output Match! Test cases passed successfully.</span>`;
                compileSuccessField.value = "true";
            } else {
                statusDiv.innerHTML = `<span class="status-badge badge-error"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Output Mismatch. Expected: '${cleanedExpected}'. Keep trying!</span>`;
                compileSuccessField.value = "false";
            }
        } else {
            stdoutConsole.textContent = resData.error || "Execution failed with compilation error.";
            stdoutConsole.style.color = '#f87171';
            compileSuccessField.value = "false";
            statusDiv.innerHTML = `<span class="status-badge badge-error"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Compilation Error.</span>`;
        }
        
    } catch(err) {
        console.error("Compilation error:", err);
        stdoutConsole.textContent = "Error: Connection to compiler endpoint failed.";
        stdoutConsole.style.color = '#f87171';
    }

    updateAnsweredCount();
    showSlide(currentSlideIndex);
}
