/* Admin Company Form Interactive Script */

document.addEventListener('DOMContentLoaded', function() {
    const stageTech = document.getElementById('stage_technical');
    const toggleBtn = document.getElementById('toggle_round2_btn');
    const closeBtn = document.getElementById('close_round2_btn');
    const round2Panel = document.getElementById('round2_details_panel');

    function updateButtonVisibility() {
        if (stageTech && stageTech.checked) {
            if (toggleBtn) toggleBtn.style.display = 'inline-flex';
        } else {
            if (toggleBtn) toggleBtn.style.display = 'none';
            if (round2Panel) round2Panel.style.display = 'none';
        }
    }

    if (stageTech) {
        stageTech.addEventListener('change', updateButtonVisibility);
        updateButtonVisibility();
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            if (round2Panel.style.display === 'none' || !round2Panel.style.display) {
                round2Panel.style.display = 'block';
                round2Panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                round2Panel.style.display = 'none';
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (round2Panel) round2Panel.style.display = 'none';
        });
    }

    // Dynamic Multiple Year Paper Cards Handler
    const addMorePaperBtn = document.getElementById('add_more_paper_row_btn');
    const multiPaperContainer = document.getElementById('multi_paper_container');

    if (addMorePaperBtn && multiPaperContainer) {
        addMorePaperBtn.addEventListener('click', function() {
            const newCard = document.createElement('div');
            newCard.className = 'year-paper-card';
            newCard.style.cssText = 'background: #ffffff; border: 1.5px solid #008037; border-radius: 8px; padding: 1.1rem; margin-bottom: 0.85rem; box-shadow: 0 2px 8px rgba(0,0,0,0.03);';
            newCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem;">
                    <span style="font-weight: 700; color: #008037; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Question Paper & Rounds Entry</span>
                    <button type="button" class="remove-paper-card-btn" style="background: #fef2f2; border: 1px solid #fca5a5; color: #ef4444; padding: 0.25rem 0.65rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Remove</button>
                </div>

                <div style="display: grid; grid-template-columns: 180px 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <label style="font-weight: 700; font-size: 0.82rem; color: #334155; display: block; margin-bottom: 0.35rem;">Paper Year *</label>
                        <input type="number" name="multi_paper_year" class="form-control" placeholder="e.g. 2023" style="width: 100%; padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem;">
                    </div>
                    <div>
                        <label style="font-weight: 700; font-size: 0.82rem; color: #334155; display: block; margin-bottom: 0.35rem;">Upload Question Paper File (.pdf, .zip, .docx)</label>
                        <input type="file" name="multi_paper_file" class="form-control" style="width: 100%; padding: 0.45rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem;">
                    </div>
                </div>

                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.85rem; margin-bottom: 0.85rem;">
                    <label style="font-weight: 700; font-size: 0.82rem; color: #1e293b; display: block; margin-bottom: 0.5rem;">Rounds included in this paper</label>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.88rem; color: #334155; cursor: pointer;">
                            <input type="checkbox" name="multi_stage_aptitude" value="on" checked style="width: 16px; height: 16px; accent-color: #008037;">
                            Round 1: Quantitative, Logical & Verbal Aptitude Round
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.88rem; color: #334155; cursor: pointer;">
                            <input type="checkbox" name="multi_stage_technical" value="on" checked style="width: 16px; height: 16px; accent-color: #008037;">
                            Round 2: Technical Domain Assessment (Coding Compiler)
                        </label>
                    </div>
                </div>

                <div>
                    <label style="font-weight: 700; font-size: 0.82rem; color: #334155; display: block; margin-bottom: 0.35rem;">Round 2 Format for this paper</label>
                    <select name="multi_technical_round_format" class="form-control" style="width: 100%; padding: 0.55rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; background: #ffffff;">
                        <option value="MCQ">MCQ (Multiple Choice Questions) Only</option>
                        <option value="Compiler">Coding Compiler Sandbox Only</option>
                    </select>
                </div>
            `;
            multiPaperContainer.appendChild(newCard);
        });

        multiPaperContainer.addEventListener('click', function(e) {
            if (e.target && e.target.classList.contains('remove-paper-card-btn')) {
                const card = e.target.closest('.year-paper-card');
                if (card) card.remove();
            }
        });
    }
});
