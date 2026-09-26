/**
 * Validates and sanitizes AI-extracted JD structure.
 */

const SHORT_STRING_LENGTH = 100;
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 2000;

function safeString(val, maxLength = MAX_STRING_LENGTH) {
    if (typeof val !== 'string') return '';
    return val.trim().substring(0, maxLength);
}

function safeArray(val) {
    if (!Array.isArray(val)) return [];
    return val.slice(0, MAX_ARRAY_LENGTH);
}

function validateJdOutput(rawJsonString) {
    let rawObj;
    try {
        let cleaned = rawJsonString.trim();
        // Remove markdown fencing if present
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        rawObj = JSON.parse(cleaned);
    } catch (err) {
        const error = new Error('Invalid JSON structure returned from AI');
        error.code = 'JSON_PARSE_ERROR';
        error.status = 500;
        throw error;
    }

    const result = {
        role: safeString(rawObj.role, SHORT_STRING_LENGTH),
        requiredSkills: safeArray(rawObj.requiredSkills).map(s => safeString(s, SHORT_STRING_LENGTH)).filter(Boolean),
        preferredSkills: safeArray(rawObj.preferredSkills).map(s => safeString(s, SHORT_STRING_LENGTH)).filter(Boolean),
        experience: safeString(rawObj.experience, SHORT_STRING_LENGTH),
        education: safeString(rawObj.education, SHORT_STRING_LENGTH),
        responsibilities: safeArray(rawObj.responsibilities).map(s => safeString(s, MAX_STRING_LENGTH)).filter(Boolean)
    };

    return result;
}

module.exports = {
    validateJdOutput
};
