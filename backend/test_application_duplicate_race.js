'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const API_PORT = require('./test-isolation')();
const Application = require('./src/models/Application');

function request(path, method = 'GET', token, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: API_PORT, path, method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        }, (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, data: raw }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function createUser(name, role) {
    const email = `race_${Date.now()}_${Math.random().toString(36).slice(2)}@example.test`;
    const password = 'isolated-race-test';
    const created = await request('/api/auth/register', 'POST', null, { name, email, password, role });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const login = await request('/api/auth/login', 'POST', null, { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    return login.data.data;
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    await Application.init();
    const indexes = await Application.collection.indexes();
    assert.ok(indexes.some(index => index.unique && index.key.studentId === 1 && index.key.jobId === 1), 'compound unique application index exists');
    await mongoose.disconnect();

    const recruiter = await createUser('Race Recruiter', 'recruiter');
    const student = await createUser('Race Student', 'student');
    const profile = await request(`/api/students/${student.user.id}`, 'PATCH', student.token, {
        branch: 'CSE', cgpa: 8.5, backlogs: 0, skills: [{ name: 'JavaScript', level: 'advanced' }]
    });
    assert.equal(profile.status, 200, JSON.stringify(profile.data));

    const job = await request('/api/jobs', 'POST', recruiter.token, {
        title: 'Concurrency QA Engineer', description: 'Isolated duplicate application race test', status: 'active',
        requirements: { role: 'QA Engineer', requiredSkills: ['JavaScript'], preferredSkills: [], minimumCGPA: 7, maximumBacklogs: 1, eligibleBranches: ['CSE'] }
    });
    assert.equal(job.status, 201, JSON.stringify(job.data));

    const jobId = job.data.data._id;
    const [first, second] = await Promise.all([
        request('/api/applications', 'POST', student.token, { jobId }),
        request('/api/applications', 'POST', student.token, { jobId })
    ]);
    assert.equal([first.status, second.status].filter(status => status === 201).length, 1, 'exactly one concurrent application succeeds');
    assert.ok([first, second].every(result => [201, 400, 409].includes(result.status)), 'the duplicate request is rejected');

    const applications = await request(`/api/students/${student.user.id}/applications`, 'GET', student.token);
    assert.equal(applications.status, 200);
    assert.equal(applications.data.data.length, 1, 'exactly one application persists');
    console.log('Compound application uniqueness race test passed: 5 checks.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
});
