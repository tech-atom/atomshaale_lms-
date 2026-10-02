// Practice Test Result Sheet JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const loader = document.getElementById('result-loader');
    const content = document.getElementById('result-content');
    
    // Show content after data is loaded
    setTimeout(() => {
        if (typeof resultData !== 'undefined') {
            displayResults();
            loader.style.display = 'none';
            content.style.display = 'block';
        } else {
            loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to load results.';
        }
    }, 800);
});

function displayResults() {
    // Student Info
    document.getElementById('student-name').textContent = resultData.student_name || '-';
    document.getElementById('student-usn').textContent = resultData.student_usn || '-';
    document.getElementById('test-title').textContent = resultData.test_title || '-';
    document.getElementById('test-date').textContent = resultData.submitted_at || '-';
    document.getElementById('test-duration').textContent = resultData.duration || '-';
    document.getElementById('time-taken').textContent = resultData.time_taken || '-';
    
    // Score Details
    const marksObtained = resultData.marks_obtained || 0;
    const totalMarks = resultData.total_marks || 1;
    const percentage = ((marksObtained / totalMarks) * 100).toFixed(2);
    
    document.getElementById('marks-obtained').textContent = marksObtained;
    document.getElementById('total-marks').textContent = totalMarks;
    document.getElementById('percentage').textContent = percentage + '%';
    
    // Performance Text
    const performanceCard = document.getElementById('pass-status-card');
    const performanceText = document.getElementById('performance-text');
    const accuracy = resultData.total_questions > 0 
        ? ((resultData.correct_answers / resultData.total_questions) * 100).toFixed(2)
        : 0;
    
    document.getElementById('accuracy').textContent = accuracy + '%';
    
    if (percentage >= 80) {
        performanceText.textContent = 'Excellent';
        performanceCard.classList.add('pass');
    } else if (percentage >= 60) {
        performanceText.textContent = 'Good';
        performanceCard.classList.add('pass');
    } else if (percentage >= 40) {
        performanceText.textContent = 'Average';
        performanceCard.classList.add('pass');
    } else {
        performanceText.textContent = 'Needs Improvement';
        performanceCard.classList.add('fail');
    }
    
    // Statistics
    document.getElementById('correct-answers').textContent = resultData.correct_answers || 0;
    document.getElementById('wrong-answers').textContent = resultData.wrong_answers || 0;
    document.getElementById('attempted-questions').textContent = resultData.attempted_questions || 0;
    document.getElementById('unattempted-questions').textContent = 
        (resultData.total_questions || 0) - (resultData.attempted_questions || 0);
    
    // Question-wise Breakdown
    const breakdownContainer = document.getElementById('questions-breakdown');
    if (resultData.questions && resultData.questions.length > 0) {
        resultData.questions.forEach((question, index) => {
            const questionCard = createQuestionCard(question, index + 1);
            breakdownContainer.appendChild(questionCard);
        });
    } else {
        breakdownContainer.innerHTML = '<p class="no-data">No question breakdown available.</p>';
    }
}

function createQuestionCard(question, number) {
    const card = document.createElement('div');
    card.className = 'question-card';
    
    const isCorrect = question.is_correct;
    const isAttempted = question.student_answer !== null && question.student_answer !== '';
    
    let statusClass = 'unattempted';
    let statusIcon = 'fa-minus-circle';
    let statusText = 'Not Attempted';
    
    if (isAttempted) {
        if (isCorrect) {
            statusClass = 'correct';
            statusIcon = 'fa-check-circle';
            statusText = 'Correct';
        } else {
            statusClass = 'wrong';
            statusIcon = 'fa-times-circle';
            statusText = 'Wrong';
        }
    }
    
    card.classList.add(statusClass);
    
    let answerSection = '';
    if (question.type === 'CODE') {
        answerSection = `
            <div class="question-code-section">
                <div class="code-info">
                    <strong>Language:</strong> ${question.language || 'Not specified'}
                </div>
                <div class="code-block">
                    <strong>Submitted Code:</strong>
                    <pre>${escapeHtml(question.student_answer || 'No code submitted')}</pre>
                </div>
            </div>
        `;
    } else if (question.type === 'MCQ' || question.type === 'TF') {
        answerSection = `
            <div class="answer-section">
                <div class="answer-row">
                    <strong>Your Answer:</strong> 
                    <span class="${isCorrect ? 'correct-answer' : 'wrong-answer'}">
                        ${question.student_answer || 'Not Answered'}
                    </span>
                </div>
                ${!isCorrect ? `
                <div class="answer-row">
                    <strong>Correct Answer:</strong> 
                    <span class="correct-answer">${question.correct_answer || 'N/A'}</span>
                </div>
                ` : ''}
            </div>
        `;
    } else {
        answerSection = `
            <div class="answer-section">
                <div class="answer-row">
                    <strong>Your Answer:</strong> 
                    <div class="desc-answer">${escapeHtml(question.student_answer || 'Not Answered')}</div>
                </div>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="question-header">
            <div class="question-number">Q${number}</div>
            <div class="question-status ${statusClass}">
                <i class="fas ${statusIcon}"></i> ${statusText}
            </div>
            <div class="question-marks">
                <span class="marks-obtained">${question.marks_awarded || 0}</span> / 
                <span class="marks-total">${question.marks || 0}</span> marks
            </div>
        </div>
        <div class="question-body">
            <div class="question-text">${question.question_text || 'Question text not available'}</div>
            ${question.type === 'MCQ' ? `
                <div class="mcq-options">
                    ${question.options ? question.options.map(opt => 
                        `<div class="mcq-option ${opt === question.correct_answer ? 'correct-opt' : ''} ${opt === question.student_answer && !isCorrect ? 'wrong-opt' : ''}">
                            ${opt}
                        </div>`
                    ).join('') : ''}
                </div>
            ` : ''}
            ${answerSection}
        </div>
    `;
    
    return card;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadPDF() {
    window.print();
}
