'use strict';

function titleKey(project) {
    return String(project?.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeResumeProjects(projects = []) {
    const seen = new Set();
    return projects.filter((project) => {
        const key = titleKey(project);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map((project) => ({ ...project, source: 'resume' }));
}

function mergeResumeProjects(existingProjects = [], parsedProjects = []) {
    const manual = existingProjects.filter((project) => project.source !== 'resume');
    const manualTitles = new Set(manual.map(titleKey).filter(Boolean));
    const fromResume = dedupeResumeProjects(parsedProjects).filter((project) => !manualTitles.has(titleKey(project)));
    return [...manual, ...fromResume];
}

module.exports = { dedupeResumeProjects, mergeResumeProjects };
