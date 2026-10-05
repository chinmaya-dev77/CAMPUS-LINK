'use strict';
require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const http = require('node:http');
const base = { hostname: 'localhost', port: API_PORT };

function request(path, method, token, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({ ...base, path, method, headers: { ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const raw = Buffer.concat(chunks);
                try { resolve({ status: response.statusCode, data: JSON.parse(raw.toString()), raw }); }
                catch { resolve({ status: response.statusCode, data: raw.toString(), raw }); }
            });
        });
        request.on('error', reject);
        if (body) request.write(Buffer.isBuffer(body) ? body : JSON.stringify(body));
        request.end();
    });
}

function upload(path, token, name = 'identity.pdf') {
    const boundary = `campuslink_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
        Buffer.from('%PDF-1.4\nCampusLink isolated workflow fixture\n%%EOF'),
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    return request(path, 'POST', token, body, { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length });
}

async function main() {
    const tag = Date.now();
    async function user(label, role) {
        const email = `workflow_${tag}_${label}@test.com`;
        const created = await request('/api/auth/register', 'POST', null, { name: label, email, password: 'workflow-test-pass', role });
        assert.equal(created.status, 201, JSON.stringify(created.data));
        const logged = await request('/api/auth/login', 'POST', null, { email, password: 'workflow-test-pass' });
        assert.equal(logged.status, 200);
        return { id: logged.data.data.user.id, token: logged.data.data.token };
    }
    const recruiter = await user('Recruiter', 'recruiter');
    const otherRecruiter = await user('OtherRecruiter', 'recruiter');
    const placement = await user('Placement', 'placement');
    const student = await user('Student', 'student');
    const secondStudent = await user('SecondStudent', 'student');
    const rejectedStudent = await user('RejectedStudent', 'student');
    const changingEligibilityStudent = await user('EligibilityRefreshStudent', 'student');
    await request(`/api/recruiters/${recruiter.id}`, 'PATCH', recruiter.token, { companyName: 'Workflow Labs' });
    const profile = { branch: 'CSE', cgpa: 8.6, backlogs: 0, skills: [{ name: 'JavaScript' }], projects: [{ title: 'Campus app', technologies: ['JavaScript'] }] };
    for (const person of [student, secondStudent, rejectedStudent]) assert.equal((await request(`/api/students/${person.id}`, 'PATCH', person.token, profile)).status, 200);
    assert.equal((await request(`/api/students/${student.id}/resume`, 'DELETE', secondStudent.token)).status, 403);
    assert.equal((await request(`/api/students/${student.id}/resume`, 'DELETE', placement.token)).status, 403);
    const jobResult = await request('/api/jobs', 'POST', recruiter.token, { title: 'Software Engineer Intern', description: 'Workflow test job', status: 'active', requirements: { role: 'Software Engineer Intern', minimumCGPA: 7, eligibleBranches: ['CSE'] } });
    assert.equal(jobResult.status, 201, JSON.stringify(jobResult.data));
    const jobId = jobResult.data.data._id;
    const driveDraft = { jobId, date: '2026-10-15', startTime: '10:00', endTime: '11:00', mode: 'offline', venue: 'Training Room 1' };
    assert.equal((await request('/api/drives/preflight', 'POST', recruiter.token, { ...driveDraft, endTime: '09:00' })).status, 400, 'invalid drive intervals are rejected before save');
    assert.equal((await request('/api/drives/preflight', 'POST', placement.token, driveDraft)).status, 403, 'only a job owner recruiter can preflight a drive');
    const clearDriveCheck = await request('/api/drives/preflight', 'POST', recruiter.token, driveDraft);
    assert.equal(clearDriveCheck.status, 200, JSON.stringify(clearDriveCheck.data));
    assert.equal(clearDriveCheck.data.data.conflictCount, 0);
    const createdDrive = await request('/api/drives', 'POST', recruiter.token, driveDraft);
    assert.equal(createdDrive.status, 201);
    const recruiterDrives = await request('/api/drives', 'GET', recruiter.token);
    const placementDrives = await request('/api/drives', 'GET', placement.token);
    assert(recruiterDrives.data.data.some((drive) => drive._id === createdDrive.data.data._id));
    assert(placementDrives.data.data.some((drive) => drive._id === createdDrive.data.data._id));
    assert.equal((await request('/api/drives', 'POST', placement.token, driveDraft)).status, 403);
    assert.equal((await request(`/api/drives/${createdDrive.data.data._id}/shortlist`, 'POST', placement.token, { studentIds: [] })).status, 403);
    const venueConflict = await request('/api/drives/preflight', 'POST', recruiter.token, driveDraft);
    assert.equal(venueConflict.status, 200);
    assert.equal(venueConflict.data.data.conflicts[0].type, 'venue_time_overlap');
    async function apply(person) {
        const result = await request('/api/applications', 'POST', person.token, { jobId });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.data.applicationId;
    }
    async function assertRecruiterPipelineStatus(applicationId, status) {
        const response = await request(`/api/jobs/${jobId}/applications`, 'GET', recruiter.token);
        assert.equal(response.status, 200, JSON.stringify(response.data));
        const matching = response.data.data.filter((application) => application._id === applicationId);
        assert.equal(matching.length, 1, `${applicationId} should appear exactly once in recruiter applications`);
        assert.equal(matching[0].status, status);
    }
    const appId = await apply(student), secondAppId = await apply(secondStudent), rejectedAppId = await apply(rejectedStudent);
    await assertRecruiterPipelineStatus(appId, 'Applied');
    await request(`/api/students/${changingEligibilityStudent.id}`, 'PATCH', changingEligibilityStudent.token, { branch: 'Mechanical', cgpa: 5, backlogs: 3 });
    const eligibilityApplication = await apply(changingEligibilityStudent);
    const assertEligibilityEverywhere = async (eligible) => {
        const expected = eligible ? 'Applied' : 'Ineligible';
        const studentApps = await request(`/api/students/${changingEligibilityStudent.id}/applications`, 'GET', changingEligibilityStudent.token);
        const recruiterApps = await request(`/api/jobs/${jobId}/applications`, 'GET', recruiter.token);
        const placementApps = await request('/api/applications', 'GET', placement.token);
        const studentApp = studentApps.data.data.find((app) => app._id === eligibilityApplication);
        const recruiterApp = recruiterApps.data.data.find((app) => app._id === eligibilityApplication);
        const placementApp = placementApps.data.data.find((app) => app._id === eligibilityApplication);
        for (const app of [studentApp, recruiterApp, placementApp]) {
            assert.equal(app.status, expected);
            assert.equal(app.eligibility.isEligible, eligible);
        }
        const candidates = await request(`/api/jobs/${jobId}/candidates?includeIneligible=true`, 'GET', recruiter.token);
        assert.equal(candidates.data.data.find((candidate) => candidate.studentId === changingEligibilityStudent.id).eligible, eligible);
    };
    await assertEligibilityEverywhere(false);
    await request(`/api/students/${changingEligibilityStudent.id}`, 'PATCH', changingEligibilityStudent.token, { branch: 'CSE', cgpa: 8.6, backlogs: 0 });
    await assertEligibilityEverywhere(true);
    await request(`/api/students/${changingEligibilityStudent.id}`, 'PATCH', changingEligibilityStudent.token, { branch: 'Mechanical', cgpa: 5, backlogs: 3 });
    await assertEligibilityEverywhere(false);
    await request(`/api/students/${changingEligibilityStudent.id}`, 'PATCH', changingEligibilityStudent.token, { branch: 'CSE', cgpa: 8.6, backlogs: 0 });
    const driveCandidates = await request(`/api/drives/${createdDrive.data.data._id}/check-conflicts`, 'POST', recruiter.token, { studentIds: [changingEligibilityStudent.id] });
    assert.equal(driveCandidates.status, 200);
    const driveShortlist = await request(`/api/drives/${createdDrive.data.data._id}/shortlist`, 'POST', recruiter.token, { studentIds: [changingEligibilityStudent.id] });
    assert.equal(driveShortlist.status, 200, JSON.stringify(driveShortlist.data));
    assert.equal((await request(`/api/drives/${createdDrive.data.data._id}`, 'GET', placement.token)).data.data.shortlistedCandidates.length, 1);
    assert.equal((await request(`/api/applications/${eligibilityApplication}/status`, 'PATCH', placement.token, { status: 'Rejected' })).status, 403);
    assert.equal((await request('/api/notifications', 'GET', student.token)).data.data[0].type, 'application');
    assert.equal((await request(`/api/applications/${appId}/status`, 'PATCH', placement.token, { status: 'Shortlisted' })).status, 403);
    assert.equal((await request(`/api/applications/${appId}/status`, 'PATCH', recruiter.token, { status: 'Joining Confirmed' })).status, 409);

    async function advanceToSelected(id) {
        for (const status of ['Shortlisted', 'Interview', 'Selected']) {
            const response = await request(`/api/applications/${id}/status`, 'PATCH', recruiter.token, { status, ...(status === 'Interview' ? { driveId: createdDrive.data.data._id } : {}) });
            assert.equal(response.status, 200, `${status}: ${JSON.stringify(response.data)}`);
        }
    }
    await request(`/api/applications/${appId}/status`, 'PATCH', recruiter.token, { status: 'Shortlisted' });
    await assertRecruiterPipelineStatus(appId, 'Shortlisted');
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.message.includes('shortlisted')));
    await request(`/api/applications/${appId}/status`, 'PATCH', recruiter.token, { status: 'Interview', driveId: createdDrive.data.data._id });
    await assertRecruiterPipelineStatus(appId, 'Interview');
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.message.includes('interview stage')));
    await request(`/api/applications/${appId}/status`, 'PATCH', recruiter.token, { status: 'Selected' });
    await assertRecruiterPipelineStatus(appId, 'Selected');
    await assertRecruiterPipelineStatus(appId, 'Selected'); // reload fetch returns the same single application
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.message.includes('selected')));
    await advanceToSelected(secondAppId);

    const requiredDocuments = ['Government ID', 'PAN', 'Degree certificate'].map((name) => ({ name, required: true }));
    let offerResponse = await request('/api/offers', 'POST', recruiter.token, { applicationId: appId, ctc: 950000, documents: requiredDocuments });
    assert.equal(offerResponse.status, 201, JSON.stringify(offerResponse.data));
    const offerId = offerResponse.data.data._id;
    await assertRecruiterPipelineStatus(appId, 'Offer');
    assert.equal(offerResponse.data.data.documents.length, 3);
    assert.equal((await request(`/api/offers/${offerId}/ctc`, 'PATCH', recruiter.token, { ctc: 975000 })).status, 200, 'CTC can be edited before the offer is sent');
    assert.equal((await request(`/api/offers/${offerId}/ctc`, 'PATCH', recruiter.token, { ctc: -1 })).status, 400, 'negative CTC is rejected');
    assert.equal((await request(`/api/offers/${offerId}/ctc`, 'PATCH', otherRecruiter.token, { ctc: 1000000 })).status, 403, 'only the owning recruiter can edit CTC');
    assert.equal((await request(`/api/offers/${offerId}`, 'GET', recruiter.token)).data.data.ctc, 975000, 'CTC persists in the offer record');
    assert.equal((await request(`/api/offers/${offerId}`, 'GET', student.token)).status, 404, 'student cannot view an offer before it is sent');
    const placementOffersBeforeSend = await request('/api/offers', 'GET', placement.token);
    assert.equal(placementOffersBeforeSend.status, 200, JSON.stringify(placementOffersBeforeSend.data));
    assert.equal(placementOffersBeforeSend.data.data.find((item) => item._id === offerId).documents[0].storedFileName, undefined);
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', placement.token, { status: 'Offer Generated' })).status, 403);
    assert.equal((await request('/api/offers', 'POST', otherRecruiter.token, { applicationId: appId, ctc: 950000 })).status, 403);
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status: 'Accepted' })).status, 403);
    for (const status of ['Offer Generated', 'Offer Sent']) assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status })).status, 200);
    assert.equal((await request(`/api/offers/${offerId}/ctc`, 'PATCH', recruiter.token, { ctc: 1000000 })).status, 409, 'CTC locks after the offer is sent');
    assert.equal((await request(`/api/offers/${offerId}`, 'GET', student.token)).status, 200, 'student can see the offer after it is sent');
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.message.includes('offer')));
    offerResponse = await request(`/api/offers/${offerId}/status`, 'PATCH', student.token, { status: 'Accepted' });
    assert.equal(offerResponse.status, 200);
    assert.equal(offerResponse.data.data.offerStatus, 'Documentation Pending');
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', student.token, { status: 'Joining Confirmed' })).status, 403);
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status: 'Documents Verified' })).status, 409);

    const wrongOwnerUpload = await upload(`/api/offers/${offerId}/documents/0/upload`, secondStudent.token);
    assert.equal(wrongOwnerUpload.status, 403);
    assert.equal((await request(`/api/offers/${offerId}/documents/0`, 'DELETE', secondStudent.token)).status, 403);
    for (let index = 0; index < 3; index++) {
        const result = await upload(`/api/offers/${offerId}/documents/${index}/upload`, student.token, `document-${index}.pdf`);
        assert.equal(result.status, 200, JSON.stringify(result.data));
    }
    const submitted = await request(`/api/offers/${offerId}`, 'GET', recruiter.token);
    assert.equal(submitted.data.data.documents.filter((doc) => doc.hasFile).length, 3);
    assert.equal((await request(`/api/offers/${offerId}/documents/0/file`, 'GET', placement.token)).status, 403);
    assert.equal((await request(`/api/offers/${offerId}/documents/0/file`, 'GET', otherRecruiter.token)).status, 403);
    assert.equal((await request(`/api/offers/${offerId}/documents/0/status`, 'PATCH', recruiter.token, { status: 'Rejected' })).status, 400);
    const rejectedDoc = await request(`/api/offers/${offerId}/documents/0/status`, 'PATCH', recruiter.token, { status: 'Rejected', reason: 'Image is not clear' });
    assert.equal(rejectedDoc.status, 200);
    assert.equal(rejectedDoc.data.data.documents[0].rejectionReason, 'Image is not clear');
    assert.equal(rejectedDoc.data.data.documents[0].verificationStatus, 'REJECTED');
    assert.equal(rejectedDoc.data.data.documents[0].verificationMethod, 'MANUAL');
    assert.notEqual(rejectedDoc.data.data.offerStatus, 'Documents Verified', 'rejected documents do not advance the offer');
    const rejectedOfferForStudent = await request(`/api/offers/${offerId}`, 'GET', student.token);
    assert.equal(rejectedOfferForStudent.data.data.documents[0].rejectionReason, 'Image is not clear');
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.message.includes('Government ID') && item.message.includes('resubmitted')));
    const deletedRejectedDocument = await request(`/api/offers/${offerId}/documents/0`, 'DELETE', student.token);
    assert.equal(deletedRejectedDocument.status, 200);
    assert.equal(deletedRejectedDocument.data.data.documents[0].hasFile, false);
    assert.equal((await upload(`/api/offers/${offerId}/documents/0/upload`, student.token, 'government-id.pdf')).status, 200);
    for (let index = 0; index < 2; index++) {
        const reviewed = await request(`/api/offers/${offerId}/documents/${index}/status`, 'PATCH', recruiter.token, { status: 'Verified' });
        assert.equal(reviewed.status, 200);
        assert.equal(reviewed.data.data.offerStatus, 'Documentation Pending');
        assert.equal(reviewed.data.data.documents[index].verificationStatus, 'VERIFIED');
        assert.equal(reviewed.data.data.documents[index].verificationMethod, 'MANUAL');
    }
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status: 'Joining Confirmed' })).status, 409);
    const finalDoc = await request(`/api/offers/${offerId}/documents/2/status`, 'PATCH', recruiter.token, { status: 'Verified' });
    assert.equal(finalDoc.data.data.offerStatus, 'Documents Verified');
    assert.equal(finalDoc.data.data.documents[2].verificationStatus, 'VERIFIED');
    assert.equal(finalDoc.data.data.documents[2].verificationMethod, 'MANUAL');
    const placementView = await request(`/api/offers/${offerId}`, 'GET', placement.token);
    assert.equal(placementView.data.data.documents.every((doc) => doc.verificationStatus === 'VERIFIED'), true, 'placement reads the same persisted document state');
    assert.equal((await request(`/api/offers/${offerId}/documents/1`, 'DELETE', student.token)).status, 409, 'verified documents are locked');
    assert.equal((await request(`/api/offers/${offerId}/joining-date`, 'PATCH', recruiter.token, { joiningDate: '2026-10-15' })).status, 200);
    const joined = await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status: 'Joining Confirmed' });
    assert.equal(joined.status, 200);
    await assertRecruiterPipelineStatus(appId, 'Hired');
    assert.equal((await request(`/api/applications/${appId}`, 'GET', student.token)).data.data.status, 'Hired');
    assert((await request('/api/notifications', 'GET', student.token)).data.data.some((item) => item.type === 'joining'));
    assert.equal((await request(`/api/offers/${offerId}/status`, 'PATCH', recruiter.token, { status: 'Pending' })).status, 409);

    const declinedOffer = await request('/api/offers', 'POST', recruiter.token, { applicationId: secondAppId, ctc: 600000, documents: [{ name: 'Government ID' }] });
    assert.equal(declinedOffer.status, 201);
    for (const status of ['Offer Generated', 'Offer Sent']) assert.equal((await request(`/api/offers/${declinedOffer.data.data._id}/status`, 'PATCH', recruiter.token, { status })).status, 200);
    const declined = await request(`/api/offers/${declinedOffer.data.data._id}/status`, 'PATCH', secondStudent.token, { status: 'Declined' });
    assert.equal(declined.status, 200);
    assert.equal(declined.data.data.offerStatus, 'Declined');
    assert.equal((await request(`/api/applications/${secondAppId}`, 'GET', secondStudent.token)).data.data.status, 'Rejected');
    assert.equal((await request(`/api/offers/${declinedOffer.data.data._id}/status`, 'PATCH', recruiter.token, { status: 'Pending' })).status, 409);
    await request(`/api/applications/${rejectedAppId}/status`, 'PATCH', recruiter.token, { status: 'Rejected' });
    await assertRecruiterPipelineStatus(rejectedAppId, 'Rejected');
    await assertRecruiterPipelineStatus(rejectedAppId, 'Rejected'); // reload fetch keeps the terminal application visible
    assert.equal((await request(`/api/applications/${rejectedAppId}/status`, 'PATCH', recruiter.token, { status: 'Shortlisted' })).status, 409);

    const unauthorizedRead = await request(`/api/notifications/${(await request('/api/notifications', 'GET', student.token)).data.data[0]._id}/read`, 'PATCH', secondStudent.token, {});
    assert.equal(unauthorizedRead.status, 404);
    assert.equal((await request('/api/notifications', 'GET', null)).status, 401);
    assert.equal((await request('/api/students', 'GET', recruiter.token)).status, 403);
    assert.equal((await request('/api/students', 'GET', placement.token)).status, 200);
    console.log('Recruitment workflow API test passed: application transitions, offer decisions, document submission/verification, terminal states, notifications, and authorization.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
