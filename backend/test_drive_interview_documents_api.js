'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const API_PORT = require('./test-isolation')();

async function request(path, { method = 'GET', token, body, file } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (file) {
        const boundary = `campuslink_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`);
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
        body = Buffer.concat([prefix, file.bytes, suffix]);
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        headers['Content-Length'] = body.length;
    } else if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${API_PORT}/api${path}`, { method, headers, ...(body ? { body: file ? body : JSON.stringify(body) } : {}) });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try { data = JSON.parse(bytes.toString()); } catch { data = null; }
    return { status: response.status, data, headers: response.headers, bytes };
}

async function createUser(name, role, marker) {
    const email = `${role}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${marker}@example.test`;
    const registered = await request('/auth/register', { method: 'POST', body: { name, email, password: 'drive-document-test', role } });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    const login = await request('/auth/login', { method: 'POST', body: { email, password: 'drive-document-test' } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    return { ...login.data.data.user, token: login.data.data.token };
}

async function main() {
    const marker = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [recruiter, otherRecruiter, placement, student, otherStudent] = await Promise.all([
        createUser('Drive Recruiter', 'recruiter', marker), createUser('Other Recruiter', 'recruiter', marker),
        createUser('Placement QA', 'placement', marker), createUser('Candidate One', 'student', marker), createUser('Candidate Two', 'student', marker)
    ]);
    for (const person of [student, otherStudent]) {
        const result = await request(`/students/${person.id}`, { method: 'PATCH', token: person.token, body: { branch: 'CSE', cgpa: 8.5, backlogs: 0 } });
        assert.equal(result.status, 200, JSON.stringify(result.data));
    }
    assert.equal((await request(`/recruiters/${recruiter.id}`, { method: 'PATCH', token: recruiter.token, body: { companyName: 'Drive Docs QA' } })).status, 200);
    const jobResult = await request('/jobs', { method: 'POST', token: recruiter.token, body: { title: 'Drive QA Engineer', description: 'Interview flow test', status: 'active', requirements: { role: 'Engineer', eligibleBranches: ['CSE'], minimumCGPA: 7 } } });
    assert.equal(jobResult.status, 201, JSON.stringify(jobResult.data));
    const jobId = jobResult.data.data._id;
    const createApplication = async (person) => {
        const result = await request('/applications', { method: 'POST', token: person.token, body: { jobId } });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.data.applicationId;
    };
    const appId = await createApplication(student);
    assert.equal((await request(`/applications/${appId}/status`, { method: 'PATCH', token: recruiter.token, body: { status: 'Shortlisted' } })).status, 200);
    const noDrive = await request(`/applications/${appId}/status`, { method: 'PATCH', token: recruiter.token, body: { status: 'Interview' } });
    assert.equal(noDrive.status, 409);
    assert.match(noDrive.data.error.message, /No interview drive exists/);
    assert.equal((await request(`/applications/${appId}`, { token: student.token })).data.data.status, 'Shortlisted');

    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const driveResult = await request('/drives', { method: 'POST', token: recruiter.token, body: { jobId, date, startTime: '10:00', endTime: '11:00', mode: 'online', venue: 'https://meet.example.test/qa' } });
    assert.equal(driveResult.status, 201, JSON.stringify(driveResult.data));
    const driveId = driveResult.data.data._id;
    const interview = await request(`/applications/${appId}/status`, { method: 'PATCH', token: recruiter.token, body: { status: 'Interview', driveId } });
    assert.equal(interview.status, 200, JSON.stringify(interview.data));
    assert.equal(interview.data.data.status, 'Interview');
    let driveDetail = await request(`/drives/${driveId}`, { token: recruiter.token });
    assert(driveDetail.data.data.shortlistedCandidates.some((candidate) => String(candidate._id) === String(student.id)));
    assert.equal((await request(`/drives/${driveId}/candidates/${student.id}`, { method: 'DELETE', token: placement.token })).status, 403);
    const scheduledInterview = await request(`/applications/${appId}/interview-schedule`, { method: 'PATCH', token: recruiter.token, body: { scheduledAt: '2026-10-08T10:15:00+05:30' } });
    assert.equal(scheduledInterview.status, 200, JSON.stringify(scheduledInterview.data));
    assert(scheduledInterview.data.data.interviewScheduledAt, 'actual interview appointment is recorded separately from drive membership');
    const deleteScheduledDrive = await request(`/drives/${driveId}`, { method: 'DELETE', token: recruiter.token });
    assert.equal(deleteScheduledDrive.status, 409);
    assert.equal(deleteScheduledDrive.data.error.code, 'DRIVE_IN_USE');
    assert.match(deleteScheduledDrive.data.error.message, /interview scheduled/i);
    const removeInterviewCandidate = await request(`/drives/${driveId}/candidates/${student.id}`, { method: 'DELETE', token: recruiter.token });
    assert.equal(removeInterviewCandidate.status, 409, JSON.stringify(removeInterviewCandidate.data));
    assert.equal(removeInterviewCandidate.data.error.code, 'CANDIDATE_LOCKED', 'interview history protects the drive association');
    assert.equal((await request(`/applications/${appId}`, { token: student.token })).data.data.status, 'Interview');

    const secondAppId = await createApplication(otherStudent);
    assert.equal((await request(`/applications/${secondAppId}/status`, { method: 'PATCH', token: recruiter.token, body: { status: 'Shortlisted' } })).status, 200);
    assert.equal((await request(`/drives/${driveId}/shortlist`, { method: 'POST', token: recruiter.token, body: { studentIds: [otherStudent.id] } })).status, 200);
    assert.equal((await request(`/applications/${secondAppId}`, { token: otherStudent.token })).data.data.status, 'Shortlisted');
    assert.equal((await request(`/drives/${driveId}/candidates/${otherStudent.id}`, { method: 'DELETE', token: recruiter.token })).status, 200);
    driveDetail = await request(`/drives/${driveId}`, { token: recruiter.token });
    assert.equal(driveDetail.data.data.shortlistedCandidates.length, 1, 'the interviewed candidate remains associated with the drive');
    assert.equal(String(driveDetail.data.data.shortlistedCandidates[0]._id), String(student.id));
    assert.equal((await request(`/applications/${secondAppId}`, { token: otherStudent.token })).data.data.status, 'Shortlisted');

    for (const status of ['Selected']) {
        const changed = await request(`/applications/${appId}/status`, { method: 'PATCH', token: recruiter.token, body: { status } });
        assert.equal(changed.status, 200, JSON.stringify(changed.data));
    }
    const fileCases = [
        { name: 'id.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\nQA\n%%EOF') },
        { name: 'pan.jpg', type: 'image/jpg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
        { name: 'passport.jpeg', type: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
        { name: 'degree.png', type: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
        { name: 'marksheet.webp', type: 'image/webp', bytes: Buffer.from('RIFF0000WEBP') }
    ];
    const offerResult = await request('/offers', { method: 'POST', token: recruiter.token, body: { applicationId: appId, ctc: 750000, documents: fileCases.map((_, index) => ({ name: `Document ${index + 1}` })) } });
    assert.equal(offerResult.status, 201, JSON.stringify(offerResult.data));
    const offerId = offerResult.data.data._id;
    for (const status of ['Offer Generated', 'Offer Sent']) assert.equal((await request(`/offers/${offerId}/status`, { method: 'PATCH', token: recruiter.token, body: { status } })).status, 200);
    assert.equal((await request(`/offers/${offerId}/status`, { method: 'PATCH', token: student.token, body: { status: 'Accepted' } })).status, 200);
    for (const [index, file] of fileCases.entries()) {
        const uploaded = await request(`/offers/${offerId}/documents/${index}/upload`, { method: 'POST', token: student.token, file });
        assert.equal(uploaded.status, 200, `${file.name}: ${JSON.stringify(uploaded.data)}`);
        assert.equal(uploaded.data.data.documents[index].contentType, file.type === 'image/jpg' ? 'image/jpeg' : file.type);
    }
    const imagePreview = await request(`/offers/${offerId}/documents/1/file`, { token: student.token });
    assert.equal(imagePreview.status, 200);
    assert.equal(imagePreview.headers.get('content-type'), 'image/jpeg');
    assert.match(imagePreview.headers.get('content-disposition'), /^inline;/);
    const pdfPreview = await request(`/offers/${offerId}/documents/0/file`, { token: student.token });
    assert.equal(pdfPreview.status, 200);
    assert.equal(pdfPreview.headers.get('content-type'), 'application/pdf');
    assert.match(pdfPreview.headers.get('content-disposition'), /^inline;/);
    const pdfDownload = await request(`/offers/${offerId}/documents/0/file?download=1`, { token: recruiter.token });
    assert.equal(pdfDownload.status, 200);
    assert.match(pdfDownload.headers.get('content-disposition'), /^attachment;/);
    assert.equal((await request(`/offers/${offerId}/documents/1/file`, { token: otherStudent.token })).status, 403);
    assert.equal((await request(`/offers/${offerId}/documents/1/file`, { token: otherRecruiter.token })).status, 403);
    assert.equal((await request(`/offers/${offerId}/documents/1/file`, { token: placement.token })).status, 403);
    const unsupported = await request(`/offers/${offerId}/documents/0/upload`, { method: 'POST', token: student.token, file: { name: 'bad.html', type: 'text/html', bytes: Buffer.from('<html>') } });
    assert.equal(unsupported.status, 400);
    const unsupportedExecutable = await request(`/offers/${offerId}/documents/0/upload`, { method: 'POST', token: student.token, file: { name: 'bad.exe', type: 'application/octet-stream', bytes: Buffer.from('MZ') } });
    assert.equal(unsupportedExecutable.status, 400);
    const falsePng = await request(`/offers/${offerId}/documents/0/upload`, { method: 'POST', token: student.token, file: { name: 'fake.png', type: 'image/png', bytes: Buffer.from('not a png') } });
    assert.equal(falsePng.status, 400);
    for (let index = 0; index < fileCases.length; index++) {
        const removed = await request(`/offers/${offerId}/documents/${index}`, { method: 'DELETE', token: student.token });
        assert.equal(removed.status, 200, JSON.stringify(removed.data));
    }
    console.log('Interview drive and document API checks passed: drive-gated interview, drive-only removal, PDF/JPG/JPEG/PNG/WebP uploads, preview/download headers, unsupported content rejection, and access controls.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
