// Exam Result JavaScript

document.addEventListener('DOMContentLoaded', function() {
    loadResultData();
});

async function loadResultData() {
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('result_id');
    
    if (!resultId) {
        alert('No result ID provided');
        window.location.href = '/student/home/';
        return;
    }
    
    try {
        const response = await fetch(`/exam/api/result/${resultId}/`, {
            method: 'GET',
            credentials: 'include'
        });

        // Try to parse JSON (even for errors)
        const data = await response.json().catch(() => ({}));

        // Handle error responses gracefully
        if (!response.ok) {
            const errorMessage = data.message || 'Failed to load result. Please try again.';
            
            console.warn("Server returned error:", errorMessage);

            // Display message on page instead of generic alert
            const loader = document.getElementById('result-loader');
            loader.innerHTML = `<i></i> ${errorMessage}`;
            loader.style.color = '#008037';
            loader.style.fontWeight = 'bold';
            loader.style.textAlign = 'center';

            // Optional: also show alert for clarity
            alert(errorMessage);

            return;
        }

        // OK Successful response — display results
        displayResult(data);
        
    } catch (error) {
        console.error('Error loading result:', error);
        alert('Failed to load result. Please check your connection and try again.');
        document.getElementById('result-loader').innerHTML =
            '<i class="fas fa-exclamation-triangle"></i> Error loading results';
    }
}

function displayResult(data) {
    // Hide loader, show content
    document.getElementById('result-loader').style.display = 'none';
    document.getElementById('result-content').style.display = 'block';
    
    // Student Info
    document.getElementById('student-name').textContent = data.student_name;
    document.getElementById('student-usn').textContent = data.usn;
    document.getElementById('exam-title').textContent = data.exam_title;
    document.getElementById('exam-date').textContent = data.submitted_at;
    document.getElementById('exam-duration').textContent = data.duration_minutes + ' minutes';
    document.getElementById('time-taken').textContent = data.time_taken || 'N/A';
    
    if (data.result_released === false) {
        // Hide score details and breakdown
        const scoreSummary = document.querySelector('.score-summary');
        if (scoreSummary) scoreSummary.style.display = 'none';
        
        const statisticsGrid = document.querySelector('.statistics-grid');
        if (statisticsGrid) statisticsGrid.style.display = 'none';
        
        const breakdownSection = document.querySelector('.breakdown-section');
        if (breakdownSection) breakdownSection.style.display = 'none';

        // Add a beautiful info message
        let pendingMessage = document.getElementById('pending-message');
        if (!pendingMessage) {
            pendingMessage = document.createElement('div');
            pendingMessage.id = 'pending-message';
            pendingMessage.className = 'info-message-box';
            pendingMessage.innerHTML = `
                <div style="text-align: center; margin: 30px 0; padding: 30px; border-radius: 12px; background: rgba(0, 128, 55, 0.08); border: 1px solid rgba(0, 128, 55, 0.2); color: #008037;">
                    <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <h3 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #008037;">Submission Confirmed</h3>
                    <p style="margin: 0; font-size: 16px;">${data.message || 'Your exam has been submitted successfully. Results will be released soon.'}</p>
                </div>
            `;
            // Insert it before the action buttons
            const actionButtons = document.querySelector('.action-buttons');
            if (actionButtons) {
                actionButtons.parentNode.insertBefore(pendingMessage, actionButtons);
            }
        }
        return;
    }
    
    // Score Summary
    const marksObtained = parseFloat(data.marks_obtained);
    const totalMarks = parseFloat(data.total_marks);
    const passingMarks = parseFloat(data.passing_marks);
    const percentage = totalMarks > 0 ? ((marksObtained / totalMarks) * 100).toFixed(2) : 0;
    
    document.getElementById('marks-obtained').textContent = marksObtained;
    document.getElementById('total-marks').textContent = totalMarks;
    document.getElementById('percentage').textContent = percentage + '%';
    document.getElementById('passing-marks').textContent = passingMarks;
    
    // Pass/Fail Status
    const passStatusCard = document.getElementById('pass-status-card');
    const passStatusText = document.getElementById('pass-status');
    const statusIcon = document.getElementById('status-icon');
    
    if (marksObtained >= passingMarks) {
        passStatusCard.classList.add('pass');
        passStatusText.textContent = 'Passed';
        passStatusText.classList.add('pass');
        statusIcon.className = 'fas fa-trophy';
    } else {
        passStatusCard.classList.add('fail');
        passStatusText.textContent = 'Failed';
        passStatusText.classList.add('fail');
        statusIcon.className = 'fas fa-times-circle';
    }
    
    // Statistics
    document.getElementById('correct-answers').textContent = data.correct_answers;
    document.getElementById('wrong-answers').textContent = data.wrong_answers;
    document.getElementById('attempted-questions').textContent = data.attempted_questions;
    document.getElementById('unattempted-questions').textContent =
        data.total_questions - data.attempted_questions;
    
    // Question-wise Breakdown
    displayQuestionBreakdown(data.question_wise_breakdown);
}

function displayQuestionBreakdown(breakdown) {
    const container = document.getElementById('questions-breakdown');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    
    breakdown.forEach((item, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        
        // Determine status class
        if (item.marks_awarded > 0) {
            questionDiv.classList.add('correct');
        } else if (item.marks_awarded < 0) {
            questionDiv.classList.add('wrong');
        } else if (item.student_answer && item.student_answer.trim() !== '') {
            questionDiv.classList.add('partial');
        }
        
        // Question Header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'question-header';
        
        const questionNumber = document.createElement('div');
        questionNumber.className = 'question-number';
        questionNumber.textContent = `Question ${index + 1}`;
        
        const questionType = document.createElement('span');
        questionType.className = `question-type ${item.type.toLowerCase()}`;
        questionType.textContent = item.type;
        
        headerDiv.appendChild(questionNumber);
        headerDiv.appendChild(questionType);
        questionDiv.appendChild(headerDiv);
        
        // Question Text
        const questionText = document.createElement('div');
        questionText.className = 'question-text';
        questionText.textContent = item.question_text;
        questionDiv.appendChild(questionText);
        
        // Answers Section
        const answerSection = document.createElement('div');
        answerSection.className = 'answer-section';
        
        // Student Answer
        const studentAnswerBox = document.createElement('div');
        studentAnswerBox.className = 'answer-box';
        
        const studentAnswerLabel = document.createElement('div');
        studentAnswerLabel.className = 'answer-label';
        studentAnswerLabel.innerHTML = '<i class="fas fa-user"></i> Your Answer:';
        
        const studentAnswerValue = document.createElement('div');
        studentAnswerValue.className = 'answer-value';
        
        // Handle Code answers (JSON format)
        if (item.type === 'Code' && item.student_answer) {
            try {
                const codeData = JSON.parse(item.student_answer);
                studentAnswerValue.className = 'answer-value code-answer';
                studentAnswerValue.textContent = `[${codeData.language}]\n${codeData.code || 'No code submitted'}`;
            } catch (e) {
                studentAnswerValue.textContent = item.student_answer || 'Not Attempted';
            }
        } else {
            studentAnswerValue.textContent = item.student_answer || 'Not Attempted';
        }
        
        studentAnswerBox.appendChild(studentAnswerLabel);
        studentAnswerBox.appendChild(studentAnswerValue);
        answerSection.appendChild(studentAnswerBox);
        
        // Correct Answer (only for MCQ/TF)
        if (item.type === 'MCQ' || item.type === 'TF') {
            const correctAnswerBox = document.createElement('div');
            correctAnswerBox.className = 'answer-box';
            
            const correctAnswerLabel = document.createElement('div');
            correctAnswerLabel.className = 'answer-label';
            correctAnswerLabel.innerHTML = '<i class="fas fa-check"></i> Correct Answer:';
            
            const correctAnswerValue = document.createElement('div');
            correctAnswerValue.className = 'answer-value';
            correctAnswerValue.textContent = item.correct_answer || 'N/A';
            
            correctAnswerBox.appendChild(correctAnswerLabel);
            correctAnswerBox.appendChild(correctAnswerValue);
            answerSection.appendChild(correctAnswerBox);
        }
        
        questionDiv.appendChild(answerSection);
        
        // Marks Awarded
        const marksDiv = document.createElement('div');
        marksDiv.className = 'marks-awarded';
        
        if (item.marks_awarded > 0) {
            marksDiv.classList.add('correct');
            marksDiv.innerHTML = `<i class="fas fa-check-circle"></i> Marks Awarded: +${item.marks_awarded}`;
        } else if (item.marks_awarded < 0) {
            marksDiv.classList.add('wrong');
            marksDiv.innerHTML = `<i class="fas fa-times-circle"></i> Marks Awarded: ${item.marks_awarded}`;
        } else {
            marksDiv.classList.add('partial');
            marksDiv.innerHTML = `<i class="fas fa-minus-circle"></i> Marks Awarded: 0`;
        }
        
        questionDiv.appendChild(marksDiv);
        container.appendChild(questionDiv);
    });
}

function downloadPDF() {
    window.print();
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
