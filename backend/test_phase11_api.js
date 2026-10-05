'use strict';

require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const http = require('node:http');

const base = { hostname: 'localhost', port: API_PORT };
function request(path, method = 'GET', token, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ ...base, path, method, headers: { ...(!Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders } }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, data: raw }); } });
        });
        req.on('error', reject);
        if (body) req.write(Buffer.isBuffer(body) ? body : JSON.stringify(body));
        req.end();
    });
}

function upload(path, token) {
    const boundary = `phase11_${Date.now()}`;
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="id.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), Buffer.from('%PDF-test\n%%EOF'), Buffer.from(`\r\n--${boundary}--\r\n`)]);
    return request(path, 'POST', token, body, { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length });
}

async function main() {
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    async function user(label, role) {
        const email = `p11_${tag}_${label}@example.test`;
        const created = await request('/api/auth/register', 'POST', null, { name: label, email, password: 'test-pass-11', role });
        assert.equal(created.status, 201, JSON.stringify(created.data));
        const logged = await request('/api/auth/login', 'POST', null, { email, password: 'test-pass-11' });
        assert.equal(logged.status, 200);
        const loggedUser = logged.data.data.user;
        return { ...loggedUser, id: loggedUser.id || loggedUser._id, token: logged.data.data.token };
    }
    const placement = await user('Placement', 'placement');
    assert.equal((await request('/api/auth/register', 'POST', null, { name: 'ShortPass', email: `short_${tag}@example.test`, password: 'short', role: 'student' })).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', null, { name: 'BadEmail', email: 'invalid-email', password: 'test-pass-11', role: 'student' })).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', null, { name: 'BadRole', email: `badrole_${tag}@example.test`, password: 'test-pass-11', role: 'admin' })).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', null, { name: 'Missing' })).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', null, { name: 'Placement', email: placement.email, password: 'test-pass-11', role: 'placement' })).status, 409);
    assert.equal((await request('/api/auth/login', 'POST', null, { email: placement.email, password: 'wrong-password' })).status, 401);
    assert.equal((await request('/api/auth/me', 'GET', placement.token)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET')).status, 401);
    const empty = await request('/api/analytics/placement', 'GET', placement.token);
    assert.equal(empty.status, 200);
    assert.equal(empty.data.data.placement.totalStudents, 0);
    assert.equal(empty.data.data.placement.placementRate, 0);
    assert.equal(empty.data.data.compensation.averageCtc, null);

    const recruiterA = await user('RecruiterA', 'recruiter');
    const recruiterB = await user('RecruiterB', 'recruiter');
    for (const [recruiter, companyName] of [[recruiterA, 'Northwind'], [recruiterB, 'Contoso']]) {
        const profile = await request('/api/recruiters', 'POST', recruiter.token, { companyName, industry: 'Technology' });
        assert.equal(profile.status, 200, JSON.stringify(profile.data));
    }
    const students = [];
    for (const [label, profile] of [
        ['Strong', { branch: 'CSE', cgpa: 9.2, backlogs: 0, skills: [{ name: 'JavaScript' }, { name: 'Node.js' }, { name: 'Machine Learning' }] }],
        ['Synonyms', { branch: 'CSE', cgpa: 8.8, backlogs: 0, skills: [{ name: 'JS' }, { name: 'Node' }, { name: 'ML' }, { name: 'DSA solving' }] }],
        ['Ineligible', { branch: 'CSE', cgpa: 5.1, backlogs: 3, skills: [{ name: 'JavaScript' }] }],
        ['Partial', { branch: 'IT', cgpa: 8.0, backlogs: 0, skills: [{ name: 'JS' }, { name: 'webdev' }] }],
        ['NoMatch', { branch: 'MECH', cgpa: 6.0, backlogs: 2, skills: [] }]
    ]) {
        const student = await user(label, 'student');
        const saved = await request(`/api/students/${student.id}`, 'PATCH', student.token, profile);
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        const readiness = await request(`/api/students/${student.id}/readiness/analyze`, 'POST', student.token);
        assert.equal(readiness.status, 200, JSON.stringify(readiness.data));
        students.push(student);
    }

    async function createJob(recruiter, title, role, requiredSkills, eligibleBranches = ['CSE', 'IT']) {
        const response = await request('/api/jobs', 'POST', recruiter.token, {
            title, description: `${title} role`, status: 'active',
            requirements: { role, requiredSkills, preferredSkills: [], minimumCGPA: 7, maximumBacklogs: 1, eligibleBranches }
        });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        return response.data.data;
    }
    const jobA = await createJob(recruiterA, 'Backend Engineer', 'Backend Engineer', ['JavaScript', 'Node.js']);
    const jobB = await createJob(recruiterA, 'ML Engineer', 'ML Engineer', ['Machine Learning', 'Data Structures and Algorithms']);
    const jobC = await createJob(recruiterB, 'Web Engineer', 'Web Engineer', ['web development']);

    const synonymMatch = await request(`/api/jobs/${jobB._id}/match`, 'POST', students[1].token);
    assert.equal(synonymMatch.status, 200);
    assert.deepEqual(synonymMatch.data.data.skillDetail.matchedRequired, ['machine learning', 'dsa']);
    const ineligibleMatch = await request(`/api/jobs/${jobA._id}/match`, 'POST', students[2].token);
    assert.equal(ineligibleMatch.data.data.eligible, false);

    const applications = new Map();
    for (const student of students) {
        for (const job of [jobA, jobB, jobC]) {
            const applied = await request('/api/applications', 'POST', student.token, { jobId: job._id });
            assert.equal(applied.status, 201, JSON.stringify(applied.data));
            applications.set(`${student.id}:${job._id}`, applied.data.data.applicationId);
        }
    }
    const duplicate = await request('/api/applications', 'POST', students[0].token, { jobId: jobA._id });
    assert.equal(duplicate.status, 400);
    const draft = await request('/api/jobs', 'POST', recruiterA.token, { title: 'Draft', description: 'Draft', requirements: {}, status: 'draft' });
    assert.equal(draft.status, 201);
    assert.equal((await request('/api/applications', 'POST', students[0].token, { jobId: draft.data.data._id })).status, 400);

    const date = '2026-11-20';
    async function createDrive(job, startTime, endTime) {
        const response = await request('/api/drives', 'POST', job === jobC ? recruiterB.token : recruiterA.token, { jobId: job._id, date, startTime, endTime, mode: 'online' });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        return response.data.data;
    }
    const driveA = await createDrive(jobA, '10:00', '12:00');
    const driveB = await createDrive(jobB, '11:00', '13:00');
    const driveC = await createDrive(jobC, '12:00', '13:00');
    const firstDriveShortlist = await request(`/api/drives/${driveA._id}/shortlist`, 'POST', recruiterA.token, { studentIds: [students[0].id] });
    assert.equal(firstDriveShortlist.status, 200, JSON.stringify(firstDriveShortlist.data));
    const conflictPreflight = await request(`/api/drives/${driveB._id}/check-conflicts`, 'POST', recruiterA.token, { studentIds: [students[0].id] });
    assert.equal(conflictPreflight.status, 200);
    assert.equal(conflictPreflight.data.data.conflictCount, 1);
    const blockedShortlist = await request(`/api/drives/${driveB._id}/shortlist`, 'POST', recruiterA.token, { studentIds: [students[0].id] });
    assert.equal(blockedShortlist.status, 409);
    const thirdDriveShortlist = await request(`/api/drives/${driveC._id}/shortlist`, 'POST', recruiterB.token, { studentIds: [students[1].id] });
    assert.equal(thirdDriveShortlist.status, 200, JSON.stringify(thirdDriveShortlist.data));
    const removedFromOtherDrive = await request(`/api/drives/${driveC._id}/candidates/${students[1].id}`, 'DELETE', recruiterB.token);
    assert.equal(removedFromOtherDrive.status, 200, JSON.stringify(removedFromOtherDrive.data));
    const conflict = await request(`/api/drives/${driveB._id}/check-conflicts`, 'POST', recruiterA.token, { studentIds: [students[0].id] });
    assert.equal(conflict.status, 200);
    assert.equal(conflict.data.data.conflictCount, 1);

    const selectedApps = [applications.get(`${students[0].id}:${jobA._id}`), applications.get(`${students[1].id}:${jobB._id}`), applications.get(`${students[3].id}:${jobC._id}`)];
    for (const [index, appId] of selectedApps.entries()) {
        const recruiter = index === 2 ? recruiterB : recruiterA;
        const interviewDrive = [driveA, driveB, driveC][index];
        const statuses = index === 0 ? ['Interview', 'Selected'] : ['Shortlisted', 'Interview', 'Selected'];
        for (const status of statuses) {
            const changed = await request(`/api/applications/${appId}/status`, 'PATCH', recruiter.token, { status, ...(status === 'Interview' ? { driveId: interviewDrive._id } : {}) });
            assert.equal(changed.status, 200, JSON.stringify(changed.data));
        }
    }
    async function createOffer(appId, ctc, recruiter, documents = [{ name: 'Identity Proof' }]) {
        const response = await request('/api/offers', 'POST', recruiter.token, { applicationId: appId, ctc, documents });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        return response.data.data;
    }
    const offerPlaced = await createOffer(selectedApps[0], 900000, recruiterA, [{ name: 'Identity Proof' }]);
    const offerAccepted = await createOffer(selectedApps[1], 1200000, recruiterA);
    const offerDocs = await createOffer(selectedApps[2], 800000, recruiterB);
    for (const status of ['Offer Generated', 'Offer Sent']) {
        assert.equal((await request(`/api/offers/${offerPlaced._id}/status`, 'PATCH', recruiterA.token, { status })).status, 200);
    }
    const accepted = await request(`/api/offers/${offerPlaced._id}/status`, 'PATCH', students[0].token, { status: 'Accepted' });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.data.offerStatus, 'Documentation Pending');
    assert.equal((await upload(`/api/offers/${offerPlaced._id}/documents/0/upload`, students[0].token)).status, 200);
    assert.equal((await request(`/api/offers/${offerPlaced._id}/documents/0/status`, 'PATCH', recruiterA.token, { status: 'Verified' })).data.data.offerStatus, 'Documents Verified');
    assert.equal((await request(`/api/offers/${offerPlaced._id}/joining-date`, 'PATCH', recruiterA.token, { joiningDate: '2027-06-01' })).status, 200);
    assert.equal((await request(`/api/offers/${offerPlaced._id}/status`, 'PATCH', recruiterA.token, { status: 'Joining Confirmed' })).status, 200);
    for (const status of ['Offer Generated', 'Offer Sent']) assert.equal((await request(`/api/offers/${offerAccepted._id}/status`, 'PATCH', recruiterA.token, { status })).status, 200);
    assert.equal((await request(`/api/offers/${offerAccepted._id}/status`, 'PATCH', students[1].token, { status: 'Accepted' })).status, 200);
    for (const status of ['Offer Generated', 'Offer Sent']) assert.equal((await request(`/api/offers/${offerDocs._id}/status`, 'PATCH', recruiterB.token, { status })).status, 200);
    assert.equal((await request(`/api/offers/${offerDocs._id}/status`, 'PATCH', students[3].token, { status: 'Accepted' })).status, 200);

    const analytics = await request('/api/analytics/placement', 'GET', placement.token);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.data));
    const { placement: p, recruiters: r, skills, compensation: c, drives: d } = analytics.data.data;
    assert.equal(p.totalStudents, 5);
    assert.equal(p.applications, 15);
    assert.equal(p.placed, 1);
    assert.equal(p.placementRate, 20);
    assert.equal(r.activeRecruiters, 2);
    assert.equal(r.openJobs, 3);
    assert.equal(r.offers, 3);
    assert.equal(c.averageCtc, 2900000 / 3);
    assert.equal(c.medianCtc, 900000);
    assert.equal(c.highestCtc, 1200000);
    assert.equal(d.upcoming, 3);
    assert.equal(d.conflicts, 0);
    assert(skills.mostDemanded.some((item) => item.name === 'machine learning'));
    const numericValues = [p.placementRate, r.selectionRate, c.averageCtc, c.medianCtc, c.highestCtc].filter((value) => value != null);
    assert(numericValues.every(Number.isFinite));

    assert.equal((await request('/api/analytics/placement')).status, 401);
    assert.equal((await request('/api/analytics/placement', 'GET', students[0].token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}`, 'GET', students[0].token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/readiness`, 'GET', students[0].token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/applications`, 'GET', students[0].token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/offers`, 'GET', students[0].token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/readiness`, 'GET', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/applications`, 'GET', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/students/${students[1].id}/offers`, 'GET', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/jobs/${jobC._id}`, 'GET', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/jobs/${jobC._id}/match?studentId=${students[0].id}`, 'POST', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/jobs/${jobC._id}/candidates`, 'GET', recruiterA.token)).status, 403);
    assert.equal((await request(`/api/applications/${selectedApps[2]}/status`, 'PATCH', recruiterA.token, { status: 'Rejected' })).status, 403);
    assert.equal((await request('/api/drives', 'GET', students[0].token)).status, 403);

    console.log('Phase 11 API integration passed: isolated empty state, five-student workflow, aliases, applications, drives/conflicts, three offers, analytics, and authorization.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
