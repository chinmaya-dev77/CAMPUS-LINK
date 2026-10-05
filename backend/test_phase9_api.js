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
    const register = async (name, role) => {
        const email = `${role}_${tag}_${name.replace(/\W/g, '')}@test.com`;
        const created = await request('/api/auth/register', 'POST', null, { name, email, password: 'test-pass', role });
        assert.equal(created.status, 201);
        const login = await request('/api/auth/login', 'POST', null, { email, password: 'test-pass' });
        return { token: login.data.data.token, id: login.data.data.user.id };
    };
    const recruiter = await register('Phase 9 Recruiter', 'recruiter');
    const recruiterProfile = await request(`/api/recruiters/${recruiter.id}`, 'PATCH', recruiter.token, { companyName: 'Phase Nine Corp' });
    assert.equal(recruiterProfile.status, 200, JSON.stringify(recruiterProfile.data));
    const otherRecruiter = await register('Other Phase 9 Recruiter', 'recruiter');
    const placementOfficer = await register('Phase 9 Placement Officer', 'placement');
    const student = await register('Phase 9 Rahul', 'student');
    const auth = recruiter.token;
    const profile = await request(`/api/students/${student.id}`, 'PATCH', student.token, { branch: 'CSE', cgpa: 8.5, backlogs: 0 });
    assert.equal(profile.status, 200);

    const jobs = [];
    for (const title of ['Conflict A', 'Conflict B', 'Conflict C', 'No Conflict']) {
        const response = await request('/api/jobs', 'POST', auth, { title, description: title, requirements: { requiredSkills: [] }, status: 'active' });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        jobs.push(response.data.data._id);
        const applied = await request('/api/applications', 'POST', student.token, { jobId: jobs.at(-1) });
        assert.equal(applied.status, 201, JSON.stringify(applied.data));
    }

    const createDrive = async (jobId, date, startTime, endTime, token = auth) => {
        const response = await request('/api/drives', 'POST', token, { jobId, date, startTime, endTime, mode: 'online' });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        return response.data.data._id;
    };
    const drives = [
        await createDrive(jobs[0], '2026-10-15', '10:00', '12:00'),
        await createDrive(jobs[1], '2026-10-15', '11:00', '13:00'),
        await createDrive(jobs[2], '2026-10-15', '11:30', '12:30'),
        await createDrive(jobs[3], '2026-10-16', '11:00', '13:00')
    ];
    const firstShortlist = await request(`/api/drives/${drives[0]}/shortlist`, 'POST', auth, { studentIds: [student.id] });
    assert.equal(firstShortlist.status, 200, JSON.stringify(firstShortlist.data));
    const candidatePreflight = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', auth, { studentIds: [student.id] });
    assert.equal(candidatePreflight.status, 200);
    assert.equal(candidatePreflight.data.data.conflictCount, 1);
    assert.equal((await request(`/api/drives/${drives[1]}/shortlist`, 'POST', auth, { studentIds: [student.id] })).status, 409);
    assert.equal((await request(`/api/drives/${drives[2]}/shortlist`, 'POST', auth, { studentIds: [student.id] })).status, 409);
    const fourthShortlist = await request(`/api/drives/${drives[3]}/shortlist`, 'POST', auth, { studentIds: [student.id] });
    assert.equal(fourthShortlist.status, 200, JSON.stringify(fourthShortlist.data));

    const checked = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', auth, {});
    assert.equal(checked.status, 200);
    assert.equal(checked.data.data.conflictCount, 0);
    const checkedWithCandidate = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', auth, { studentIds: [student.id] });
    assert.equal(checkedWithCandidate.data.data.conflictCount, 1);
    assert.equal(checkedWithCandidate.data.data.conflicts[0].student.name, 'Phase 9 Rahul');
    assert.equal(checkedWithCandidate.data.data.conflicts[0].type, 'student_time_overlap');
    assert.equal(checkedWithCandidate.data.data.conflicts[0].currentDrive.company, 'Phase Nine Corp');
    assert.equal(checkedWithCandidate.data.data.conflicts[0].currentDrive.role, 'Conflict B');
    const repeatedCheck = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', auth, {});
    assert.equal(repeatedCheck.data.data.conflictCount, checked.data.data.conflictCount);
    assert.deepEqual(repeatedCheck.data.data.conflicts.map((conflict) => `${conflict.type}:${conflict.studentId}:${[conflict.currentDrive.id, conflict.conflictingDrive.id].sort().join(':')}`).sort(),
        checked.data.data.conflicts.map((conflict) => `${conflict.type}:${conflict.studentId}:${[conflict.currentDrive.id, conflict.conflictingDrive.id].sort().join(':')}`).sort());
    const placementCheck = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', placementOfficer.token, {});
    assert.equal(placementCheck.status, 200);

    const clean = await request(`/api/drives/${drives[3]}/check-conflicts`, 'POST', auth, {});
    assert.equal(clean.status, 200);
    assert.equal(clean.data.data.conflictCount, 0);

    const forbidden = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', student.token, {});
    assert.equal(forbidden.status, 403);
    const notOwner = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', otherRecruiter.token, {});
    assert.equal(notOwner.status, 403);
    const unauthenticated = await request(`/api/drives/${drives[1]}/check-conflicts`, 'POST', null, {});
    assert.equal(unauthenticated.status, 401);
    const invalid = await request('/api/drives', 'POST', auth, { jobId: jobs[0], date: '2026-02-30', startTime: '10:00', endTime: '11:00', mode: 'online' });
    assert.equal(invalid.status, 400);

    const roomA = await request('/api/drives', 'POST', auth, { jobId: jobs[0], date: '2026-11-11', startTime: '10:00', endTime: '11:00', mode: 'offline', venue: 'Room C-101' });
    const roomBPayload = { jobId: jobs[1], date: '2026-11-11', startTime: '10:30', endTime: '11:30', mode: 'offline', venue: ' room c-101 ' };
    const roomBPreflight = await request('/api/drives/preflight', 'POST', auth, roomBPayload);
    const roomB = await request('/api/drives', 'POST', auth, roomBPayload);
    assert.equal(roomA.status, 201);
    assert.equal(roomBPreflight.data.data.conflictCount, 1);
    assert.equal(roomBPreflight.data.data.conflicts[0].type, 'venue_time_overlap');
    assert.equal(roomB.status, 409);

    console.log('Phase 9 API passed: student and venue conflicts, different dates, authorization, and invalid schedule validation.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
