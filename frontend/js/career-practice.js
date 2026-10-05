/* CampusLink student assessment and written mock interview. */
(() => {
    'use strict';

    const user = window.CampusAuth?.getCurrentUser?.();
    const userId = user?.id || user?._id;
    if (!userId) return;

    const root = document.getElementById('career-practice-view');
    if (!root) return;
    const path = `/students/${encodeURIComponent(userId)}/career-practice`;
    const $ = (id) => document.getElementById(id);
    const screens = ['career-practice-home', 'assessment-session', 'assessment-result', 'interview-session', 'interview-result'];
    let assessmentAttempt = null;
    let assessmentAnswers = new Map();
    let assessmentIndex = 0;
    let assessmentTimer = null;
    let interviewAttempt = null;
    let interviewAnswers = new Map();
    let interviewIndex = 0;
    let rolesLoaded = false;

    function showScreen(id) {
        screens.forEach((screenId) => $(screenId)?.classList.toggle('hidden', screenId !== id));
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function status(element, message, tone = '') {
        if (!element) return;
        element.textContent = message || '';
        element.dataset.tone = tone;
    }

    function updateProgress(prefix, answered, total) {
        const percent = Math.round((answered / total) * 100);
        const fill = $(`${prefix}-progress-fill`);
        const label = $(`${prefix}-progress-label`);
        fill?.style.setProperty('width', `${percent}%`);
        if (label) label.textContent = `${percent}% complete`;
        fill?.parentElement?.setAttribute('aria-valuenow', String(answered));
    }

    function refreshReadinessSnapshot() {
        CampusAPI.get(`/students/${encodeURIComponent(userId)}/readiness`).then((response) => {
            const readiness = response.data;
            const values = [
                ['Technical skills', readiness?.breakdown?.technicalSkills],
                ['Projects', readiness?.breakdown?.projects],
                ['Academic', readiness?.breakdown?.academic],
                ['Assessment', readiness?.breakdown?.assessment],
                ['Interview', readiness?.breakdown?.interview]
            ];
            const score = $('dashboard-readiness-score');
            const category = $('dashboard-readiness-category');
            const breakdown = $('dashboard-readiness-breakdown');
            if (score) score.textContent = readiness?.score == null ? '—' : String(readiness.score);
            if (category && readiness?.category) category.textContent = readiness.category;
            if (breakdown) breakdown.innerHTML = values.filter(([, value]) => value != null).map(([label, value]) => `<div><span>${CampusUtils.escapeHtml(label)}</span><strong>${CampusUtils.escapeHtml(String(value))}</strong><div class="dashboard-mini-track"><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></div></div>`).join('');
        }).catch(() => {});
    }

    async function loadLatest() {
        try {
            const response = await CampusAPI.get(`${path}/latest`);
            const assessment = response.data?.assessment;
            const interview = response.data?.interview;
            const assessmentLabel = assessment ? `${assessment.overallScore} / 100` : 'Not taken yet';
            const interviewLabel = interview ? `${interview.overallScore} / 100` : 'Not taken yet';
            if ($('practice-latest-assessment')) $('practice-latest-assessment').textContent = assessmentLabel;
            if ($('practice-latest-interview')) $('practice-latest-interview').textContent = interviewLabel;
            if ($('dashboard-assessment-score')) $('dashboard-assessment-score').textContent = assessmentLabel;
            if ($('dashboard-interview-score')) $('dashboard-interview-score').textContent = interviewLabel;
        } catch (_) {
            if ($('practice-latest-assessment')) $('practice-latest-assessment').textContent = 'Unavailable';
            if ($('practice-latest-interview')) $('practice-latest-interview').textContent = 'Unavailable';
        }
    }

    async function loadJobRoles() {
        if (rolesLoaded) return;
        rolesLoaded = true;
        const select = $('interview-target-role');
        if (!select) return;
        try {
            const response = await CampusAPI.get('/jobs');
            const jobs = Array.isArray(response.data) ? response.data : [];
            const roles = jobs.map((job) => ({
                value: String(job.requirements?.role || job.title || '').trim(),
                label: [job.requirements?.role || job.title, job.companyName || job.company].filter(Boolean).join(' · ')
            })).filter((item) => item.value);
            const options = [new Option('Choose an active role…', ''), ...roles.map((item) => new Option(item.label, item.value)), new Option('Enter a custom role', '__custom')];
            select.replaceChildren(...options);
            if (!roles.length) select.options[0].textContent = 'No active roles — enter a custom role';
        } catch (_) {
            select.replaceChildren(new Option('Choose a role…', ''), new Option('Enter a custom role', '__custom'));
        }
    }

    async function open() {
        showScreen('career-practice-home');
        const title = $('career-practice-title');
        if (title) title.textContent = 'Career Practice';
        await Promise.all([loadLatest(), loadJobRoles()]);
    }
    window.CampusCareerPractice = { open };

    // Route dashboard calls to the existing portal navigation so its active state,
    // page title, and view switching stay consistent with every other workspace.
    document.querySelectorAll('[data-dashboard-action="assessment"], [data-dashboard-action="mock-interview"]').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelector('.sidebar-link[data-section="career-practice"]')?.click();
        });
    });
    document.querySelectorAll('[data-practice-home]').forEach((button) => button.addEventListener('click', open));

    function renderAssessmentQuestion() {
        if (!assessmentAttempt) return;
        const questions = assessmentAttempt.questions || [];
        const question = questions[assessmentIndex];
        if (!question) return;
        const count = questions.length;
        const current = assessmentIndex + 1;
        const progress = Math.round((assessmentAnswers.size / count) * 100);
        $('assessment-session-title').textContent = `Question ${current} of ${count}`;
        $('assessment-progress-label').textContent = `${progress}% complete`;
        $('assessment-progress-fill').style.width = `${progress}%`;
        $('assessment-progress-fill')?.parentElement?.setAttribute('aria-valuenow', String(assessmentAnswers.size));
        $('assessment-previous-btn').disabled = assessmentIndex === 0;
        $('assessment-next-btn').classList.toggle('hidden', assessmentIndex === count - 1);
        $('assessment-submit-btn').classList.toggle('hidden', assessmentIndex !== count - 1);

        const host = $('assessment-question-content');
        host.replaceChildren();
        const category = document.createElement('span');
        category.className = 'career-practice-category';
        category.textContent = question.category;
        const prompt = document.createElement('h4');
        prompt.className = 'career-practice-question-prompt';
        prompt.textContent = question.prompt;
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'career-practice-options';
        const legend = document.createElement('legend');
        legend.textContent = 'Select one answer';
        fieldset.append(legend);
        question.options.forEach((option, index) => {
            const label = document.createElement('label');
            label.className = 'career-practice-option';
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'assessment-answer'; radio.value = String(index);
            radio.checked = assessmentAnswers.get(question.id) === index;
            radio.addEventListener('change', () => {
                assessmentAnswers.set(question.id, index);
                updateProgress('assessment', assessmentAnswers.size, count);
                fieldset.querySelectorAll('.career-practice-option').forEach((item) => item.classList.toggle('is-selected', item === label));
                status($('assessment-session-status'), 'Answer saved for this question.');
            });
            const marker = document.createElement('span'); marker.className = 'career-practice-option-marker'; marker.textContent = String.fromCharCode(65 + index);
            const text = document.createElement('span'); text.className = 'career-practice-option-text'; text.textContent = option;
            label.classList.toggle('is-selected', radio.checked);
            label.append(radio, marker, text); fieldset.append(label);
        });
        host.append(category, prompt, fieldset);
        status($('assessment-session-status'), '');
    }

    function startAssessmentClock() {
        window.clearInterval(assessmentTimer);
        const target = new Date(assessmentAttempt.expiresAt).getTime();
        const update = () => {
            const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
            $('assessment-timer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')} remaining`;
            if (!remaining) {
                window.clearInterval(assessmentTimer);
                $('assessment-next-btn').disabled = true;
                $('assessment-submit-btn').disabled = true;
                status($('assessment-session-status'), 'Time is up. This attempt expired; return to practice to start a new one.', 'error');
            }
        };
        update(); assessmentTimer = window.setInterval(update, 1000);
    }

    async function startAssessment() {
        const button = $('assessment-start-btn');
        try {
            CampusUtils.setButtonLoading(button, true, 'Loading assessment…');
            const response = await CampusAPI.post(`${path}/assessment/start`, {});
            assessmentAttempt = response.data;
            if (assessmentAttempt.status === 'completed' && assessmentAttempt.result) return showAssessmentResult(assessmentAttempt.result);
            assessmentAnswers = new Map(); assessmentIndex = 0;
            renderAssessmentQuestion(); startAssessmentClock(); showScreen('assessment-session');
        } catch (error) { status($('assessment-start-status'), error.message || 'Could not start the assessment.', 'error'); }
        finally { CampusUtils.setButtonLoading(button, false); }
    }

    function scoreBlock(label, score, className = '') {
        const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
        return `<div class="career-practice-score-block ${className}"><span>${CampusUtils.escapeHtml(label)}</span><strong>${safeScore}<small>/100</small></strong><div class="career-practice-score-track"><i style="width:${safeScore}%"></i></div></div>`;
    }

    function listBlock(title, items, modifier) {
        return `<section class="career-practice-feedback ${modifier}"><h4>${CampusUtils.escapeHtml(title)}</h4><ul>${(items || []).map((item) => `<li>${CampusUtils.escapeHtml(item)}</li>`).join('')}</ul></section>`;
    }

    function showAssessmentResult(result) {
        window.clearInterval(assessmentTimer);
        const overall = Math.max(0, Math.min(100, Number(result.overallScore) || 0));
        $('assessment-result-content').innerHTML = `<div class="career-practice-result-header"><span class="career-practice-complete-mark" aria-hidden="true">✓</span><p class="career-practice-eyebrow">ASSESSMENT COMPLETE</p><h3 id="assessment-result-title">A clear snapshot of your current skills</h3><div class="career-practice-overall-score">${overall}<small>/100</small></div><p>Your score combines technical performance (70%) and aptitude (30%).</p></div><div class="career-practice-result-scores">${scoreBlock('Overall score', overall, 'is-overall')}${scoreBlock('Technical', result.technicalScore)}${scoreBlock('Aptitude', result.aptitudeScore)}</div><div class="career-practice-feedback-grid">${listBlock('Strengths', result.strengths, 'is-strength')}${listBlock('Areas to improve', result.improvementAreas, 'is-improvement')}</div><div class="career-practice-result-actions"><button type="button" class="btn btn-secondary" data-practice-home>Back to practice</button><button type="button" class="btn btn-primary" id="assessment-retake-btn">Retake assessment</button></div>`;
        $('assessment-result-content').querySelector('[data-practice-home]').addEventListener('click', open);
        $('assessment-retake-btn').addEventListener('click', startAssessment);
        showScreen('assessment-result'); refreshReadinessSnapshot(); loadLatest();
    }

    $('assessment-start-btn')?.addEventListener('click', startAssessment);
    $('assessment-previous-btn')?.addEventListener('click', () => { if (assessmentIndex > 0) { assessmentIndex--; renderAssessmentQuestion(); } });
    $('assessment-next-btn')?.addEventListener('click', () => { if (assessmentIndex < assessmentAttempt.questions.length - 1) { assessmentIndex++; renderAssessmentQuestion(); } });
    $('assessment-submit-btn')?.addEventListener('click', async () => {
        const questions = assessmentAttempt?.questions || [];
        const missing = questions.findIndex((question) => !assessmentAnswers.has(question.id));
        if (missing !== -1) { assessmentIndex = missing; renderAssessmentQuestion(); status($('assessment-session-status'), 'Choose an answer for every question before submitting.', 'error'); return; }
        if (!window.confirm('Submit your assessment and view your results?')) return;
        const button = $('assessment-submit-btn');
        try {
            CampusUtils.setButtonLoading(button, true, 'Scoring…');
            const answers = questions.map((question) => ({ questionId: question.id, selectedIndex: assessmentAnswers.get(question.id) }));
            const response = await CampusAPI.post(`${path}/assessment/${encodeURIComponent(assessmentAttempt.id)}/submit`, { answers });
            showAssessmentResult(response.data);
        } catch (error) { status($('assessment-session-status'), error.message || 'Could not submit the assessment.', 'error'); }
        finally { CampusUtils.setButtonLoading(button, false); }
    });

    $('interview-target-role')?.addEventListener('change', (event) => {
        const custom = event.target.value === '__custom';
        $('interview-custom-role')?.classList.toggle('hidden', !custom);
        if (custom) $('interview-custom-role')?.focus();
    });

    async function startInterview() {
        const selection = $('interview-target-role')?.value || '';
        const targetRole = selection === '__custom' ? $('interview-custom-role')?.value?.trim() : selection;
        if (!targetRole) { status($('interview-start-status'), 'Choose an active role or enter a target role first.', 'error'); return; }
        const button = $('interview-start-btn');
        try {
            CampusUtils.setButtonLoading(button, true, 'Preparing questions…');
            const response = await CampusAPI.post(`${path}/mock-interviews/start`, { targetRole });
            interviewAttempt = response.data;
            if (interviewAttempt.status === 'completed' && interviewAttempt.result) return showInterviewResult(interviewAttempt.result);
            interviewAnswers = new Map((interviewAttempt.answers || []).map((answer) => [answer.questionId, answer.answer]));
            interviewIndex = 0; renderInterviewQuestion(); showScreen('interview-session');
        } catch (error) { status($('interview-start-status'), error.message || 'Could not start the mock interview.', 'error'); }
        finally { CampusUtils.setButtonLoading(button, false); }
    }

    function renderInterviewQuestion() {
        const questions = interviewAttempt?.questions || [];
        const question = questions[interviewIndex];
        if (!question) return;
        const count = questions.length;
        const completedAnswers = [...interviewAnswers.values()].filter((answer) => String(answer || '').trim().length >= 2).length;
        const progress = Math.round((completedAnswers / count) * 100);
        $('interview-session-title').textContent = `Question ${interviewIndex + 1} of ${count}`;
        $('interview-question-category').textContent = question.category;
        $('interview-session-role').textContent = interviewAttempt.targetRole;
        $('interview-progress-label').textContent = `${progress}% complete`;
        $('interview-progress-fill').style.width = `${progress}%`;
        $('interview-progress-fill')?.parentElement?.setAttribute('aria-valuenow', String(completedAnswers));
        const prompt = document.createElement('h4'); prompt.className = 'career-practice-question-prompt'; prompt.textContent = question.prompt;
        $('interview-question-content').replaceChildren(prompt);
        $('interview-previous-btn').disabled = interviewIndex === 0;
        $('interview-next-btn').classList.toggle('hidden', interviewIndex === count - 1);
        $('interview-submit-btn').classList.toggle('hidden', interviewIndex !== count - 1);
        $('interview-answer').value = interviewAnswers.get(question.id) || '';
        $('interview-answer-count').textContent = `${$('interview-answer').value.length} / 2,000`;
        $('interview-answer').disabled = false;
        status($('interview-session-status'), '');
    }

    $('interview-start-btn')?.addEventListener('click', startInterview);
    $('interview-answer')?.addEventListener('input', (event) => {
        const question = interviewAttempt?.questions?.[interviewIndex];
        if (question) interviewAnswers.set(question.id, event.target.value);
        $('interview-answer-count').textContent = `${event.target.value.length} / 2,000`;
        updateProgress('interview', [...interviewAnswers.values()].filter((answer) => String(answer || '').trim().length >= 2).length, interviewAttempt?.questions?.length || 5);
    });
    $('interview-previous-btn')?.addEventListener('click', () => {
        if (interviewIndex > 0) { const q = interviewAttempt.questions[interviewIndex]; interviewAnswers.set(q.id, $('interview-answer').value); interviewIndex--; renderInterviewQuestion(); }
    });
    $('interview-next-btn')?.addEventListener('click', () => {
        const q = interviewAttempt.questions[interviewIndex];
        if ($('interview-answer').value.trim().length < 2) { status($('interview-session-status'), 'Add a little more detail before moving to the next question.', 'error'); return; }
        interviewAnswers.set(q.id, $('interview-answer').value);
        if (interviewIndex < interviewAttempt.questions.length - 1) { interviewIndex++; renderInterviewQuestion(); }
    });

    function showInterviewResult(result) {
        $('interview-result-content').innerHTML = `<div class="career-practice-result-header"><span class="career-practice-complete-mark" aria-hidden="true">✓</span><p class="career-practice-eyebrow">MOCK INTERVIEW COMPLETE · ${CampusUtils.escapeHtml(result.targetRole || interviewAttempt?.targetRole || '')}</p><h3 id="interview-result-title">Your practice report</h3><div class="career-practice-overall-score">${Math.max(0, Math.min(100, Number(result.overallScore) || 0))}<small>/100</small></div><p>Interview score combines technical (60%), communication (25%), and behavioral (15%) performance.</p></div><div class="career-practice-result-scores">${scoreBlock('Technical', result.technicalScore)}${scoreBlock('Communication', result.communicationScore)}${scoreBlock('Behavioral', result.behavioralScore)}${scoreBlock('Interview score', result.overallScore, 'is-overall')}</div><div class="career-practice-feedback-grid">${listBlock('Strengths', result.strengths, 'is-strength')}${listBlock('Areas to improve', result.improvementAreas, 'is-improvement')}</div><section class="career-practice-ai-feedback"><h4>AI feedback</h4><p>${CampusUtils.escapeHtml(result.feedback || '')}</p></section><div class="career-practice-result-actions"><button type="button" class="btn btn-secondary" data-practice-home>Back to practice</button><button type="button" class="btn btn-primary" id="interview-again-btn">Practice another role</button></div>`;
        $('interview-result-content').querySelector('[data-practice-home]').addEventListener('click', open);
        $('interview-again-btn').addEventListener('click', open);
        showScreen('interview-result'); refreshReadinessSnapshot(); loadLatest();
    }

    $('interview-submit-btn')?.addEventListener('click', async () => {
        const questions = interviewAttempt?.questions || [];
        const current = questions[interviewIndex];
        if ($('interview-answer').value.trim().length < 2) { status($('interview-session-status'), 'Add a little more detail before requesting feedback.', 'error'); return; }
        interviewAnswers.set(current.id, $('interview-answer').value);
        const missing = questions.findIndex((question) => (interviewAnswers.get(question.id) || '').trim().length < 2);
        if (missing !== -1) { interviewIndex = missing; renderInterviewQuestion(); status($('interview-session-status'), 'Answer each question so the feedback reflects the full interview.', 'error'); return; }
        if (!window.confirm('Submit these answers for AI feedback?')) return;
        const button = $('interview-submit-btn');
        try {
            CampusUtils.setButtonLoading(button, true, 'Evaluating answers…');
            status($('interview-session-status'), 'Evaluating your responses. This can take a few seconds.');
            $('interview-answer').disabled = true;
            const answers = questions.map((question) => ({ questionId: question.id, answer: interviewAnswers.get(question.id) }));
            const response = await CampusAPI.post(`${path}/mock-interviews/${encodeURIComponent(interviewAttempt.id)}/submit`, { answers });
            showInterviewResult(response.data);
        } catch (error) {
            $('interview-answer').disabled = false;
            status($('interview-session-status'), `${error.message || 'AI evaluation could not be completed.'} Your answers are still here; you can retry.`, 'error');
        } finally { CampusUtils.setButtonLoading(button, false); }
    });

    loadLatest();
})();
