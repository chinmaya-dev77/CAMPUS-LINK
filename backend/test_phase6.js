require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const http = require('http');

function req(opts, body) {
    return new Promise((resolve, reject) => {
        const r = http.request(opts, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => resolve({ status: resp.statusCode, data: JSON.parse(d) }));
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}
function authHeaders(token) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

async function main() {
    const BASE = { hostname: 'localhost', port: API_PORT };

    // Register & Login Recruiter
    const email = 'recruiter6' + Date.now() + '@test.com';
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Recruiter 6', email, password: 'isolated-test-pass', role: 'recruiter' });
    const login = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email, password: 'isolated-test-pass' });
    const token = login.data.data.token;

    // Create Job
    const jobData = {
        title: 'Full Stack Developer Intern',
        description: 'Full Stack Developer Intern with JavaScript, Node.js, Express.js, MongoDB, REST APIs and Git.',
        requirements: {}
    };

    const cJob = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(token) }, jobData);
    const jobId = cJob.data.data._id;
    console.log("Created Job:", jobId);

    // Analyze JD
    console.log("Analyzing JD...");
    const aJob = await req({ ...BASE, path: `/api/jobs/${jobId}/analyze`, method: 'POST', headers: authHeaders(token) });
    assert.equal(aJob.status, 200, JSON.stringify(aJob.data));
    const extracted = aJob.data.data.requirements;
    assert.match(extracted.role, /full.?stack developer/i);
    assert.ok(extracted.requiredSkills.length >= 4);
    assert.ok(Array.isArray(extracted.preferredSkills));
    assert.ok(Array.isArray(extracted.responsibilities));
    assert.equal(typeof extracted.education, 'string');
    const normalized = new Set(extracted.requiredSkills);
    for (const expected of ['javascript', 'node.js', 'express.js', 'database/sql', 'version control (git)']) {
        assert.ok(normalized.has(expected), `normalized required skills include ${expected}`);
    }
    console.log('Phase 6 JD API passed: role, skill fields, responsibilities, education, and canonical normalization verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
