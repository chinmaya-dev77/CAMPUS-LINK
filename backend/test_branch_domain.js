'use strict';

const assert = require('node:assert/strict');
const { normalizeBranch } = require('./src/services/branch.domain');
const { checkEligibility } = require('./src/services/matching/matching.engine');

const cases = [
    ['CSE student + Computer Science job', 'CSE', ['Computer Science'], true],
    ['Computer Science student + CSE job', 'Computer Science', ['CSE'], true],
    ['IT student + Information Technology job', 'IT', ['Information Technology'], true],
    ['CSE student + Information Technology job', 'CSE', ['Information Technology'], false],
    ['Mechanical student + Information Technology job', 'Mechanical', ['Information Technology'], false]
];
for (const [label, branch, eligibleBranches, expected] of cases) {
    const actual = checkEligibility({ branch }, { eligibleBranches }).eligible;
    assert.equal(actual, expected, label);
    console.log(`PASS ${label}`);
}
for (const alias of ['CS', 'Computer Science Engineering', 'Computer Science & Engineering', 'B.Tech CSE', 'B.Tech Computer Science']) {
    assert.equal(normalizeBranch(alias), 'computer science', alias);
}
for (const alias of ['Information Technology Engineering', 'B.Tech IT']) {
    assert.equal(normalizeBranch(alias), 'information technology', alias);
}
console.log(`Branch canonicalization passed: ${cases.length} eligibility cases and 7 alias assertions.`);
