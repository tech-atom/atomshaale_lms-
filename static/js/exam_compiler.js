// Embedded Code Compiler for Exam Questions
// This provides a simple code editor and runner for coding questions

class ExamCompiler {
    constructor(containerId, questionId, apiEndpoint = '/exam/api/compile-code/', registryName = 'examCompilers') {
        this.container = document.getElementById(containerId);
        this.questionId = questionId;
        this.apiEndpoint = apiEndpoint; // Allow custom API endpoint
        this.registryName = registryName; // Registry name for method calls
        this.init();
    }

    init() {
        // Create comprehensive compiler UI
        const compilerHTML = `
            <div class="exam-compiler compact" id="compiler-${this.questionId}">
                <div class="compiler-header">
                    <div class="compiler-controls">
                        <label style="color: white; margin-right: 8px; font-weight: 600;">
                            <i class="fas fa-code"></i> Language:
                        </label>
                        <select class="language-select" id="lang-${this.questionId}">
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="c">C</option>
                            <option value="cpp">C++</option>
                            <option value="csharp">C#</option>
                            <option value="javascript">JavaScript</option>
                            <option value="php">PHP</option>
                        </select>
                        <button type="button" class="btn-run" data-action="run-code">
                            <i class="fas fa-play"></i> Run Code
                        </button>
                        <button type="button" class="btn-template" data-action="load-template">
                            <i class="fas fa-file-code"></i> Template
                        </button>
                    </div>
                    <div class="compiler-info">
                        <span id="status-${this.questionId}" class="status-indicator">Ready</span>
                    </div>
                </div>
                <div class="compiler-body">
                    <div class="code-section">
                        <div class="section-header">
                            <label><i class="fas fa-edit"></i> Code Editor</label>
                            <div class="editor-tools">
                                <button type="button" class="btn-tool" data-action="format-code" title="Format Code">
                                    <i class="fas fa-align-left"></i>
                                </button>
                                <button type="button" class="btn-tool" data-action="download-code" title="Download Code">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </div>
                        <textarea 
                            class="code-editor" 
                            id="code-${this.questionId}" 
                            rows="18" 
                            placeholder="Write your code here... Auto-save enabled!"
                            spellcheck="false"></textarea>
                        <div class="input-section">
                            <label><i class="fas fa-keyboard"></i> Test Input (optional):</label>
                            <textarea 
                                class="input-editor" 
                                id="input-${this.questionId}" 
                                rows="3" 
                                placeholder="Enter test input (one value per line)&#10;Example:&#10;5&#10;Hello World"
                                spellcheck="false"></textarea>
                        </div>
                    </div>
                    <div class="output-section">
                        <label><i class="fas fa-terminal"></i> Program Output</label>
                        <div class="output-display" id="output-${this.questionId}">
                            <div class="output-placeholder">
                                <i class="fas fa-rocket"></i> Ready to run your code!
                                <br><small>Write code in the editor and click "Run Code"</small>
                            </div>
                        </div>
                        <div class="compiler-stats" id="stats-${this.questionId}" style="display:none;">
                            <small class="text-muted">
                                <i class="fas fa-clock"></i> Execution time: <span class="exec-time">--</span>ms
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = compilerHTML;
        this.attachEventListeners();
        this.loadSavedCode(); // Auto-load saved code
    }

    attachEventListeners() {
        const langSelect = document.getElementById(`lang-${this.questionId}`);
        const codeEditor = document.getElementById(`code-${this.questionId}`);
        const runBtn = this.container.querySelector('[data-action="run-code"]');
        const templateBtn = this.container.querySelector('[data-action="load-template"]');
        const formatBtn = this.container.querySelector('[data-action="format-code"]');
        const downloadBtn = this.container.querySelector('[data-action="download-code"]');

        langSelect.addEventListener('change', () => this.onLanguageChange());
        if (runBtn) runBtn.addEventListener('click', () => this.runCode());
        if (templateBtn) templateBtn.addEventListener('click', () => this.loadTemplate());
        if (formatBtn) formatBtn.addEventListener('click', () => this.formatCode());
        if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadCode());

        // Auto-save code as user types
        codeEditor.addEventListener('input', () => {
            this.saveCode();
        });

        // Tab key support in textarea
        codeEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = codeEditor.selectionStart;
                const end = codeEditor.selectionEnd;
                codeEditor.value = codeEditor.value.substring(0, start) + '    ' + codeEditor.value.substring(end);
                codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
            }
        });
    }

    onLanguageChange() {
        const lang = document.getElementById(`lang-${this.questionId}`).value;
        const codeEditor = document.getElementById(`code-${this.questionId}`);
        const statusSpan = document.getElementById(`status-${this.questionId}`);
        const outputDiv = document.getElementById(`output-${this.questionId}`);

        statusSpan.textContent = `${lang.toUpperCase()} selected`;
        statusSpan.style.color = '#ffc107';

        if (outputDiv) {
            outputDiv.innerHTML = '<div class="output-info"><i class="fas fa-terminal"></i> Output will appear here...</div>';
        }

        setTimeout(() => {
            statusSpan.textContent = 'Ready';
            statusSpan.style.color = '#28a745';
        }, 1500);
    }

    loadTemplate() {
        const lang = document.getElementById(`lang-${this.questionId}`).value;
        const codeEditor = document.getElementById(`code-${this.questionId}`);

        const templates = {
            python: `# Python Template
# Write your solution here
def main():
    # Your code
    print("Hello, World!")

if __name__ == "__main__":
    main()
`,
            java: `// Java Template
public class Main {
    public static void main(String[] args) {
        // Your code here
        System.out.println("Hello, World!");
    }
}`,
            c: `// C Template
#include <stdio.h>

int main() {
    // Your code here
    printf("Hello, World!\\n");
    return 0;
}`,
            cpp: `// C++ Template
#include <iostream>
using namespace std;

int main() {
    // Your code here
    cout << "Hello, World!" << endl;
    return 0;
}`,
            csharp: `// C# Template
using System;

class Program {
    static void Main() {
        // Your code here
        Console.WriteLine("Hello, World!");
    }
}`,
            javascript: `// JavaScript Template
// Your code here
console.log("Hello, World!");
`,
            php: `<?php
// PHP Template
// Your code here
echo "Hello, World!\\n";
?>`
        };

        if (codeEditor.value.trim() === '' || confirm('Replace current code with template?')) {
            codeEditor.value = templates[lang] || '';
            this.saveCode();
            const outputDiv = document.getElementById(`output-${this.questionId}`);
            if (outputDiv) {
                outputDiv.innerHTML = '<div class="output-info"><i class="fas fa-terminal"></i> Output will appear here...</div>';
            }
        }
    }

    formatCode() {
        // Basic code formatting
        const codeEditor = document.getElementById(`code-${this.questionId}`);
        let code = codeEditor.value;

        // Remove multiple blank lines
        code = code.replace(/\n{3,}/g, '\n\n');

        codeEditor.value = code;
        this.saveCode();

        this.showNotification('Code formatted!', 'success');
    }

    downloadCode() {
        const lang = document.getElementById(`lang-${this.questionId}`).value;
        const code = document.getElementById(`code-${this.questionId}`).value;

        const extensions = {
            python: 'py',
            java: 'java',
            c: 'c',
            cpp: 'cpp',
            csharp: 'cs',
            javascript: 'js',
            php: 'php'
        };

        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code_${this.questionId}.${extensions[lang] || 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('Code downloaded!', 'success');
    }

    saveCode() {
        const code = document.getElementById(`code-${this.questionId}`).value;
        localStorage.setItem(this.getStorageKey(), code);
        return code; // Return the code for form submission
    }

    loadSavedCode() {
        const savedCode = localStorage.getItem(this.getStorageKey());
        if (savedCode) {
            document.getElementById(`code-${this.questionId}`).value = savedCode;
        }
    }

    getStorageKey() {
        const userId = this.getCurrentUserId();
        const scope = this.registryName || 'default';
        return `exam_code_${userId}_${scope}_${this.questionId}`;
    }

    getCurrentUserId() {
        // Try to get user ID from exam or practice test API div
        let apiDiv = document.getElementById('exam-api-urls');
        if (!apiDiv) {
            apiDiv = document.getElementById('practice-api-urls');
        }

        if (apiDiv && apiDiv.dataset.currentUser) {
            return apiDiv.dataset.currentUser;
        }
        // Fallback to window variable if available
        if (window.currentUserId) {
            return window.currentUserId;
        }
        // Default to 'guest' if user ID not found
        return 'guest';
    }

    showNotification(message, type = 'info') {
        const statusSpan = document.getElementById(`status-${this.questionId}`);
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            info: '#17a2b8'
        };

        statusSpan.textContent = message;
        statusSpan.style.color = colors[type] || colors.info;

        setTimeout(() => {
            statusSpan.textContent = 'Ready';
            statusSpan.style.color = '#28a745';
        }, 2000);
    }

    renderJudgeResult(outputDiv, judgeData) {
        const verdict = judgeData.verdict || 'Wrong Answer';
        const passed = Number(judgeData.passed || 0);
        const total = Number(judgeData.total || 0);
        const failed = Math.max(total - passed, 0);
        const details = Array.isArray(judgeData.details) ? judgeData.details : [];

        const verdictClass = verdict === 'Accepted'
            ? 'output-success'
            : (verdict === 'Time Limit Exceeded' || verdict === 'Runtime Error' || verdict === 'Compilation Error' ? 'output-error' : 'output-info');

        const detailsHtml = details.map((d) => {
            const status = d.status || 'Fail';
            const isPass = status === 'Pass';
            return `<div style="margin-top:8px; padding:8px; border:1px solid #2f3f46; border-radius:8px;">
                <div style="font-weight:700; color:${isPass ? '#28a745' : '#dc3545'};">Test Case ${this.escapeHtml(String(d.test_case || ''))}: ${this.escapeHtml(status)}</div>
                <div><small><strong>Expected:</strong> ${this.escapeHtml(String(d.expected ?? ''))}</small></div>
                <div><small><strong>Got:</strong> ${this.escapeHtml(String(d.got ?? ''))}</small></div>
            </div>`;
        }).join('');

        outputDiv.innerHTML = `<div class="${verdictClass}">
            <div style="margin-bottom:8px; font-weight:700;">
                <i class="fas ${verdict === 'Accepted' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                Verdict: ${this.escapeHtml(verdict)}
            </div>
            <div style="font-weight:600; margin-bottom:8px;">
                Passed: ${passed}/${total} | Failed: ${failed}/${total}
            </div>
            ${detailsHtml || '<small>No sample test case details available.</small>'}
        </div>`;

        return verdict;
    }

    async runCode() {
        const codeEditor = document.getElementById(`code-${this.questionId}`);
        const inputEditor = document.getElementById(`input-${this.questionId}`);
        const outputDiv = document.getElementById(`output-${this.questionId}`);
        const langSelect = document.getElementById(`lang-${this.questionId}`);
        const runBtn = this.container.querySelector('.btn-run');
        const statusSpan = document.getElementById(`status-${this.questionId}`);
        const statsDiv = document.getElementById(`stats-${this.questionId}`);

        const code = codeEditor.value.trim();
        const input = inputEditor.value;
        const language = langSelect.value;

        if (!code) {
            outputDiv.innerHTML = '<div class="output-error"><i class="fas fa-exclamation-triangle"></i> Please enter some code to run.</div>';
            return;
        }

        // Show loading state
        const startTime = performance.now();
        outputDiv.innerHTML = `<div class="output-loading">
            <i class="fas fa-spinner fa-spin"></i> Compiling and executing ${language.toUpperCase()} code...
            <br><small>Please wait, this may take a few seconds...</small>
        </div>`;
        runBtn.disabled = true;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        statusSpan.textContent = 'Executing...';
        statusSpan.style.color = '#17a2b8';

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    input: input,
                    question_id: String(this.questionId)
                })
            });

            if (response.status === 202) {
                const queued = await response.json();
                const statusUrl = response.headers.get('Location')
                    || `${this.apiEndpoint}${queued.job_id}/`;
                let completed = false;

                for (let attempt = 0; attempt < 180; attempt += 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const statusResponse = await fetch(statusUrl, {
                        method: 'GET',
                        headers: {'X-CSRFToken': this.getCSRFToken()}
                    });
                    const statusData = await statusResponse.json();
                    if (statusData.status === 'queued' || statusData.status === 'pending' || statusData.status === 'started') {
                        statusSpan.textContent = `Compiler queue: ${statusData.status}`;
                        continue;
                    }
                    response = new Response(JSON.stringify(statusData), {
                        status: statusResponse.status,
                        headers: {'Content-Type': 'application/json'}
                    });
                    completed = true;
                    break;
                }

                if (!completed) {
                    throw new Error('Compiler job timed out while waiting in the queue.');
                }
            }

            const raw = await response.text();
            let data = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = { success: false, error: raw || `HTTP ${response.status}` };
            }

            const endTime = performance.now();
            const executionTime = Math.round(endTime - startTime);

            // Auto-update language selector if backend detected a different language
            if (data.language && langSelect.value !== data.language) {
                langSelect.value = data.language;
                this.onLanguageChange();
            }

            const isConfigErrorVerdict = String(data.verdict || '').toLowerCase() === 'configuration error';
            const judgeData = (!isConfigErrorVerdict && data.verdict)
                ? {
                    verdict: data.verdict,
                    passed: data.passed,
                    total: data.total,
                    details: data.details
                }
                : (data.judge && data.judge.verdict ? data.judge : null);

            if (judgeData) {
                const verdict = this.renderJudgeResult(outputDiv, judgeData);
                statusSpan.textContent = verdict;
                statusSpan.style.color = verdict === 'Accepted' ? '#28a745' : '#dc3545';
            } else if (data.success || data.output || data.error) {
                let output = '';

                // Show execution time
                statsDiv.style.display = 'block';
                statsDiv.querySelector('.exec-time').textContent = executionTime;

                if (data.output) {
                    output += `<div class="output-success">
                        <div style="margin-bottom: 8px; font-weight: 600; color: #28a745;">
                            <i class="fas fa-check-circle"></i> Program Output:
                        </div>
                        <pre style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(data.output)}</pre>
                    </div>`;
                }

                if (data.error) {
                    output += `<div class="output-error" style="margin-top: 10px;">
                        <div style="margin-bottom: 8px; font-weight: 600;">
                            <i class="fas fa-exclamation-circle"></i> Warnings/Errors:
                        </div>
                        <pre style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(data.error)}</pre>
                    </div>`;
                }

                if (!data.output && !data.error) {
                    output = `<div class="output-info">
                        <i class="fas fa-info-circle"></i> Code executed successfully with no output.
                        <br><small>Execution time: ${executionTime}ms</small>
                    </div>`;
                }

                outputDiv.innerHTML = output;
                statusSpan.textContent = 'Success!';
                statusSpan.style.color = '#28a745';

            } else {
                outputDiv.innerHTML = `<div class="output-error">
                    <div style="margin-bottom: 8px; font-weight: 600;">
                        <i class="fas fa-times-circle"></i> Compilation/Execution Error:
                    </div>
                    <pre style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(data.error)}</pre>
                    <hr style="border-color: #444; margin: 12px 0;">
                    <small style="color: #888;">
                        <i class="fas fa-lightbulb"></i> <strong>Tips:</strong><br>
                        • Check your syntax carefully<br>
                        • Ensure all required imports/includes are present<br>
                        • Verify variable names and types<br>
                        • Test with the template first if unsure
                    </small>
                </div>`;
                statusSpan.textContent = 'Error';
                statusSpan.style.color = '#dc3545';
            }
        } catch (error) {
            outputDiv.innerHTML = `<div class="output-error">
                <div style="margin-bottom: 8px; font-weight: 600;">
                    <i class="fas fa-wifi"></i> Network Error:
                </div>
                <pre style="margin: 0;">${this.escapeHtml(error.toString())}</pre>
                <hr style="border-color: #444; margin: 12px 0;">
                <small style="color: #888;">Please check your internet connection and try again.</small>
            </div>`;
            statusSpan.textContent = 'Error';
            statusSpan.style.color = '#dc3545';
        } finally {
            runBtn.disabled = false;
            runBtn.innerHTML = '<i class="fas fa-play"></i> Run Code';

            // Reset status after delay
            setTimeout(() => {
                if (statusSpan.textContent !== 'Ready') {
                    statusSpan.textContent = 'Ready';
                    statusSpan.style.color = '#28a745';
                }
            }, 3000);
        }
    }

    clearCode() {
        if (confirm('Are you sure you want to clear your code?')) {
            document.getElementById(`code-${this.questionId}`).value = '';
            document.getElementById(`output-${this.questionId}`).innerHTML = '<div class="output-placeholder">Click \'Run\' to execute your code</div>';
        }
    }

    getCode() {
        return document.getElementById(`code-${this.questionId}`).value;
    }

    setCode(code) {
        document.getElementById(`code-${this.questionId}`).value = code;
    }

    getCSRFToken() {
        const name = 'csrftoken';
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global registry for exam compilers
window.examCompilers = window.examCompilers || {};
