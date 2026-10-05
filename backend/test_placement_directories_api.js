'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const API_PORT = require('./test-isolation')();

async function request(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${API_PORT}/api${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
}

async function createUser(name, role, marker) {
    const email = `${role}_${marker}@example.test`;
    const registered = await request('/auth/register', { method: 'POST', body: { name, email, password: 'placement-directory-test', role } });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    const login = await request('/auth/login', { method: 'POST', body: { email, password: 'placement-directory-test' } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const user = login.data.data.user;
    return { ...user, id: user.id || user._id, token: login.data.data.token };
}

async function main() {
    const marker = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [placement, recruiter, student] = await Promise.all([
        createUser('Placement QA', 'placement', marker),
        createUser('Recruiter QA', 'recruiter', marker),
        createUser('Student QA', 'student', marker)
    ]);
    assert.equal((await request('/students')).status, 401);
    assert.equal((await request('/recruiters')).status, 401);
    assert.equal((await request('/applications')).status, 401);
    for (const user of [recruiter, student]) {
        assert.equal((await request('/students', { token: user.token })).status, 403);
        assert.equal((await request('/recruiters', { token: user.token })).status, 403);
        assert.equal((await request('/applications', { token: user.token })).status, 403);
    }

    // Role accounts without their profile documents must not become directory rows.
    const emptyStudents = await request('/students', { token: placement.token });
    const emptyRecruiters = await request('/recruiters', { token: placement.token });
    assert.equal(emptyStudents.status, 200, JSON.stringify(emptyStudents.data));
    assert.deepEqual(emptyStudents.data.data, []);
    assert.equal(emptyRecruiters.status, 200, JSON.stringify(emptyRecruiters.data));
    assert.deepEqual(emptyRecruiters.data.data, []);

    await request(`/students/${student.id}`, { method: 'PATCH', token: student.token, body: { branch: 'CSE', cgpa: 8.6, backlogs: 0, phone: 'private-test-value' } }).then((result) => assert.equal(result.status, 200));
    await request('/recruiters', { method: 'POST', token: recruiter.token, body: { companyName: 'Directory QA Company', recruiterName: 'Recruiter QA', industry: 'Software' } }).then((result) => assert.equal(result.status, 200));
    const createdJob = await request('/jobs', { method: 'POST', token: recruiter.token, body: { title: 'Directory QA Role', description: 'QA job', status: 'active', requirements: { role: 'Engineer', requiredSkills: [], preferredSkills: [], eligibleBranches: ['CSE'] } } });
    assert.equal(createdJob.status, 201, JSON.stringify(createdJob.data));
    const application = await request('/applications', { method: 'POST', token: student.token, body: { jobId: createdJob.data.data._id } });
    assert.equal(application.status, 201, JSON.stringify(application.data));

    const students = await request('/students', { token: placement.token });
    assert.equal(students.status, 200, JSON.stringify(students.data));
    const row = students.data.data.find((item) => String(item.userId) === String(student.id));
    assert.ok(row);
    assert.equal(row.branch, 'computer science');
    assert.equal(row.cgpa, 8.6);
    assert.equal(row.applicationCount, 1);
    assert.equal(Object.hasOwn(row, 'email'), false);
    assert.equal(Object.hasOwn(row, 'phone'), false);
    assert.equal(Object.hasOwn(row, 'resume'), false);

    const recruiters = await request('/recruiters', { token: placement.token });
    assert.equal(recruiters.status, 200, JSON.stringify(recruiters.data));
    const recruiterRow = recruiters.data.data.find((item) => String(item.userId) === String(recruiter.id));
    assert.equal(recruiterRow.companyName, 'Directory QA Company');
    assert.equal(recruiterRow.activeJobs, 1);
    assert.equal(recruiterRow.applicationCount, 1);
    assert.equal(recruiterRow.email, recruiter.email);

    // Profile upserts automatically make their role accounts visible in placement directories.
    assert.ok(students.data.data.some((item) => String(item.userId) === String(student.id)));
    assert.ok(recruiters.data.data.some((item) => String(item.userId) === String(recruiter.id)));

    const applications = await request('/applications', { token: placement.token });
    assert.equal(applications.status, 200, JSON.stringify(applications.data));
    const applicationRow = applications.data.data.find((item) => String(item._id) === String(application.data.data.applicationId));
    assert.ok(applicationRow);
    assert.equal(applicationRow.studentProfile.branch, 'computer science');
    assert.equal(applicationRow.companyName, 'Directory QA Company');
    assert.equal(Object.hasOwn(applicationRow.studentId, 'email'), false);
    console.log('Placement directory API checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
