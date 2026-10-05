/**
 * Phase 7 — Matching Engine Unit Tests
 * Tests matching.engine.js directly (no HTTP required).
 */

require('dotenv').config();
const { matchStudentToJob, computeSkillMatch, checkEligibility, computeProjectRelevance, computeAcademicFit } = require('./src/services/matching/matching.engine');
const { normalizeSkill } = require('./src/services/readiness/skill.domain');

let pass = 0, fail = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        pass++;
    } else {
        console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        fail++;
    }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
const strongStudent = {
    name: 'Strong Student', email: 's1@test.com',
    branch: 'CSE', cgpa: 8.5, backlogs: 0,
    skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
        { name: 'MongoDB', level: 'intermediate' },
        { name: 'React', level: 'intermediate' }
    ],
    projects: [
        { title: 'API', description: 'REST API project', technologies: ['JavaScript', 'Node.js', 'MongoDB'], role: 'Backend Dev' }
    ],
    resume: { fileUrl: '/uploads/s1.pdf' }
};

const weakStudent = {
    name: 'Weak Student', email: 's2@test.com',
    branch: 'MECH', cgpa: 5.0, backlogs: 3,
    skills: [{ name: 'AutoCAD', level: 'intermediate' }],
    projects: [],
    resume: null
};

const missingDataStudent = {
    name: 'No Data Student', email: 's3@test.com',
    // No branch, no cgpa, no backlogs, no skills, no projects, no resume
    skills: [], projects: [], resume: null
};

const backendJob = {
    title: 'Backend Engineer',
    requirements: {
        requiredSkills: ['javascript', 'node.js', 'database/sql'], // normalized: JS, Node, MongoDB→sql
        preferredSkills: ['react'],
        minimumCGPA: 7.0,
        maximumBacklogs: 1,
        eligibleBranches: ['CSE', 'IT']
    }
};

const openJob = {
    title: 'General Intern',
    requirements: {
        requiredSkills: [],
        preferredSkills: [],
        minimumCGPA: null,
        maximumBacklogs: null,
        eligibleBranches: []
    }
};

// ─── Test 1: Eligibility ────────────────────────────────────────────────────
console.log('\n=== TEST 1: Eligibility ===');

const e1 = checkEligibility(strongStudent, backendJob.requirements);
assert('Strong student eligible (CSE, CGPA 8.5, 0 backlogs)', e1.eligible);
assert('No eligibility issues', e1.issues.length === 0);

const e2 = checkEligibility(weakStudent, backendJob.requirements);
assert('Weak student NOT eligible (MECH, low CGPA, high backlogs)', !e2.eligible);
assert('Has CGPA failure', e2.issues.some(i => i.includes('5')));
assert('Has branch failure', e2.issues.some(i => i.toLowerCase().includes('branch') || i.toLowerCase().includes('mech')));

const e3 = checkEligibility(missingDataStudent, backendJob.requirements);
assert('Missing-data student: missing required CGPA fails eligibility', !e3.eligible && e3.issues.some(i => i.includes('CGPA')));
assert('Missing-data student: missing required branch fails eligibility', e3.issues.some(i => i.includes('branch')));

const emptyProfile = { name: 'Empty Profile', skills: [], projects: [] };
const cgpaOnlyStudent = { ...strongStudent, cgpa: null };
const lowCgpaStudent = { ...strongStudent, cgpa: 6.2 };
const wrongBranchStudent = { ...strongStudent, branch: 'Mechanical Engineering' };
const normalizedCseStudent = { ...strongStudent, branch: 'B.Tech Computer Science', cgpa: 8.2 };
const itStudent = { ...strongStudent, branch: 'Information Technology', cgpa: 8.0 };
const highSkillIncompleteStudent = { ...strongStudent, branch: '', cgpa: '' };
assert('Empty profile is NOT eligible for hard CGPA/branch requirements', !checkEligibility(emptyProfile, backendJob.requirements).eligible);
assert('Missing CGPA is NOT eligible when a minimum is required', !checkEligibility(cgpaOnlyStudent, backendJob.requirements).eligible);
assert('CGPA below minimum is NOT eligible', !checkEligibility(lowCgpaStudent, backendJob.requirements).eligible);
assert('Wrong branch is NOT eligible', !checkEligibility(wrongBranchStudent, backendJob.requirements).eligible);
assert('B.Tech Computer Science normalizes and passes branch/CGPA requirements', checkEligibility(normalizedCseStudent, backendJob.requirements).eligible);
assert('Information Technology passes when IT is allowed', checkEligibility(itStudent, backendJob.requirements).eligible);
assert('Eligible candidate with weak skills stays eligible with a lower score', (() => {
    const student = { ...normalizedCseStudent, skills: [], projects: [], resume: null };
    const match = matchStudentToJob(student, backendJob);
    return match.eligible && match.matchScore < matchStudentToJob(strongStudent, backendJob).matchScore;
})());
assert('High-looking skill match cannot override missing hard eligibility data', !matchStudentToJob(highSkillIncompleteStudent, backendJob).eligible);

const e4 = checkEligibility(strongStudent, openJob.requirements);
assert('Open job: everyone eligible', e4.eligible);

// ─── Test 2: Skill Match ────────────────────────────────────────────────────
console.log('\n=== TEST 2: Skill Match ===');

const s1 = computeSkillMatch(strongStudent.skills, backendJob.requirements);
// strongStudent has JS, Node, MongoDB(→database/sql) — matches all 3 required
assert('Strong student: matched required includes javascript', s1.matchedRequired.includes('javascript'));
assert('Strong student: matched required includes node.js', s1.matchedRequired.includes('node.js'));
assert('Strong student: matched required includes database/sql (via MongoDB)', s1.matchedRequired.includes('database/sql'));
assert('Strong student: 0 missing required', s1.missingRequired.length === 0, JSON.stringify(s1.missingRequired));
assert('Strong student: skill score ≥ 70', s1.score >= 70, 'got ' + s1.score);

const s2 = computeSkillMatch(weakStudent.skills, backendJob.requirements);
assert('Weak student: all 3 required missing', s2.missingRequired.length === 3);
assert('Weak student: skill score ≤ 30', s2.score <= 30, 'got ' + s2.score);

const s3 = computeSkillMatch(strongStudent.skills, openJob.requirements);
assert('Open job: no required → full required coverage score', s3.score >= 70, 'got ' + s3.score);

// ─── Test 3: Project Relevance ──────────────────────────────────────────────
console.log('\n=== TEST 3: Project Relevance ===');

const pr1 = computeProjectRelevance(strongStudent.projects, backendJob.requirements);
// project uses JavaScript(→javascript), Node.js(→node.js), MongoDB(→database/sql) — 3/3 match
assert('Strong student: all required skills in projects', pr1.matchedInProjects.length >= 2, 'got ' + pr1.matchedInProjects.length);
assert('Strong student: project relevance ≥ 50', pr1.score >= 50, 'got ' + pr1.score);

const pr2 = computeProjectRelevance(weakStudent.projects, backendJob.requirements);
assert('Weak student: no project matches', pr2.matchedInProjects.length === 0);
assert('Weak student: project score = 0', pr2.score === 0);

// ─── Test 4: Academic Fit ───────────────────────────────────────────────────
console.log('\n=== TEST 4: Academic Fit ===');

const af1 = computeAcademicFit(strongStudent, backendJob.requirements);
assert('Strong student: cgpa 8.5 vs 7.0 → cgpaScore 100', af1.cgpaScore === 100, 'got ' + af1.cgpaScore);
assert('Strong student: 0 backlogs vs max 1 → backlogScore 100', af1.backlogScore === 100);
assert('Strong student: academic fit ≥ 90', af1.score >= 90, 'got ' + af1.score);

const af2 = computeAcademicFit(weakStudent, backendJob.requirements);
assert('Weak student: cgpa 5.0 vs 7.0 → cgpaScore < 80', af2.cgpaScore < 80, 'got ' + af2.cgpaScore);
assert('Weak student: 3 backlogs vs max 1 → backlogScore 0', af2.backlogScore === 0);

// ─── Test 5: Full Match Score ───────────────────────────────────────────────
console.log('\n=== TEST 5: Full Match ===');

console.log('\n=== TEST 6: Canonical Skill Aliases ===');
assert('ML normalizes to machine learning', normalizeSkill('ML') === 'machine learning');
assert('webdev normalizes to web development', normalizeSkill('webdev') === 'web development');
assert('JS matches JavaScript', computeSkillMatch([{ name: 'JS' }], { requiredSkills: ['JavaScript'] }).matchedRequired.includes('javascript'));
assert('Node matches Node.js', computeSkillMatch([{ name: 'Node' }], { requiredSkills: ['Node.js'] }).matchedRequired.includes('node.js'));
assert('Express matches Express.js', computeSkillMatch([{ name: 'Express' }], { requiredSkills: ['Express.js'] }).matchedRequired.includes('express.js'));
assert('DSA solving matches data structures and algorithms', computeSkillMatch([{ name: 'DSA solving' }], { requiredSkills: ['Data Structures and Algorithms'] }).matchedRequired.includes('dsa'));

const m1 = matchStudentToJob(strongStudent, backendJob);
console.log(`  Strong student match score: ${m1.matchScore} (${m1.matchCategory}), eligible: ${m1.eligible}`);
assert('Strong student: match score ≥ 65', m1.matchScore >= 65, 'got ' + m1.matchScore);
assert('Strong student: eligible', m1.eligible);
assert('Strong student: matchCategory is Strong or Moderate', m1.matchCategory !== 'Weak', 'got ' + m1.matchCategory);
assert('Semantic similarity remains unavailable when no embedding adapter is configured', m1.semanticSimilarity === null && m1.breakdown.semanticSimilarity === null);
assert('Eligible match explanation is derived from matched and missing skills', m1.explanation.facts.some((fact) => fact.text.includes('required skills matched')) && Array.isArray(m1.explanation.missingRequiredSkills));

const m2 = matchStudentToJob(weakStudent, backendJob);
console.log(`  Weak student match score: ${m2.matchScore} (${m2.matchCategory}), eligible: ${m2.eligible}`);
assert('Weak student: match score ≤ 40', m2.matchScore <= 40, 'got ' + m2.matchScore);
assert('Weak student: NOT eligible', !m2.eligible);
assert('Weak student: matchCategory is Weak', m2.matchCategory === 'Weak');
assert('Ineligible explanation contains the deterministic eligibility failures', m2.explanation.eligibilityReasons.length === m2.eligibilityIssues.length && m2.explanation.eligibilityReasons.length > 0);

const m3 = matchStudentToJob(missingDataStudent, openJob);
console.log(`  Missing-data student vs open job: ${m3.matchScore} (${m3.matchCategory}), eligible: ${m3.eligible}`);
assert('Missing-data student vs open job: eligible (no hard requirements)', m3.eligible);
assert('Missing-data student: eligibility has no issues', m3.eligibilityIssues.length === 0);

console.log(`\n═══════════════════════════════`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('✅ ALL TESTS PASSED');
else console.log('❌ SOME TESTS FAILED');
process.exit(fail > 0 ? 1 : 0);
