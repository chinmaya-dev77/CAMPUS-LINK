'use strict';
require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const API_PORT = require('./test-isolation')();
const base = `http://127.0.0.1:${API_PORT}/api`;
async function call(route, token, method = 'GET', body) {
    const response = await fetch(`${base}${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return { status: response.status, contentType, bytes: Buffer.from(await response.arrayBuffer()) };
    const data = await response.json();
    return { status: response.status, data, contentType: response.headers.get('content-type') };
}
async function createUser(name, role, tag) {
    const email = `${role}_${tag}@example.test`, password = 'Polish-QA-Password-11';
    assert.equal((await call('/auth/register', null, 'POST', { name, email, password, role })).status, 201);
    const result = await call('/auth/login', null, 'POST', { email, password });
    assert.equal(result.status, 200);
    return { ...result.data.data.user, token: result.data.data.token };
}

async function main() {
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const student = await createUser('QA CSE Student', 'student', `s_${tag}`);
    const studentIT = await createUser('QA IT Student', 'student', `it_${tag}`);
    const recruiter = await createUser('QA Recruiter', 'recruiter', `r_${tag}`);
    const otherRecruiter = await createUser('Other Recruiter', 'recruiter', `r2_${tag}`);
    const placement = await createUser('QA Placement', 'placement', `p_${tag}`);
    assert.equal((await call(`/students/${student.id}`, student.token, 'PATCH', { branch: 'CSE', graduationYear: 2027, cgpa: 8.2, backlogs: 0, skills: [{ name: 'JavaScript' }], projects: [{ title: 'CampusLink', description: 'Manual project', technologies: ['JavaScript'], githubUrl: 'https://github.com/example/demo', demoUrl: 'https://example.test/demo', role: 'Developer', source: 'manual' }] })).status, 200);
    assert.equal((await call(`/students/${studentIT.id}`, studentIT.token, 'PATCH', { branch: 'IT', cgpa: 8.0 })).status, 200);
    const job = await call('/jobs', recruiter.token, 'POST', { title: 'Computer Science Internship', description: 'Build software', status: 'active', requirements: { eligibleBranches: ['Computer Science'], requiredSkills: ['JavaScript'] } });
    assert.equal(job.status, 201);
    assert.deepEqual(job.data.data.requirements.eligibleBranches, ['computer science']);
    assert.equal((await call(`/jobs/${job.data.data._id}/match`, student.token, 'POST', {})).data.data.eligible, true);
    assert.equal((await call(`/jobs/${job.data.data._id}/match`, studentIT.token, 'POST', {})).data.data.eligible, false);
    const candidateList = await call(`/jobs/${job.data.data._id}/candidates?includeIneligible=true`, recruiter.token);
    assert.equal(candidateList.status, 200);
    assert.equal(candidateList.data.data.find((candidate) => String(candidate.studentId) === String(student.id)).branch, 'computer science');
    const profile = await call(`/students/${student.id}`, student.token);
    assert.equal(profile.data.data.projects[0].source, 'manual');
    assert.equal(profile.data.data.projects[0].githubUrl, 'https://github.com/example/demo');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
    const form = new FormData(); form.append('picture', new Blob([png], { type: 'image/png' }), 'avatar.png');
    assert.equal((await call(`/students/${student.id}/profile-picture`, student.token, 'POST', form)).status, 200);
    assert.equal((await call(`/applications`, student.token, 'POST', { jobId: job.data.data._id })).status, 201);
    const profilePicture = await call(`/students/${student.id}/profile-picture`, student.token);
    assert.equal(profilePicture.status, 200);
    assert.equal(profilePicture.contentType, 'image/png');
    assert.equal((await call(`/students/${student.id}/profile-picture`, otherRecruiter.token)).status, 403);
    assert.equal((await call(`/students/${student.id}/profile-picture`, recruiter.token)).status, 200);
    assert.equal((await call(`/students/${student.id}/profile-picture`, studentIT.token)).status, 403);
    assert.equal((await call(`/students/${student.id}/profile-picture`, placement.token)).status, 200);

    const mongoose = require('mongoose');
    const Student = require('./src/models/Student');
    await mongoose.connect(process.env.MONGODB_URI);
    const studentDoc = await Student.findOne({ userId: student.id });
    const picturePath = path.resolve(__dirname, 'uploads', studentDoc.profilePicture.fileName);
    const resumeName = `qa_resume_${tag}.pdf`;
    const resumePath = path.resolve(__dirname, 'uploads', resumeName);
    fs.writeFileSync(resumePath, Buffer.from('%PDF-1.4\nQA fixture\n%%EOF'));
    studentDoc.resume = { storedFileName: resumeName, originalFileName: 'qa-resume.pdf' };
    await studentDoc.save();
    await mongoose.disconnect();
    assert.equal((await call(`/students/${student.id}/resume`, student.token)).status, 200);
    assert.equal((await call(`/students/${student.id}/resume?download=true`, student.token)).status, 200);
    assert.equal((await call(`/students/${student.id}/resume`, studentIT.token)).status, 403);
    assert.equal((await call(`/students/${student.id}/resume`, otherRecruiter.token)).status, 403);
    assert.equal((await call(`/students/${student.id}/resume`, recruiter.token)).status, 200);
    assert.equal((await call(`/students/${student.id}/resume`, placement.token)).status, 200);
    assert.equal((await call('/analytics/placement', placement.token)).data.data.skills.branchDistribution.find((row) => row.name === 'computer science')?.count, 1);
    const assistant = await call('/assistant', student.token, 'POST', { question: 'Explain my current applications and readiness.' });
    assert.equal(assistant.status, 200);
    assert.equal(assistant.data.data.facts.role, 'student');
    assert.equal((await call('/assistant', student.token, 'POST', { question: 'x'.repeat(1001) })).status, 400);
    const recruiterAssistant = await call('/assistant', recruiter.token, 'POST', { question: 'Summarize my candidates.' });
    assert.equal(recruiterAssistant.data.data.facts.jobs.length, 1);
    assert.equal((await call('/assistant', otherRecruiter.token, 'POST', { question: 'Summarize my candidates.' })).data.data.facts.jobs.length, 0);
    fs.rmSync(resumePath, { force: true });
    fs.rmSync(picturePath, { force: true });
    console.log('Polish API checks passed: branch normalization, project persistence, private resume/photo access, analytics grouping, role-scoped assistant facts, and question validation.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
