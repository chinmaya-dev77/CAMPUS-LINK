'use strict';

require('dotenv').config();
const API_PORT = require('./test-isolation')();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Drive = require('./src/models/Drive');
const Notification = require('./src/models/Notification');

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

async function account(role, marker) {
    const email = `${role}_${marker}@example.test`;
    const registered = await request('/auth/register', { method: 'POST', body: { name: `Drive QA ${role}`, email, password: 'drive-qa-password', role } });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    const logged = await request('/auth/login', { method: 'POST', body: { email, password: 'drive-qa-password' } });
    assert.equal(logged.status, 200, JSON.stringify(logged.data));
    return { id: logged.data.data.user.id, token: logged.data.data.token };
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const marker = Date.now();
    const [recruiter, placement, student] = await Promise.all([
        account('recruiter', marker), account('placement', marker), account('student', marker)
    ]);
    const profile = await request(`/students/${student.id}`, { method: 'PATCH', token: student.token, body: {
        branch: 'CSE', cgpa: 8.4, backlogs: 0, skills: [{ name: 'JavaScript' }, { name: 'Node.js' }, { name: 'MongoDB' }],
        projects: [{ title: 'Campus application', technologies: ['JavaScript', 'Node.js', 'MongoDB'] }]
    } });
    assert.equal(profile.status, 200, JSON.stringify(profile.data));
    const recruiterProfile = await request(`/recruiters/${recruiter.id}`, { method: 'PATCH', token: recruiter.token, body: { companyName: 'Drive QA Company' } });
    assert.equal(recruiterProfile.status, 200, JSON.stringify(recruiterProfile.data));

    const createJob = async (title, requiredSkills) => {
        const result = await request('/jobs', { method: 'POST', token: recruiter.token, body: {
            title, description: `${title} drive management test`, status: 'active',
            requirements: { role: title, requiredSkills, preferredSkills: [], minimumCGPA: 7, eligibleBranches: ['CSE'] }
        } });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.data._id;
    };
    const webJobId = await createJob('Drive QA Web Engineer', ['JavaScript', 'Node.js']);
    const dataJobId = await createJob('Drive QA Data Analyst', ['Python', 'Pandas']);
    const createDrive = async (jobId, startTime, endTime) => {
        const result = await request('/drives', { method: 'POST', token: recruiter.token, body: {
            jobId, date: '2026-11-20', startTime, endTime, mode: 'online'
        } });
        return result;
    };

    const created = await createDrive(webJobId, '09:00', '11:00');
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const driveId = created.data.data._id;
    let driveDetail = await request(`/drives/${driveId}`, { token: recruiter.token });
    assert.equal(driveDetail.status, 200);
    assert.equal(driveDetail.data.data.addedCandidates.length, 0, 'drive creation must not add all eligible students');
    assert.equal(driveDetail.data.data.shortlistedCandidates.length, 0);
    assert.equal(driveDetail.data.data.eligibleCandidates.length, 0, 'eligible suggestions are computed and not stored as drive members');

    const ranked = await request(`/jobs/${webJobId}/candidates`, { token: recruiter.token });
    assert.equal(ranked.status, 200);
    assert.equal(ranked.data.data.length, 1);
    assert.equal(ranked.data.data[0].studentId, student.id);
    assert.equal(typeof ranked.data.data[0].matchScore, 'number');
    assert(ranked.data.data[0].explanation.facts.length > 0);
    const dataRanked = await request(`/jobs/${dataJobId}/candidates`, { token: recruiter.token });
    assert.equal(dataRanked.status, 200);
    assert.notEqual(ranked.data.data[0].matchScore, dataRanked.data.data[0].matchScore, 'same student receives a job-specific score');

    const preflight = await request('/drives/preflight', { method: 'POST', token: recruiter.token, body: { jobId: dataJobId, date: '2026-11-20', startTime: '10:00', endTime: '12:00', mode: 'online' } });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.data.data.conflicts[0].type, 'drive_time_overlap');
    assert.deepEqual(preflight.data.data.conflicts[0].overlap, { date: '2026-11-20', startTime: '10:00', endTime: '11:00' });
    const rejectedCreate = await createDrive(dataJobId, '10:00', '12:00');
    assert.equal(rejectedCreate.status, 409);
    assert.equal(rejectedCreate.data.error.code, 'DRIVE_TIME_CONFLICT');
    assert.equal(rejectedCreate.data.error.conflicts[0].existingDrive.role, 'Drive QA Web Engineer');
    assert.deepEqual(rejectedCreate.data.error.conflicts[0].overlap, { date: '2026-11-20', startTime: '10:00', endTime: '11:00' });
    assert.equal((await request('/drives', { token: recruiter.token })).data.data.length, 1, 'blocked drive is not persisted');
    assert.equal(await Notification.countDocuments({ userId: student.id, type: 'drive', message: /Drive QA Data Analyst/ }), 0, 'blocked drive does not send an announcement');

    const adjacent = await createDrive(webJobId, '11:00', '13:00');
    assert.equal(adjacent.status, 201, 'adjacent drive intervals are allowed');
    const adjacentId = adjacent.data.data._id;

    const wrongJobDrive = await createDrive(dataJobId, '13:00', '14:00');
    assert.equal(wrongJobDrive.status, 201, 'a different job can have a drive at an adjacent time');
    const noApplicantAdd = await request(`/drives/${wrongJobDrive.data.data._id}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(noApplicantAdd.status, 409);
    assert.equal(noApplicantAdd.data.error.code, 'APPLICATION_NOT_FOUND', 'profile eligibility alone cannot associate a candidate with another job drive');

    const applyWeb = await request('/applications', { method: 'POST', token: student.token, body: { jobId: webJobId } });
    assert.equal(applyWeb.status, 201, JSON.stringify(applyWeb.data));
    const webApplicationId = applyWeb.data.data.applicationId;
    const applicantMatches = await request(`/jobs/${webJobId}/candidates?includeIneligible=true&applicantsOnly=true`, { token: recruiter.token });
    assert.equal(applicantMatches.status, 200);
    assert.deepEqual(applicantMatches.data.data.map((candidate) => candidate.studentId), [student.id], 'applicant-only matching excludes students without an application to this job');

    // Simulate a pre-existing drive conflict that predates the creation guard.
    const legacy = await Drive.create({
        jobId: dataJobId, recruiterId: recruiter.id, companyName: 'Drive QA', role: 'Drive QA Legacy Data Analyst',
        date: new Date('2026-11-20T00:00:00.000Z'), startTime: '10:00', endTime: '12:00', mode: 'online', status: 'Scheduled'
    });
    const placementCheck = await request(`/drives/${driveId}/check-conflicts`, { method: 'POST', token: placement.token, body: {} });
    assert.equal(placementCheck.status, 200, JSON.stringify(placementCheck.data));
    const driveConflict = placementCheck.data.data.conflicts.find((item) => item.type === 'drive_time_overlap');
    assert(driveConflict, 'Placement conflict check finds pre-existing drive overlaps');
    assert.deepEqual(driveConflict.overlap, { date: '2026-11-20', startTime: '10:00', endTime: '11:00' });

    const manualAdd = await request(`/drives/${driveId}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(manualAdd.status, 200, JSON.stringify(manualAdd.data));
    assert.equal(manualAdd.data.data.addedCount, 1);
    assert.equal((await request(`/applications/${webApplicationId}`, { token: student.token })).data.data.status, 'Interview', 'drive add and application movement share one operation');
    const wrongDriveAssociation = await request(`/drives/${adjacentId}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(wrongDriveAssociation.status, 409);
    assert.equal(wrongDriveAssociation.data.error.code, 'CANDIDATE_ALREADY_ON_ANOTHER_DRIVE');
    const duplicateAdd = await request(`/drives/${driveId}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(duplicateAdd.data.data.addedCount, 0);
    driveDetail = await request(`/drives/${driveId}`, { token: recruiter.token });
    assert.equal(driveDetail.data.data.addedCandidates.length, 1);
    assert.equal(driveDetail.data.data.shortlistedCandidates.length, 1, 'interview roster and drive association stay synchronized');
    const removeManual = await request(`/drives/${driveId}/candidates/${student.id}`, { method: 'DELETE', token: recruiter.token });
    assert.equal(removeManual.status, 200, JSON.stringify(removeManual.data));
    const retainedAfterRemove = await request(`/applications/${webApplicationId}`, { token: student.token });
    assert.equal(retainedAfterRemove.status, 200);
    assert.equal(retainedAfterRemove.data.data.status, 'Shortlisted', 'removing an unscheduled interview returns the application to Shortlisted');
    assert.equal(retainedAfterRemove.data.data.driveId, undefined, 'removing clears only the drive association');
    const reAdd = await request(`/drives/${driveId}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(reAdd.status, 200);
    const interviewNotices = await Notification.find({ userId: student.id, eventKey: `application:${webApplicationId}:Interview:${driveId}` }).select('+eventKey').lean();
    assert.equal(interviewNotices.length, 1, 'the shared interview-stage notification is deduplicated');

    assert.equal((await request(`/applications/${webApplicationId}`, { token: student.token })).data.data.status, 'Interview', 're-adding returns to the same Interview state');
    assert.equal(await Notification.countDocuments({ userId: student.id, eventKey: `application:${webApplicationId}:Interview:${driveId}` }), 1, 'interview notifications are deduplicated across repeated adds');

    const applyData = await request('/applications', { method: 'POST', token: student.token, body: { jobId: dataJobId } });
    assert.equal(applyData.status, 201, JSON.stringify(applyData.data));
    // This persisted overlapping drive represents an older drive created before
    // the drive-level overlap guard. Candidate-level scheduling remains separate.
    const studentConflict = await request(`/drives/${legacy._id}/shortlist`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(studentConflict.status, 409);
    assert.equal(studentConflict.data.error.code, 'SCHEDULING_CONFLICT');
    assert.equal(studentConflict.data.error.conflicts[0].type, 'student_time_overlap');
    await Drive.updateOne({ _id: legacy._id }, { $set: { startTime: '11:00', endTime: '13:00' } });
    const adjacentCandidate = await request(`/drives/${legacy._id}/shortlist`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(adjacentCandidate.status, 200, JSON.stringify(adjacentCandidate.data));
    const interviewWithoutAppointment = await request(`/drives/${legacy._id}/candidates`, { method: 'POST', token: recruiter.token, body: { studentIds: [student.id] } });
    assert.equal(interviewWithoutAppointment.status, 200, JSON.stringify(interviewWithoutAppointment.data));
    assert.equal((await request(`/applications/${applyData.data.data.applicationId}`, { token: student.token })).data.data.status, 'Interview');

    const deleted = await request(`/drives/${legacy._id}`, { method: 'DELETE', token: recruiter.token });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
    assert.equal((await request(`/drives/${legacy._id}`, { token: recruiter.token })).status, 404);
    const retainedApplication = await request(`/applications/${applyData.data.data.applicationId}`, { token: student.token });
    assert.equal(retainedApplication.status, 200);
    assert.equal(retainedApplication.data.data.status, 'Shortlisted', 'deleting a drive without an actual scheduled interview safely returns the candidate to Shortlisted');
    assert.equal(retainedApplication.data.data.driveId, undefined, 'drive deletion removes only the drive association');
    assert.equal((await request(`/jobs/${dataJobId}`, { token: recruiter.token })).status, 200, 'deleting a drive preserves its job');
    const remainingConflicts = await request(`/drives/${driveId}/check-conflicts`, { method: 'POST', token: placement.token, body: {} });
    assert.equal(remainingConflicts.data.data.conflicts.some((item) => item.type === 'drive_time_overlap' && item.conflictingDrive?.id === String(legacy._id)), false);

    console.log('Drive management API checks passed: ranked job-specific suggestions, no automatic association, drive-time blocking/details, adjacent schedules, manual add and dedupe, candidate conflict separation, shortlist notifications, safe deletion, and retained jobs/applications.');
    await mongoose.disconnect();
}

main().catch(async (error) => { console.error(error); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
