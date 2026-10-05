'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const API_PORT = require('./test-isolation')();

const baseUrl = `http://127.0.0.1:${API_PORT}/api`;
async function request(path, { method = 'GET', token, body } = {}) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
        method, headers,
        ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {})
    });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
}

async function upload(token, userId, fileName, bytes, contentType) {
    const boundary = `CampusLinkQA${Date.now()}${Math.random().toString(16).slice(2)}`;
    const parts = [];
    if (fileName) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'ascii'));
        parts.push(bytes);
        parts.push(Buffer.from('\r\n', 'ascii'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'ascii'));
    const body = Buffer.concat(parts);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: API_PORT, path: `/api/students/${userId}/resume`, method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
        }, response => {
            let raw = '';
            response.on('data', chunk => { raw += chunk; });
            response.on('end', () => { try { resolve({ status: response.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: response.statusCode, data: raw }); } });
        });
        req.on('error', reject);
        req.end(body);
    });
}

async function main() {
    const marker = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const studentEmail = `phase123_${marker}@example.test`;
    const password = 'isolated-e2e-password';
    const registration = await request('/auth/register', { method: 'POST', body: { name: 'QA Student', email: studentEmail, password, role: 'student' } });
    assert.equal(registration.status, 201);
    assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'QA Student', email: studentEmail, password, role: 'student' } })).status, 409);
    assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'Invalid', email: 'bad', password: 'short', role: 'student' } })).status, 400);
    assert.equal((await request('/auth/login', { method: 'POST', body: { email: studentEmail } })).status, 400);
    assert.equal((await request('/auth/login', { method: 'POST', body: { email: studentEmail, password: 'wrong-password' } })).status, 401);

    const login = await request('/auth/login', { method: 'POST', body: { email: studentEmail, password } });
    assert.equal(login.status, 200);
    const student = login.data.data.user;
    const token = login.data.data.token;
    assert.equal((await request('/auth/me', { token })).status, 200);
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/me', { token: 'not.a.valid.token' })).status, 401);
    assert.equal((await request('/analytics/placement', { token })).status, 403);
    assert.equal((await request(`/students/${student.id}`)).status, 401);

    assert.equal((await request(`/students/${student.id}`, { token })).status, 200, 'empty profile shell is readable');
    assert.equal((await request(`/students/${student.id}`, { method: 'PATCH', token, body: { cgpa: 11 } })).status, 400);
    assert.equal((await request(`/students/${student.id}`, { method: 'PATCH', token, body: { backlogs: -1 } })).status, 400);
    const profileData = { name: 'QA Student', branch: 'CSE', graduationYear: 2027, cgpa: 8.4, backlogs: 0, skills: [{ name: 'JavaScript', level: 'advanced' }], projects: [] };
    assert.equal((await request(`/students/${student.id}`, { method: 'PATCH', token, body: profileData })).status, 200);
    assert.equal((await request(`/students/${student.id}`, { token })).data.data.cgpa, 8.4);

    const second = await request('/auth/register', { method: 'POST', body: { name: 'Other Student', email: `phase123_other_${marker}@example.test`, password, role: 'student' } });
    const secondLogin = await request('/auth/login', { method: 'POST', body: { email: `phase123_other_${marker}@example.test`, password } });
    assert.equal((await request(`/students/${student.id}`, { token: secondLogin.data.data.token })).status, 403);
    assert.equal((await request('/students/not-an-object-id', { token })).status, 403);
    assert.equal((await request('/students/507f1f77bcf86cd799439011', { token: secondLogin.data.data.token })).status, 403);
    assert.equal(second.status, 201);

    const loginAgain = await request('/auth/login', { method: 'POST', body: { email: studentEmail, password } });
    assert.equal((await request(`/students/${student.id}`, { token: loginAgain.data.data.token })).data.data.cgpa, 8.4, 'profile persists after a new login');

    const recruiterEmail = `phase123_recruiter_${marker}@example.test`;
    assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'QA Recruiter', email: recruiterEmail, password, role: 'recruiter' } })).status, 201);
    const recruiterLogin = await request('/auth/login', { method: 'POST', body: { email: recruiterEmail, password } });
    const recruiter = recruiterLogin.data.data.user;
    const recruiterToken = recruiterLogin.data.data.token;
    assert.equal((await request('/recruiters', { method: 'POST', token: recruiterToken, body: { companyName: 'QA Company', industry: 'Software' } })).status, 200);
    assert.equal((await request(`/recruiters/${recruiter.id}`, { method: 'PATCH', token: recruiterToken, body: { companyName: 'Updated QA Company' } })).status, 200);
    assert.equal((await request(`/recruiters/${recruiter.id}`, { token: recruiterToken })).data.data.companyName, 'Updated QA Company');
    assert.equal((await request('/analytics/placement', { token: recruiterToken })).status, 403);

    const placementEmail = `phase123_placement_${marker}@example.test`;
    assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'QA Placement', email: placementEmail, password, role: 'placement' } })).status, 201);
    const placementLogin = await request('/auth/login', { method: 'POST', body: { email: placementEmail, password } });
    assert.equal((await request('/analytics/placement', { token: placementLogin.data.data.token })).status, 200);
    assert.equal((await request('/students/507f1f77bcf86cd799439011', { token: placementLogin.data.data.token })).status, 404, 'placement receives 404 for a well-formed nonexistent profile ID');

    const studentToken = loginAgain.data.data.token;
    assert.equal((await upload(studentToken, student.id, 'not-a-resume.txt', Buffer.from('text'), 'text/plain')).status, 400, 'invalid file type is rejected');
    assert.equal((await upload(studentToken, student.id, null)).status, 400, 'missing file is rejected');
    assert.equal((await upload(studentToken, student.id, 'empty.pdf', Buffer.alloc(0), 'application/pdf')).status, 400, 'empty PDF is rejected');
    const malformedResume = await upload(studentToken, student.id, 'malformed.pdf', Buffer.from('%PDF broken'), 'application/pdf');
    assert.equal(malformedResume.status, 200, JSON.stringify(malformedResume.data));
    assert.equal(malformedResume.data.data.resume.analysisStatus, 'FAILED', 'unreadable PDF stays uploaded with an explicit analysis failure');
    assert.ok(malformedResume.data.data.resume.storedFileName);

    assert.ok(process.env.QA_RESUME_PDF, 'QA_RESUME_PDF must point inside the disposable test directory');
    const resume = fs.readFileSync(process.env.QA_RESUME_PDF);
    assert.ok(resume.subarray(0, 4).equals(Buffer.from('%PDF')));
    assert.ok(resume.length > 400);
    const resumeResult = await upload(studentToken, student.id, 'qa-resume.pdf', Buffer.from(resume), 'application/pdf');
    let resumeStatus;
    if (resumeResult.status === 200) {
        resumeStatus = resumeResult.data.data.resume.analysisStatus;
        const persisted = await request(`/students/${student.id}`, { token: studentToken });
        assert.ok(persisted.data.data.resume?.storedFileName);
        if (resumeStatus === 'COMPLETED') {
            assert.ok(persisted.data.data.skills.length > 0);
            const readiness = await request(`/students/${student.id}/readiness/analyze`, { method: 'POST', token: studentToken });
            assert.equal(readiness.status, 200);
            assert.ok(Number.isFinite(readiness.data.data.score));
        } else {
            assert.equal(resumeStatus, 'FAILED');
            assert.match(persisted.data.data.resume.analysisError, /uploaded successfully/i);
            assert.deepEqual(persisted.data.data.skills.map(item => item.name), ['JavaScript'], 'failed AI extraction preserves existing profile evidence');
        }
    } else if ([502, 500].includes(resumeResult.status) && ['AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_TIMEOUT', 'AI_PROVIDER_ERROR'].includes(resumeResult.data?.error?.code)) {
        resumeStatus = `BLOCKED by AI provider (${resumeResult.data.error.code})`;
        const profileAfter = await request(`/students/${student.id}`, { token: studentToken });
        assert.ok(profileAfter.data.data.resume?.storedFileName, 'provider failure retains uploaded resume metadata');
        assert.equal(profileAfter.data.data.resume.analysisStatus, 'FAILED');
        assert.deepEqual(profileAfter.data.data.skills.map(item => item.name), ['JavaScript'], 'provider failure preserves the prior profile');
    } else {
        assert.fail(`Unexpected valid-resume outcome: HTTP ${resumeResult.status} ${JSON.stringify(resumeResult.data)}`);
    }

    await request(`/students/${student.id}/resume`, { method: 'DELETE', token: studentToken });

    console.log(`Phase 1–3 isolated API E2E passed for auth/profile/upload validation; valid resume parsing: ${resumeStatus}.`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
