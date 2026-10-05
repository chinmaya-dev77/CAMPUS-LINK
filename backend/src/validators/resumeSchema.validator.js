/**
 * Resume Schema Validator for CampusLink.
 *
 * Validates LLM-produced JSON against the exact Student.js schema
 * before any data is written to MongoDB.
 *
 * Rules:
 * - Root must be a plain object.
 * - Only allowed top-level keys are accepted (all others are stripped).
 * - Arrays must be arrays.
 * - Array items must match the expected nested structure.
 * - Skill levels must be normalized to allowed enums.
 * - String fields are capped at reasonable lengths.
 * - Array items are capped at 50 entries max (hallucination guard).
 * - Date strings are validated for format; invalid ones become null/empty.
 * - Invalid data throws — never silently corrupts.
 */

const ALLOWED_TOP_LEVEL = ['name', 'phone', 'branch', 'graduationYear', 'skills', 'projects', 'certifications', 'experience', 'education', 'cgpa'];
const ALLOWED_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 2000;
const SHORT_STRING_LENGTH = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function safeString(val, maxLen = MAX_STRING_LENGTH) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen);
}

function safeArray(val) {
    if (!Array.isArray(val)) return [];
    return val.slice(0, MAX_ARRAY_LENGTH);
}

function safeYear(val) {
    const n = typeof val === 'number' ? val : /^\d{4}$/.test(String(val || '').trim()) ? Number(val) : NaN;
    if (isNaN(n) || n < 1900 || n > 2100) return null;
    return n;
}

function safeDateString(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Accept YYYY-MM-DD, YYYY-MM, or YYYY; reject anything that doesn't parse
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return trimmed;
}

function normalizeSkillLevel(level) {
    const normalized = (level || '').toLowerCase().trim();
    return ALLOWED_SKILL_LEVELS.includes(normalized) ? normalized : 'intermediate';
}

// ─── Nested item validators ───────────────────────────────────────────────────

function splitSkillList(value) {
    return String(value || '').split(/[,;|\n•·]+/).map((part) => part.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
}

function collectSkillValues(value, output, depth = 0) {
    if (depth > 3 || output.length >= MAX_ARRAY_LENGTH) return;
    if (typeof value === 'string') {
        splitSkillList(value).forEach((name) => { if (output.length < MAX_ARRAY_LENGTH) output.push({ name, level: 'intermediate' }); });
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, MAX_ARRAY_LENGTH).forEach((item) => collectSkillValues(item, output, depth + 1));
        return;
    }
    if (!isPlainObject(value)) return;
    const name = safeString(value.name || value.skill || value.skillName || value.technology || value.tool, SHORT_STRING_LENGTH);
    if (name) {
        output.push({ name, level: normalizeSkillLevel(value.level || value.proficiency) });
        return;
    }
    // Some model responses group technical skills by category. Ignore clearly
    // non-technical categories instead of persisting soft skills as technologies.
    for (const [category, items] of Object.entries(value)) {
        if (/soft|interpersonal|communication|leadership|strength/i.test(category)) continue;
        collectSkillValues(items, output, depth + 1);
    }
}

function extractTechnicalSkillsFromResumeText(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const sectionHeading = /^\s*(?:technical\s+skills?|skills?|programming\s+languages?|technologies|tools\s*(?:and|&)\s*technologies|technical\s+stack|tech\s+stack)\s*(?:[:\-–—|]\s*)?(.*)$/i;
    const nextSection = /^\s*(?:education|academic(?:s| background)?|projects?|experience|work experience|internships?|certifications?|achievements?|publications?|interests?|references?)\s*[:\-–—|]?\s*/i;
    const extracted = [];
    let collecting = false;
    for (const line of lines) {
        const heading = line.match(sectionHeading);
        if (heading) {
            collecting = true;
            if (heading[1]) extracted.push(...splitSkillList(heading[1]));
            continue;
        }
        if (!collecting) continue;
        if (nextSection.test(line)) break;
        extracted.push(...splitSkillList(line));
    }
    const seen = new Set();
    return extracted.map((name) => safeString(name, SHORT_STRING_LENGTH))
        .filter((name) => name && !/^(technical\s+skills?|skills?|programming\s+languages?|technologies|tools?)\s*:?$/i.test(name))
        .filter((name) => { const key = name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
        .slice(0, MAX_ARRAY_LENGTH)
        .map((name) => ({ name, level: 'intermediate' }));
}

function validateProject(item) {
    if (!isPlainObject(item)) return null;
    return {
        title:        safeString(item.title, SHORT_STRING_LENGTH),
        description:  safeString(item.description),
        technologies: Array.isArray(item.technologies)
            ? item.technologies.filter(t => typeof t === 'string').map(t => safeString(t, 100)).slice(0, 30)
            : [],
        role: safeString(item.role, 200),
        githubUrl: safeString(item.githubUrl, 500),
        demoUrl: safeString(item.demoUrl, 500)
    };
}

function validateCertification(item) {
    if (!isPlainObject(item)) return null;
    return {
        name:      safeString(item.name, SHORT_STRING_LENGTH),
        issuer:    safeString(item.issuer, SHORT_STRING_LENGTH),
        issueDate: safeDateString(item.issueDate)
    };
}

function validateExperience(item) {
    if (!isPlainObject(item)) return null;
    return {
        company:     safeString(item.company, SHORT_STRING_LENGTH),
        role:        safeString(item.role, SHORT_STRING_LENGTH),
        description: safeString(item.description),
        startDate:   safeDateString(item.startDate),
        endDate:     safeDateString(item.endDate)
    };
}

function validateEducation(item) {
    if (!isPlainObject(item)) return null;
    return {
        institution: safeString(item.institution, SHORT_STRING_LENGTH),
        degree:      safeString(item.degree, SHORT_STRING_LENGTH),
        field:       safeString(item.field, SHORT_STRING_LENGTH),
        startYear:   safeYear(item.startYear),
        endYear:     safeYear(item.endYear)
    };
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Strip markdown code fences from LLM output (common hallucination).
 * e.g. ```json\n{...}\n``` → {...}
 */
function stripMarkdown(raw) {
    let s = raw.trim();
    // Remove ```json ... ``` or ``` ... ```
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    return s.trim();
}

/**
 * Parse and validate a raw LLM JSON string against the resume extraction schema.
 *
 * @param {string} rawLlmOutput - raw string from the LLM
 * @returns {Object} - validated and normalized payload safe to merge into Student
 * @throws {Error} with status 422 if the output cannot be validated
 */
function validateResumeOutput(rawLlmOutput) {
    // Step 1: strip markdown fences
    const clean = stripMarkdown(rawLlmOutput);

    // Step 2: parse JSON
    let parsed;
    try {
        parsed = JSON.parse(clean);
    } catch (e) {
        const err = new Error('The AI returned a response that could not be parsed as JSON. Please retry.');
        err.status = 422;
        err.code   = 'INVALID_AI_JSON';
        throw err;
    }

    // Step 3: root must be a plain object
    if (!isPlainObject(parsed)) {
        const err = new Error('The AI returned an unexpected response structure. Please retry.');
        err.status = 422;
        err.code   = 'INVALID_AI_SCHEMA';
        throw err;
    }

    // Step 4: strip unexpected top-level keys — never allow readiness, cgpa, userId, etc.
    const safe = {};
    ALLOWED_TOP_LEVEL.forEach(key => {
        if (key in parsed) safe[key] = parsed[key];
    });
    // Accept common structured-output aliases but normalize them into the
    // existing Student.skills schema. Other unexpected fields remain stripped.
    const skillSources = [safe.skills, parsed.technicalSkills, parsed.technical_skills, parsed.programmingLanguages, parsed.programming_languages, parsed.technical];

    // Step 5: validate and normalize each allowed field
    const result = {};

    result.name  = safeString(safe.name, SHORT_STRING_LENGTH);
    result.phone = safeString(safe.phone, 30);
    const branch = safeString(safe.branch, SHORT_STRING_LENGTH);
    if (branch) result.branch = branch;
    const graduationYear = safeYear(safe.graduationYear);
    if (graduationYear != null) result.graduationYear = graduationYear;
    if (typeof safe.cgpa === 'number' && safe.cgpa >= 0 && safe.cgpa <= 10) {
        result.cgpa = safe.cgpa;
    }

    const normalizedSkills = [];
    skillSources.forEach((source) => collectSkillValues(source, normalizedSkills));
    const seenSkills = new Set();
    result.skills = normalizedSkills.filter((skill) => {
        const key = skill.name.toLowerCase();
        if (seenSkills.has(key)) return false;
        seenSkills.add(key);
        return true;
    }).slice(0, MAX_ARRAY_LENGTH);

    result.projects = safeArray(safe.projects)
        .map(validateProject)
        .filter(Boolean);

    result.certifications = safeArray(safe.certifications)
        .map(validateCertification)
        .filter(Boolean);

    result.experience = safeArray(safe.experience)
        .map(validateExperience)
        .filter(Boolean);

    result.education = safeArray(safe.education)
        .map(validateEducation)
        .filter(Boolean);

    return result;
}

// Only accept a year when the resume explicitly ties it to graduation or to
// the end of a degree's stated study range. This is a conservative fallback
// for models that omit a semantically clear year from otherwise usable text.
function extractGraduationYear(text) {
    const value = String(text || '');
    const contextual = [
        /\bexpected\s+(?:year\s+of\s+)?graduation\s*[:\-]?\s*(20\d{2})\b/i,
        /\bexpected\s+(20\d{2})\b/i,
        /\bexpected\s+to\s+graduate\s+(?:in\s+)?(20\d{2})\b/i,
        /\bgraduat(?:e|ing|ion)\s*(?:in|by|:|-)\s*(?:[A-Za-z]+\s+)?(20\d{2})\b/i,
        /\bgraduating\s+(?:[A-Za-z]+\s+)?(20\d{2})\b/i,
        /\bfinal[- ]year\b[^\n]{0,60}\bgraduat(?:e|ing)\s+(?:in\s+)?(20\d{2})\b/i,
        /\b(?:b\.?\s?tech|bachelor|b\.?e\.?|degree)[^\n]{0,100}\b(20\d{2})\s*[–—-]\s*(20\d{2})\b/i
    ];
    for (const pattern of contextual) {
        const match = value.match(pattern);
        const year = Number(match?.[pattern === contextual[6] ? 2 : 1]);
        if (year >= 1900 && year <= 2100) return year;
    }
    return null;
}

module.exports = { validateResumeOutput, extractGraduationYear, extractTechnicalSkillsFromResumeText };
