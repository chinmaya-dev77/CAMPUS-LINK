'use strict';
require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const http = require('node:http');

const base = { hostname: 'localhost', port: API_PORT };
function request(path, method, token, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ ...base, path, method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, data: raw }); } });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    const tag = Date.now();
    async function user(name, role) {
        const email = `phase10_${tag}_${name}@test.com`;
        const created = await request('/api/auth/register', 'POST', null, { name, email, password: 'phase10-test', role });
        assert.equal(created.status, 201, JSON.stringify(created.data));
        const logged = await request('/api/auth/login', 'POST', null, { email, password: 'phase10-test' });
        return { id: logged.data.data.user.id, token: logged.data.data.token };
    }
    const recruiter = await user('recruiter', 'recruiter');
    const otherRecruiter = await user('other_recruiter', 'recruiter');
    const student = await user('student', 'student');
    const otherStudent = await user('other_student', 'student');
    const placement = await user('placement', 'placement');
    await request(`/api/recruiters/${recruiter.id}`, 'PATCH', recruiter.token, { companyName: 'Phase Ten Corp' });
    const jobResponse = await request('/api/jobs', 'POST', recruiter.token, { title: 'Platform Engineer', description: 'Phase 10 job', requirements: { role: 'Platform Engineer' }, status: 'active' });
    assert.equal(jobResponse.status, 201, JSON.stringify(jobResponse.data));
    const jobId = jobResponse.data.data._id;
    await request(`/api/students/${student.id}`, 'PATCH', student.token, { branch: 'CSE', cgpa: 8.5 });
    await request(`/api/students/${otherStudent.id}`, 'PATCH', otherStudent.token, { branch: 'CSE', cgpa: 8.5 });
    const application = async (person) => {
        const response = await request('/api/applications', 'POST', person.token, { jobId });
        assert.equal(response.status, 201, JSON.stringify(response.data));
        return response.data.data.applicationId;
    };
    const appId = await application(student);
    const otherAppId = await application(otherStudent);
    const interviewDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const interviewDrive = await request('/api/drives', 'POST', recruiter.token, { jobId, date: interviewDate, startTime: '10:00', endTime: '11:00', mode: 'online' });
    assert.equal(interviewDrive.status, 201, JSON.stringify(interviewDrive.data));
    const createPath = '/api/offers';
    let response = await request(createPath, 'POST', recruiter.token, { applicationId: appId, ctc: 800000 });
    assert.equal(response.status, 409, 'non-selected application must be rejected');
    response = await request(createPath, 'POST', recruiter.token, { applicationId: 'invalid', ctc: 1 });
    assert.equal(response.status, 400, 'invalid IDs must be rejected');
    response = await request(createPath, 'POST', student.token, { applicationId: appId, ctc: 800000 });
    assert.equal(response.status, 403, 'students cannot create offers');
    const advance = async (id) => {
        for (const status of ['Shortlisted', 'Interview', 'Selected']) {
            const moved = await request(`/api/applications/${id}/status`, 'PATCH', recruiter.token, { status, ...(status === 'Interview' ? { driveId: interviewDrive.data.data._id } : {}) });
            assert.equal(moved.status, 200, JSON.stringify(moved.data));
        }
    };
    await advance(appId);
    await advance(otherAppId);
    response = await request(createPath, 'POST', otherRecruiter.token, { applicationId: appId, ctc: 800000 });
    assert.equal(response.status, 403, 'recruiters cannot create offers for another recruiter\'s job');

    response = await request(createPath, 'POST', recruiter.token, { applicationId: appId, ctc: 800000 });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const offer = response.data.data;
    assert.equal(offer.offerStatus, 'Selected');
    assert.equal(offer.companyName, 'Phase Ten Corp');
    assert.equal(offer.joiningDate, undefined);
    const offerId = offer._id;
    response = await request(`/api/offers/${offerId}`, 'GET', otherRecruiter.token);
    assert.equal(response.status, 403, 'recruiters cannot view another recruiter\'s offer');
    response = await request(`/api/offers/${offerId}/status`, 'PATCH', placement.token, { status: 'Offer Generated' });
    assert.equal(response.status, 403, 'placement can monitor but cannot make recruiter offer decisions');
    response = await request(createPath, 'POST', recruiter.token, { applicationId: appId, ctc: 900000 });
    assert.equal(response.status, 409, 'duplicate offer must be rejected');
    response = await request(`/api/offers/${offerId}`, 'GET', student.token);
    assert.equal(response.status, 404, 'students cannot view unissued offer details');
    response = await request(`/api/offers/${offerId}`, 'GET', otherStudent.token);
    assert.equal(response.status, 403, 'other students cannot view this offer');
    response = await request(`/api/students/${student.id}/offers`, 'GET', student.token);
    assert.equal(response.status, 200);
    assert.equal(response.data.data.length, 0, 'unissued selected offers stay hidden from the student list');
    response = await request(`/api/students/${otherStudent.id}/offers`, 'GET', student.token);
    assert.equal(response.status, 403);
    response = await request(`/api/applications/${appId}/offer`, 'GET', student.token);
    assert.equal(response.status, 404, 'students cannot view an offer before it is sent');
    response = await request(`/api/offers/${offerId}`, 'GET', null);
    assert.equal(response.status, 401);

    response = await request(`/api/offers/${offerId}/joining-date`, 'PATCH', recruiter.token, { joiningDate: '2026-02-30' });
    assert.equal(response.status, 400, 'invalid calendar dates must be rejected');
    response = await request(`/api/offers/${offerId}/joining-date`, 'PATCH', otherRecruiter.token, { joiningDate: '2026-10-15' });
    assert.equal(response.status, 403, 'unrelated recruiters cannot update joining dates');
    response = await request(`/api/offers/${offerId}/joining-date`, 'PATCH', student.token, { joiningDate: '2026-10-15' });
    assert.equal(response.status, 403, 'students cannot update joining dates');

    const status = (value, token = recruiter.token) => request(`/api/offers/${offerId}/status`, 'PATCH', token, { status: value });
    response = await status('Joining Confirmed'); assert.equal(response.status, 409, 'invalid jumps must be rejected');
    response = await status('Not A Status'); assert.equal(response.status, 400, 'arbitrary status strings must be rejected');
    response = await status('Offer Generated'); assert.equal(response.status, 200);
    response = await request(`/api/offers/${offerId}/documents`, 'PATCH', recruiter.token, { documents: [{ name: 'Government ID' }, { name: 'PAN' }] });
    assert.equal(response.status, 200, 'the owner recruiter defines required documents');
    response = await status('Offer Sent'); assert.equal(response.status, 200);
    response = await request(`/api/offers/${offerId}`, 'GET', student.token); assert.equal(response.status, 200, 'student can view the sent offer');
    response = await status('Accepted', student.token); assert.equal(response.status, 200);
    assert.equal(response.data.data.offerStatus, 'Documentation Pending');
    response = await status('Accepted', recruiter.token); assert.equal(response.status, 403, 'recruiters cannot accept for students');
    response = await status('Documents Verified'); assert.equal(response.status, 409, 'submitted and verified files are required');
    response = await request(`/api/offers/${offerId}/documents`, 'PATCH', recruiter.token, { documents: [{ name: 'Government ID', status: 'Verified' }, { name: 'PAN', status: 'Verified' }] });
    assert.equal(response.status, 409, 'recruiter cannot mark documents verified without submissions');
    response = await request(`/api/offers/${offerId}/joining-date`, 'PATCH', recruiter.token, { joiningDate: '2026-10-15' });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.data.joiningDate.slice(0, 10), '2026-10-15');
    response = await status('Joining Confirmed'); assert.equal(response.status, 409, 'unverified documents block joining');
    response = await status('Pending'); assert.equal(response.status, 409, 'invalid statuses remain blocked');
    response = await request(`/api/offers/${offerId}/documents`, 'PATCH', otherStudent.token, { documents: [] });
    assert.equal(response.status, 403, 'students cannot manage requirements');
    console.log('Phase 10 API tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
