'use strict';

require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const http = require('node:http');

const base = { hostname: 'localhost', port: API_PORT };
function request(path, method, token, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ ...base, path, method, headers: {
            'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
        } }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    const tag = Date.now();
    const email = `job_persistence_${tag}@test.com`;
    const password = 'test-pass';
    const registered = await request('/api/auth/register', 'POST', null, {
        name: 'Job Persistence Recruiter', email, password, role: 'recruiter'
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    let login = await request('/api/auth/login', 'POST', null, { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = login.data.data.token;
    const jobPayload = {
        title: 'Job Requirements Persistence Check',
        description: 'Temporary isolated API regression fixture.',
        status: 'active',
        requirements: {
            requiredSkills: ['JavaScript', 'Node.js', 'Express.js', 'MongoDB'],
            preferredSkills: ['React', 'Python', 'Docker'],
            minimumCGPA: 7.0,
            maximumBacklogs: 2,
            experience: '0 years',
            eligibleBranches: ['Computer Science', 'Information Technology']
        }
    };
    const created = await request('/api/jobs', 'POST', token, jobPayload);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const jobId = created.data.data._id;
    const assertRequirements = (job) => {
        assert.deepEqual(job.requirements.requiredSkills, jobPayload.requirements.requiredSkills);
        assert.deepEqual(job.requirements.preferredSkills, jobPayload.requirements.preferredSkills);
        assert.equal(job.requirements.minimumCGPA, 7);
        assert.equal(job.requirements.maximumBacklogs, 2);
        assert.equal(job.requirements.experience, '0 years');
        assert.deepEqual(job.requirements.eligibleBranches, ['computer science', 'information technology']);
    };
    assertRequirements(created.data.data);

    const list = await request('/api/jobs', 'GET', token);
    assert.equal(list.status, 200, JSON.stringify(list.data));
    assertRequirements(list.data.data.find((job) => job._id === jobId));
    const detail = await request(`/api/jobs/${jobId}`, 'GET', token);
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assertRequirements(detail.data.data);

    login = await request('/api/auth/login', 'POST', null, { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const afterLogin = await request(`/api/jobs/${jobId}`, 'GET', login.data.data.token);
    assert.equal(afterLogin.status, 200, JSON.stringify(afterLogin.data));
    assertRequirements(afterLogin.data.data);

    const edited = await request(`/api/jobs/${jobId}`, 'PATCH', login.data.data.token, {
        requirements: { ...jobPayload.requirements, maximumBacklogs: 0 }
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    assert.equal(edited.data.data.requirements.maximumBacklogs, 0);
    const afterEdit = await request(`/api/jobs/${jobId}`, 'GET', login.data.data.token);
    assert.equal(afterEdit.data.data.requirements.maximumBacklogs, 0);
    assert.equal(afterEdit.data.data.requirements.minimumCGPA, 7);

    console.log('Job persistence API passed: create, list, detail, login refresh, edit, and zero-value persistence.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
