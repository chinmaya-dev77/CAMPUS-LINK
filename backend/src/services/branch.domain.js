'use strict';

const ALIASES = new Map([
    ['cse', 'computer science'], ['cs', 'computer science'],
    ['computer science', 'computer science'], ['computer science engineering', 'computer science'],
    ['computer science & engineering', 'computer science'], ['computer science and engineering', 'computer science'],
    ['computer science & engineering / cse', 'computer science'], ['computer science and engineering / cse', 'computer science'],
    ['computer engineering', 'computer science'],
    ['b tech cse', 'computer science'], ['btech cse', 'computer science'],
    ['b tech in cse', 'computer science'], ['btech in cse', 'computer science'],
    ['b tech computer science', 'computer science'], ['btech computer science', 'computer science'],
    ['b tech computer engineering', 'computer science'], ['btech computer engineering', 'computer science'],
    ['it', 'information technology'], ['information technology', 'information technology'],
    ['information technology engineering', 'information technology'], ['b tech it', 'information technology'],
    ['btech it', 'information technology']
]);

function branchKey(value) {
    return String(value || '').trim().toLowerCase()
        .replace(/\bb\s*\.\s*tech\b/g, 'b tech').replace(/\bbtech\b/g, 'btech')
        .replace(/[.]/g, '').replace(/\s+/g, ' ');
}
function normalizeBranch(value) {
    const key = branchKey(value);
    return key ? (ALIASES.get(key) || key) : '';
}
function normalizeBranchList(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(normalizeBranch).filter(Boolean))];
}
module.exports = { normalizeBranch, normalizeBranchList };
