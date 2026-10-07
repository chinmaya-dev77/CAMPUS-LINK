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
    function decodeCodepoint(code, radix, original) {
        const point = parseInt(code, radix);
        return Number.isInteger(point) && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
            ? String.fromCodePoint(point)
            : original;
    }
    function decodeAssistantEntities(value) {
        return String(value ?? '')
            .replace(/&#x([\da-f]{1,6});/gi, (match, code) => decodeCodepoint(code, 16, match))
            .replace(/&#(\d{1,7});/g, (match, code) => decodeCodepoint(code, 10, match))
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'");
    }
    function appendInline(parent, value) {
        const text = decodeAssistantEntities(value);
        const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
        let cursor = 0;
        for (const match of text.matchAll(tokenPattern)) {
            if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
            const token = match[0];
            const content = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
            const element = token.startsWith('**') ? document.createElement('strong') : token.startsWith('`') ? document.createElement('code') : document.createElement('em');
            element.textContent = content;
            parent.append(element);
            cursor = match.index + token.length;
        }
        if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
    }
    function renderAssistantAnswer(target, value) {
        target.replaceChildren();
        const lines = decodeAssistantEntities(value).replace(/\r\n?/g, '\n').split('\n');
        let paragraph = [];
        let list = null;
        let listType = '';
        const flushParagraph = () => {
            if (!paragraph.length) return;
            const block = document.createElement('p');
            appendInline(block, paragraph.join(' '));
            target.append(block);
            paragraph = [];
        };
        const closeList = () => { list = null; listType = ''; };
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) { flushParagraph(); closeList(); return; }
            const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
            if (heading) {
                flushParagraph(); closeList();
                const block = document.createElement('h4');
                appendInline(block, heading[1]);
                target.append(block);
                return;
            }
            const item = trimmed.match(/^(?:(\d+)[.)]|[-*•])\s+(.+)$/);
            if (item) {
                flushParagraph();
                const nextType = item[1] ? 'ol' : 'ul';
                if (!list || listType !== nextType) {
                    closeList();
                    list = document.createElement(nextType);
                    listType = nextType;
                    target.append(list);
                }
                const li = document.createElement('li');
                appendInline(li, item[2]);
                list.append(li);
                return;
            }
            closeList();
            paragraph.push(trimmed);
        });
        flushParagraph();
    }
    function addMessage(kind, title, body) {
        const article = document.createElement('article'); article.className = `assistant-message assistant-${kind}`;
        const heading = document.createElement('strong'); heading.textContent = title;
        const content = document.createElement('div'); content.className = 'assistant-answer';
        renderAssistantAnswer(content, body);
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
        return lines;
    }
    function appendFacts(article, facts) {
        const section = document.createElement('section'); section.className = 'assistant-facts';
        const heading = document.createElement('strong'); heading.textContent = 'Current system facts'; section.append(heading);
        const grid = document.createElement('div'); grid.className = 'assistant-facts-grid';
        factsSummary(facts).forEach((fact) => {
            const [label, ...value] = fact.split(':');
            const item = document.createElement('div'); item.className = 'assistant-fact-item';
            const name = document.createElement('span'); name.textContent = label;
            const result = document.createElement('strong'); result.textContent = value.join(':').trim();
            item.append(name, result); grid.append(item);
        });
        section.append(grid); article.append(section);
    }
    function appendSuggestions(article, suggestions) {
        const section = document.createElement('section'); section.className = 'assistant-suggestion';
        const heading = document.createElement('strong'); heading.textContent = suggestions.length > 1 ? 'Suggested next steps' : 'Suggested next step';
        const list = document.createElement('ul');
        suggestions.forEach((suggestion) => { const item = document.createElement('li'); appendInline(item, suggestion); list.append(item); });
        section.append(heading, list); article.append(section);
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
            renderAssistantAnswer(pending.querySelector('.assistant-answer'), response.data.answer);
            const mode = document.createElement('small'); mode.className = `assistant-label${response.data.mode === 'fallback' ? ' is-fallback' : ''}`; mode.textContent = response.data.mode === 'fallback' ? 'AI explanation unavailable · current system facts shown' : 'AI explanation'; pending.append(mode);
            if (response.data.facts) appendFacts(pending, response.data.facts);
            if (response.data.suggestions?.length) appendSuggestions(pending, response.data.suggestions);
        } catch (error) { renderAssistantAnswer(pending.querySelector('.assistant-answer'), `Could not load an answer: ${error.message}`); }
        finally { submit.disabled = false; input.focus(); }
    });
});
