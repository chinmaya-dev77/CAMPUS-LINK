'use strict';

document.addEventListener('DOMContentLoaded', () => {
    if (!window.CampusAuth?.getCurrentUser()) return;
    const role = CampusAuth.getCurrentRole();
    const titles = { student: 'Student Assistant', recruiter: 'Recruiter Assistant', placement: 'Placement Assistant' };
    if (!titles[role]) return;
    const launcher = document.createElement('button');
    launcher.type = 'button'; launcher.className = 'assistant-launcher'; launcher.textContent = 'CampusLink Assistant';
    launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'campus-assistant-panel');
    const panel = document.createElement('section'); panel.id = 'campus-assistant-panel'; panel.className = 'assistant-panel hidden'; panel.setAttribute('aria-label', titles[role]);
    panel.innerHTML = '<header class="assistant-header"><div><strong></strong><p>Answers from your authorized CampusLink data</p></div><button type="button" class="assistant-close" aria-label="Close assistant">×</button></header><div class="assistant-messages" aria-live="polite"></div><form class="assistant-form"><label class="sr-only" for="assistant-question">Ask CampusLink Assistant</label><textarea id="assistant-question" rows="2" maxlength="1000" placeholder="Ask about your CampusLink dashboard…" required></textarea><button class="btn btn-primary" type="submit">Ask</button></form><p class="assistant-note">Scores and decisions stay with CampusLink’s deterministic systems. The assistant can explain, not change records.</p>';
    panel.querySelector('.assistant-header strong').textContent = titles[role];
    document.body.append(launcher, panel);
    const messages = panel.querySelector('.assistant-messages');
    const form = panel.querySelector('.assistant-form');
    const input = panel.querySelector('#assistant-question');
    function addMessage(kind, title, body) {
        const article = document.createElement('article'); article.className = `assistant-message assistant-${kind}`;
        const heading = document.createElement('strong'); heading.textContent = title;
        const content = document.createElement('p'); content.textContent = body;
        article.append(heading, content); messages.append(article); messages.scrollTop = messages.scrollHeight;
        return article;
    }
    function factsSummary(facts) {
        const lines = [];
        if (facts.role === 'student') {
            lines.push(`Readiness: ${facts.profile?.readiness?.score ?? 'Not assessed'}`);
            lines.push(`Applications: ${facts.applications?.length || 0}`);
            lines.push(`Offers: ${facts.offers?.length || 0}`);
            lines.push(`Eligible active jobs: ${(facts.matches || []).filter((item) => item.eligible).length}`);
        } else if (facts.role === 'recruiter') {
            lines.push(`Your jobs: ${facts.jobs?.length || 0}`);
            lines.push(`Your applications: ${facts.applications?.length || 0}`);
            lines.push(`Eligible applications: ${(facts.applications || []).filter((item) => item.eligible).length}`);
        } else {
            const p = facts.analytics?.placement || {};
            lines.push(`Students: ${p.totalStudents ?? 0}`);
            lines.push(`Placement rate: ${Number(p.placementRate || 0).toFixed(1)}%`);
            lines.push(`Applications: ${p.applications ?? 0}`);
            lines.push(`Scheduled drives: ${facts.drives?.filter((drive) => drive.status === 'Scheduled').length || 0}`);
            lines.push(`Offer pipeline groups: ${facts.offerPipeline?.length || 0}`);
        }
        return lines.join(' · ');
    }
    launcher.addEventListener('click', () => {
        const opening = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !opening); launcher.setAttribute('aria-expanded', String(opening));
        if (opening) input.focus();
    });
    panel.querySelector('.assistant-close').addEventListener('click', () => { panel.classList.add('hidden'); launcher.setAttribute('aria-expanded', 'false'); });
    addMessage('assistant', titles[role], 'Ask for an explanation of the facts available in your current role.');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const question = input.value.trim(); if (!question) return;
        addMessage('user', 'You', question); input.value = '';
        const pending = addMessage('assistant', 'CampusLink Assistant', 'Reviewing authorized CampusLink data…');
        const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
        try {
            const response = await CampusAPI.post('/assistant', { question });
            pending.querySelector('p').textContent = response.data.answer;
            const mode = document.createElement('small'); mode.className = 'assistant-label'; mode.textContent = response.data.mode === 'fallback' ? 'AI service unavailable · deterministic facts shown' : 'Explanation'; pending.append(mode);
            if (response.data.facts) {
                const facts = document.createElement('p'); facts.className = 'assistant-facts'; facts.textContent = `System facts: ${factsSummary(response.data.facts)}`; pending.append(facts);
            }
            if (response.data.suggestions?.length) {
                const suggestion = document.createElement('p'); suggestion.className = 'assistant-suggestion'; suggestion.textContent = `Suggestions: ${response.data.suggestions.join(' · ')}`; pending.append(suggestion);
            }
        } catch (error) { pending.querySelector('p').textContent = `Could not load an answer: ${error.message}`; }
        finally { submit.disabled = false; input.focus(); }
    });
});
