'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateResumeOutput,
    extractGraduationYear,
    extractTechnicalSkillsFromResumeText
} = require('./src/validators/resumeSchema.validator');
const { normalizeBranch } = require('./src/services/branch.domain');
const { buildResumeProfileUpdate } = require('./src/services/student.service');
const { calculateAndPersistReadiness, ensureReadiness } = require('./src/services/readiness/readiness.service');
const { analyzeResumeBuffer } = require('./src/controllers/student.controller');
const { withBulkResumeRetry } = require('./src/services/ai.service');

const resumeData = {
    name: 'Test Student', phone: '', branch: 'Computer Science & Engineering / CSE', graduationYear: 2027,
    cgpa: 8.4,
    skills: ['Java', 'Python', 'SQL', 'React'].map((name) => ({ name, level: 'intermediate' })),
    projects: [{ title: 'Placement Portal', description: 'A student placement web app', technologies: ['React', 'Node.js'], role: 'Developer', githubUrl: 'https://github.com/test/app', demoUrl: '' }],
    certifications: [{ name: 'Cloud Basics', issuer: 'Example Academy', issueDate: '' }],
    experience: [{ company: 'Example Co', role: 'Intern', description: 'Built internal tools', startDate: '', endDate: '' }],
    education: [{ institution: 'Example University', degree: 'B.Tech', field: 'Computer Science & Engineering', startYear: 2023, endYear: 2027 }]
};
const llmJson = JSON.stringify(resumeData);
const buffer = Buffer.from('fixture bytes; extraction is dependency-injected');

async function analyzeFixture({ contentType = 'application/pdf', extractText = async () => 'Resume contains enough searchable text. Expected Graduation: 2027. Skills Java Python SQL React.', renderPdfPages = async () => [Buffer.from('rendered page')], transcribe = async () => '', parse = async () => llmJson } = {}) {
    let applied;
    let refreshCalled = false;
    const result = await analyzeResumeBuffer('student-id', buffer, { contentType, originalFileName: 'resume.pdf' }, {
        dependencies: {
            extractText,
            renderPdfPages,
            extractResumeTextFromImages: transcribe,
            parseResumeText: parse,
            studentService: {
                applyResumeData: async (_id, data, meta) => { applied = { data, meta }; return { userId: _id, skills: data.skills, projects: data.projects }; },
                refreshApplicationEligibility: async () => { refreshCalled = true; }
            },
            Student: { findOneAndUpdate: async () => null }
        }
    });
    return { result, applied, refreshCalled };
}

test('searchable PDF text goes through structured extraction and maps supported schema fields', async () => {
    const run = await analyzeFixture();
    assert.equal(run.result.success, true);
    assert.equal(run.applied.data.branch, 'computer science');
    assert.equal(run.applied.data.graduationYear, 2027);
    assert.deepEqual(run.applied.data.skills.map((skill) => skill.name), ['Java', 'Python', 'SQL', 'React']);
    assert.equal(run.applied.data.education[0].degree, 'B.Tech');
    assert.equal(run.applied.data.projects[0].githubUrl, 'https://github.com/test/app');
    assert.equal(run.applied.meta.analysisStatus, 'COMPLETED');
    assert.equal(run.refreshCalled, true);
});

test('scanned PDF uses rendered pages and mocked vision before structured extraction', async () => {
    let rendered = 0;
    let visionImages = 0;
    const run = await analyzeFixture({
        extractText: async () => { const error = new Error('empty'); error.code = 'EMPTY_PDF'; throw error; },
        renderPdfPages: async () => { rendered++; return [Buffer.from('page')]; },
        transcribe: async (images) => { visionImages += images.length; return 'Expected Graduation: 2027; Computer Science & Engineering; Java Python SQL React'; }
    });
    assert.equal(run.result.success, true);
    assert.equal(rendered, 1);
    assert.equal(visionImages, 1);
    assert.equal(run.applied.data.graduationYear, 2027);
});

test('image resume uses mocked vision directly and persists structured fields', async () => {
    let textCalls = 0;
    let visionCalls = 0;
    const run = await analyzeFixture({
        contentType: 'image/png',
        extractText: async () => { textCalls++; throw new Error('PDF path must not run'); },
        transcribe: async (images) => { visionCalls++; assert.equal(images[0].contentType, 'image/png'); return 'B.Tech CSE; Expected to graduate in 2027; Skills: Java, Python, SQL, React'; }
    });
    assert.equal(run.result.success, true);
    assert.equal(textCalls, 0);
    assert.equal(visionCalls, 1);
    assert.equal(run.applied.data.skills.length, 4);
});

test('unusable vision output is not reported as a successful extraction', async () => {
    const run = await analyzeFixture({ contentType: 'image/jpeg', transcribe: async () => '   ' });
    assert.equal(run.result.success, false);
    assert.equal(run.result.error.code, 'RESUME_TEXT_UNAVAILABLE');
});

test('semantic graduation examples map only explicit graduation or degree-range years', () => {
    for (const phrase of [
        'Expected Graduation: 2027', 'Expected to graduate in 2027', 'Graduating May 2027',
        'B.Tech CSE, 2023–2027', 'Bachelor of Technology in Computer Science, expected 2027',
        'Final year student, graduating in 2027'
    ]) assert.equal(extractGraduationYear(phrase), 2027, phrase);
    assert.equal(extractGraduationYear('Built a project in 2027'), null);
    assert.equal(normalizeBranch('Computer Science & Engineering / CSE'), 'computer science');
    assert.equal(normalizeBranch('B.Tech in CSE'), 'computer science');
    assert.equal(normalizeBranch('Computer Engineering'), 'computer science');
});

test('validator accepts structured skills and preserves absent fields as absent', () => {
    const parsed = validateResumeOutput(JSON.stringify({ skills: [{ name: 'Java' }], education: [], randomField: 'ignore' }));
    assert.equal(parsed.skills[0].name, 'Java');
    assert.equal(Object.hasOwn(parsed, 'graduationYear'), false);
    assert.equal(Object.hasOwn(parsed, 'branch'), false);
    assert.equal(Object.hasOwn(parsed, 'randomField'), false);
});

test('validator normalizes common model skill shapes and grouped technical skills', () => {
    const parsed = validateResumeOutput(JSON.stringify({
        skills: ['Java, Python', { skill: 'SQL' }],
        technicalSkills: { Languages: ['TypeScript'], Frameworks: 'React; Express.js', 'Soft Skills': ['Communication'] }
    }));
    assert.deepEqual(parsed.skills.map(({ name }) => name), ['Java', 'Python', 'SQL', 'TypeScript', 'React', 'Express.js']);
});

test('text fallback extracts skills only from an explicitly labeled skills section', () => {
    const skills = extractTechnicalSkillsFromResumeText('Technical Skills\nPython, Excel, Statistics\nEducation\nB.Tech');
    assert.deepEqual(skills.map(({ name }) => name), ['Python', 'Excel', 'Statistics']);
    assert.deepEqual(extractTechnicalSkillsFromResumeText('Built a project using Python and SQL.'), []);
});

test('analysis recovers listed skills when model output omits them', async () => {
    const run = await analyzeFixture({
        extractText: async () => 'Resume text.\nTechnical Skills: Python, Excel, Statistics, Pandas\nEducation\nB.Tech',
        parse: async () => JSON.stringify({ name: 'Test Student', projects: [], education: [] })
    });
    assert.equal(run.result.success, true);
    assert.deepEqual(run.applied.data.skills.map(({ name }) => name), ['Python', 'Excel', 'Statistics', 'Pandas']);
});

test('resume profile merge retains valid existing values and does not fabricate missing values', () => {
    const existing = {
        name: 'Existing Name', branch: 'information technology', graduationYear: 2026, cgpa: 8.1,
        skills: [{ name: 'C', level: 'intermediate' }], projects: [{ title: 'Manual Project', source: 'manual' }],
        certifications: [{ name: 'Existing Certificate' }], experience: [], education: [{ institution: 'Existing College', degree: 'B.Tech' }]
    };
    const update = buildResumeProfileUpdate(existing, { ...resumeData, name: 'Other Name', branch: 'CSE', graduationYear: 2027, cgpa: 9.5, skills: [{ name: 'Java' }] });
    assert.equal(update.branch, undefined);
    assert.equal(update.graduationYear, undefined);
    assert.equal(update.cgpa, undefined);
    assert.equal(update.name, undefined);
    assert.deepEqual(update.skills.map((skill) => skill.name), ['C', 'Java']);
    assert.equal(update.projects.some((project) => project.title === 'Manual Project'), true);
    const missing = buildResumeProfileUpdate({ skills: [], projects: [], certifications: [], experience: [], education: [] }, { skills: [], projects: [], certifications: [], experience: [], education: [] });
    assert.equal(Object.hasOwn(missing, 'branch'), false);
    assert.equal(Object.hasOwn(missing, 'graduationYear'), false);
    assert.equal(Object.hasOwn(missing, 'skills'), false);
});

test('readiness is persisted and retrievable through the same existing engine', async () => {
    const student = {
        skills: [{ name: 'Java' }], projects: [{ technologies: ['Java'], description: 'Build', role: 'Developer' }], cgpa: 8.4, backlogs: 0,
        readiness: null, save: async function () { this.saved = true; }
    };
    const calculated = await calculateAndPersistReadiness(student);
    const reloaded = { ...student, readiness: { ...student.readiness }, saved: undefined };
    const retrieved = await ensureReadiness(reloaded);
    assert.equal(student.saved, true);
    assert.equal(retrieved.score, calculated.score);
    assert.equal(retrieved.category, calculated.category);
    assert.ok(reloaded.readiness.calculatedAt);
});

test('readiness cache refreshes and persists when any scored profile inputs change', async () => {
    let saves = 0;
    const student = {
        userId: 'readiness-test-student', skills: [], projects: [], cgpa: 6, backlogs: 2,
        readiness: null, save: async function () { saves++; }
    };
    const initial = await ensureReadiness(student);
    const firstHash = student.readiness.sourceHash;
    student.skills = [{ name: 'Java', level: 'advanced' }, { name: 'SQL', level: 'intermediate' }];
    student.projects = [{ title: 'Portal', technologies: ['Node.js', 'MongoDB'], description: 'A placement portal project', role: 'Developer' }];
    student.cgpa = 8.7;
    student.backlogs = 0;
    const refreshed = await ensureReadiness(student);
    assert.notEqual(student.readiness.sourceHash, firstHash);
    assert.notEqual(refreshed.score, initial.score);
    assert.equal(saves, 2);
    await ensureReadiness(student);
    assert.equal(saves, 2, 'unchanged readiness inputs reuse the current snapshot');
});

test('bulk retry respects Retry-After, bounds attempts, and never retries indefinitely', async () => {
    const delays = [];
    let calls = 0;
    const success = await withBulkResumeRetry(async () => {
        calls++;
        if (calls === 1) { const error = new Error('limited'); error.code = 'AI_RATE_LIMITED'; error.retryAfterMs = 800; throw error; }
        return 'done';
    }, 3, { sleep: async (ms) => delays.push(ms) });
    assert.equal(success, 'done');
    assert.equal(calls, 2);
    assert.deepEqual(delays, [800]);
    calls = 0;
    await assert.rejects(withBulkResumeRetry(async () => { calls++; const error = new Error('limited'); error.code = 'AI_RATE_LIMITED'; throw error; }, 2, { sleep: async (ms) => delays.push(ms) }), { code: 'AI_RATE_LIMITED' });
    assert.equal(calls, 2);
});

test('Groq adapter surfaces mocked HTTP 429 and Retry-After without contacting a provider', async () => {
    const priorFetch = global.fetch;
    const priorKey = process.env.AI_API_KEY;
    global.fetch = async () => ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '2' }) });
    process.env.AI_API_KEY = 'test-only';
    try {
        const { callGroq } = require('./src/services/ai/groq.adapter');
        await assert.rejects(callGroq([], 'mock-model'), (error) => error.code === 'AI_RATE_LIMITED' && error.status === 429 && error.retryAfterMs === 2000);
    } finally {
        global.fetch = priorFetch;
        if (priorKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = priorKey;
    }
});

test('Profile AI Assistant still uses its configured model through the existing adapter with a mock provider', async () => {
    const Student = require('./src/models/Student');
    const Application = require('./src/models/Application');
    const Job = require('./src/models/Job');
    const Offer = require('./src/models/Offer');
    const Drive = require('./src/models/Drive');
    const assistant = require('./src/services/assistant.service');
    const saved = { Student: Student.findOne, Application: Application.find, Job: Job.find, Offer: Offer.find, Drive: Drive.find };
    const priorFetch = global.fetch;
    const priorEnv = { AI_API_KEY: process.env.AI_API_KEY, LLM_MODEL: process.env.LLM_MODEL };
    const chain = (value) => ({ select() { return this; }, limit() { return this; }, populate() { return this; }, sort() { return this; }, lean: async () => value });
    let requestModel;
    try {
        Student.findOne = () => ({ select: () => ({ lean: async () => ({ skills: [], projects: [], cgpa: 8, backlogs: 0 }) }) });
        Application.find = () => chain([]); Job.find = () => chain([]); Offer.find = () => chain([]); Drive.find = () => chain([]);
        process.env.AI_API_KEY = 'test-only'; process.env.LLM_MODEL = 'configured-test-model';
        global.fetch = async (_url, options) => {
            requestModel = JSON.parse(options.body).model;
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Ready', suggestions: [] }) } }] }) };
        };
        const response = await assistant.answerQuestion('How am I doing?', { id: 'student-id', role: 'student' });
        assert.equal(requestModel, 'configured-test-model');
        assert.equal(response.mode, 'ai');
        assert.equal(response.answer, 'Ready');
    } finally {
        Student.findOne = saved.Student; Application.find = saved.Application; Job.find = saved.Job; Offer.find = saved.Offer; Drive.find = saved.Drive;
        global.fetch = priorFetch;
        for (const [key, value] of Object.entries(priorEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});

test('bulk seed analyzes attached resume bytes through the manual upload pipeline and continues per student', async () => {
    const script = require('node:fs').readFileSync(require('node:path').join(__dirname, 'scripts/seed-50-students.js'), 'utf8');
    const controller = require('./src/controllers/student.controller');
    assert.match(script, /studentController\.analyzeResumeBuffer/);
    assert.match(script, /await analyzeResume\(user\._id, buffer, resumeMeta, \{ bulkResume: true \}\)/);
    assert.match(script, /cloudinaryService\.downloadAsset\(profile\.resume\.publicId/);
    assert.match(script, /if \(!forceResumeUpload && !reanalyze && profile\.resume\?\.analysisStatus === 'COMPLETED'\)[\s\S]*?SKIPPED_ALREADY_ANALYZED/);
    assert.match(script, /for \(const student of students\)[\s\S]*?const row = await seedOne/);
    assert.doesNotMatch(script, /deferAI/);
    assert.match(script, /analyzeResume\(user\._id, buffer, resumeMeta, \{ bulkResume: true \}\)/);
    assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/controllers/student.controller.js'), 'utf8'), /const result = await analyzeResumeBuffer\(targetUserId, req\.file\.buffer, resumeMeta\)/);
    assert.equal(typeof controller.analyzeResumeBuffer, 'function');
});

test('force resume upload is opt-in, reuses tracked targets, and preserves AI opt-out', () => {
    const script = require('node:fs').readFileSync(require('node:path').join(__dirname, 'scripts/seed-50-students.js'), 'utf8');
    assert.match(script, /forceResumeUpload: false/);
    assert.match(script, /args\[index\] === '--force-resume-upload'/);
    assert.match(script, /args\[index\] === '--reanalyze'/);
    assert.match(script, /\(forceResumeUpload \|\| reanalyze\) && !user/);
    assert.match(script, /This mode requires all \$\{studentsToProcess\.length\} tracked accounts, profiles/);
    assert.match(script, /!forceResumeUpload && !reanalyze && profile\.resume\?\.analysisStatus === 'COMPLETED'/);
    assert.match(script, /skipAI \? null : getResumeAnalyzer\(\)/);
    assert.match(script, /if \(skipAI\)/);
    assert.match(script, /if \(!forceResumeUpload && !reanalyze && credentialRows\.length === EXPECTED_COUNT\)/);
    assert.match(script, /await profile\.save\(\);[\s\S]*?if \(forceResumeUpload && resumePersisted\)[\s\S]*?deleteAsset\(previousAsset\.publicId/);
});

test('student readiness loads on initial dashboard and recruiter/placement consume shared backend readiness', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const studentJs = fs.readFileSync(path.join(__dirname, '../frontend/js/student.js'), 'utf8');
    const placementController = fs.readFileSync(path.join(__dirname, 'src/controllers/student.controller.js'), 'utf8');
    const matchingService = fs.readFileSync(path.join(__dirname, 'src/services/matching/matching.service.js'), 'utf8');
    const assistantService = fs.readFileSync(path.join(__dirname, 'src/services/assistant.service.js'), 'utf8');
    assert.match(studentJs, /CampusAPI\.get\(`\$\{studentPath\}\/readiness`\)/);
    assert.match(placementController, /readinessService\.ensureReadiness\(profile\)/);
    assert.match(matchingService, /ensureReadiness\(student\)/);
    assert.match(assistantService, /callGroq\([\s\S]*?process\.env\.LLM_MODEL/);
});
