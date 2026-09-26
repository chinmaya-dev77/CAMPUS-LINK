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

const ALLOWED_TOP_LEVEL = ['name', 'phone', 'skills', 'projects', 'certifications', 'experience', 'education', 'cgpa'];
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
    const n = parseInt(val);
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

function validateSkill(item) {
    if (!isPlainObject(item)) return null;
    const name = safeString(item.name, SHORT_STRING_LENGTH);
    if (!name) return null; // skills without a name are dropped
    return { name, level: normalizeSkillLevel(item.level) };
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

    // Step 5: validate and normalize each allowed field
    const result = {};

    result.name  = safeString(safe.name, SHORT_STRING_LENGTH);
    result.phone = safeString(safe.phone, 30);
    if (typeof safe.cgpa === 'number' && safe.cgpa >= 0 && safe.cgpa <= 10) {
        result.cgpa = safe.cgpa;
    }

    result.skills = safeArray(safe.skills)
        .map(validateSkill)
        .filter(Boolean);

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

module.exports = { validateResumeOutput };
