const Application = require('../models/Application');
const Job = require('../models/Job');
const Student = require('../models/Student');
const Drive = require('../models/Drive');
const schedulingService = require('./scheduling/scheduling.service');
const matchingEngine = require('./matching/matching.engine');
const { notify } = require('./notification.service');

function driveEndTime(drive) {
    const dateKey = new Date(drive.date).toISOString().slice(0, 10);
    const time = /^\d{2}:\d{2}$/.test(drive.endTime || '') ? drive.endTime : '23:59';
    return new Date(`${dateKey}T${time}:00`);
}

const applicationTransitions = Object.freeze({
    Applied: ['Shortlisted', 'Rejected'],
    Eligible: ['Shortlisted', 'Rejected'],
    Ineligible: ['Rejected'],
    Shortlisted: ['Interview', 'Rejected'],
    Interview: ['Selected', 'Rejected'],
    Selected: [], Offer: [], Rejected: [], Withdrawn: [], Hired: []
});

const createApplication = async (studentUserId, jobId, driveId = null) => {
    // 1. Validate Job
    const job = await Job.findById(jobId);
    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (job.status !== 'active') {
        const err = new Error('Applications are only accepted for active jobs');
        err.status = 400;
        err.code = 'JOB_NOT_ACTIVE';
        throw err;
    }
    let initialDrive = null;
    if (driveId) {
        initialDrive = await Drive.findById(driveId);
        if (!initialDrive || String(initialDrive.jobId) !== String(job._id) || String(initialDrive.recruiterId) !== String(job.recruiterId)) {
            const err = new Error('An application can only be associated with a drive for the same job and recruiter.');
            err.status = 409; err.code = 'DRIVE_JOB_MISMATCH'; throw err;
        }
    }

    // 2. Validate Student Profile
    const student = await Student.findOne({ userId: studentUserId });
    if (!student) {
        const err = new Error('Student profile not found. Complete profile before applying.');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    // 3. Check if already applied
    const existingApp = await Application.findOne({ studentId: studentUserId, jobId });
    if (existingApp) {
        const err = new Error('Already applied to this job');
        err.status = 400;
        err.code = 'ALREADY_APPLIED';
        throw err;
    }

    // 4. Calculate Matching
    const matchResult = matchingEngine.matchStudentToJob(student, job);
    
    // Eligibility acts as a hard gate.
    let status = matchResult.eligible ? 'Applied' : 'Ineligible';

    // 5. Create Application
    const application = new Application({
        studentId: studentUserId,
        jobId: job._id,
        recruiterId: job.recruiterId,
        driveId: initialDrive?._id,
        status: status,
        eligibility: {
            isEligible: matchResult.eligible,
            reasons: matchResult.eligibilityIssues || []
        },
        matching: {
            finalScore: matchResult.matchScore,
            skillMatch: matchResult.breakdown.skillMatch,
            semanticMatch: matchResult.semanticSimilarity,
            projectRelevance: matchResult.breakdown.projectRelevance,
            academicFit: matchResult.breakdown.academicFit,
            assessmentEvidence: matchResult.breakdown.evidenceCoverage,
            rank: 0, // Defaults to 0, sorting handles actual rank
            strengths: matchResult.skillDetail.matchedRequired.concat(matchResult.skillDetail.matchedPreferred),
            skillGaps: matchResult.skillDetail.missingRequired.concat(matchResult.skillDetail.missingPreferred)
        }
    });

    await application.save();
    const jobLabel = job.requirements?.role || job.title;
    await notify(studentUserId, `Your application for ${jobLabel} has been submitted.`, 'application', { type: 'application', id: application._id }, `application:${application._id}:Applied`);
    return application;
};

const getApplicationById = async (appId) => {
    return await Application.findById(appId).populate('jobId', 'title companyName').populate('studentId', 'name email');
};

const getApplicationsForStudent = async (studentUserId) => {
    return await Application.find({ studentId: studentUserId })
        .populate('jobId', 'title companyName status')
        .populate('driveId', 'date startTime venue mode')
        .sort({ appliedAt: -1 });
};

const getApplicationsForJob = async (jobId) => {
    return await Application.find({ jobId })
        .populate('studentId', 'name email branch cgpa')
        .populate('driveId', 'companyName role date startTime endTime status')
        .sort({ 'matching.finalScore': -1 });
};

const getApplicationsForDrive = async (driveId) => {
    return await Application.find({ driveId })
        .populate('studentId', 'name email branch cgpa')
        .sort({ 'matching.finalScore': -1 });
};

const updateApplicationStatus = async (appId, newStatus, actor, { driveId } = {}) => {
    const app = await Application.findById(appId);
    if (!app) {
        const err = new Error('Application not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    const confirmedInterviewAdvance = newStatus === 'Interview' && ['Applied', 'Eligible'].includes(app.status);
    if (!Object.hasOwn(applicationTransitions, newStatus) || (!applicationTransitions[app.status]?.includes(newStatus) && !confirmedInterviewAdvance)) {
        const err = new Error(`Cannot change application status from ${app.status} to ${newStatus}`);
        err.status = 409;
        err.code = 'INVALID_TRANSITION';
        throw err;
    }
    if (newStatus === 'Shortlisted' && (!app.eligibility?.isEligible || ['Ineligible'].includes(app.status))) {
        const err = new Error('Ineligible candidates cannot be shortlisted');
        err.status = 409;
        err.code = 'INELIGIBLE_CANDIDATE';
        throw err;
    }
    if (actor?.role === 'recruiter' && app.recruiterId.toString() !== actor.id.toString()) {
        const err = new Error('Not authorized to update this application');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
    }
    let interviewDrive = null;
    let interviewDriveAlreadyContainedCandidate = false;
    let interviewDriveChanged = false;
    if (newStatus === 'Interview') {
        if (!app.eligibility?.isEligible) {
            const err = new Error('Only eligible applicants can move to Interview.'); err.status = 409; err.code = 'INELIGIBLE_CANDIDATE'; throw err;
        }
        const selectedDriveId = driveId || app.driveId?.toString();
        if (!selectedDriveId || !require('mongoose').isValidObjectId(selectedDriveId)) {
            const err = new Error('No interview drive exists for this candidate. Create an interview drive first.');
            err.status = 409; err.code = 'INTERVIEW_DRIVE_REQUIRED'; throw err;
        }
        interviewDrive = await Drive.findById(selectedDriveId);
        if (!interviewDrive || interviewDrive.jobId.toString() !== app.jobId.toString() || interviewDrive.recruiterId.toString() !== app.recruiterId.toString() || !['Scheduled', 'Ongoing'].includes(interviewDrive.status) || driveEndTime(interviewDrive) <= new Date()) {
            const err = new Error('Select an active interview drive for this job.');
            err.status = 409; err.code = 'INVALID_INTERVIEW_DRIVE'; throw err;
        }
        if (app.driveId && app.driveId.toString() !== interviewDrive._id.toString()) {
            const err = new Error('This application is already associated with another drive.'); err.status = 409; err.code = 'CANDIDATE_ALREADY_ON_ANOTHER_DRIVE'; throw err;
        }
        const members = new Set((interviewDrive.shortlistedCandidates || []).map((id) => id.toString()));
        interviewDriveAlreadyContainedCandidate = members.has(app.studentId.toString());
        interviewDriveChanged = !interviewDriveAlreadyContainedCandidate || !(interviewDrive.addedCandidates || []).some((id) => id.toString() === app.studentId.toString());
        members.add(app.studentId.toString());
        interviewDrive.shortlistedCandidates = [...members];
        interviewDrive.addedCandidates = [...new Set([...(interviewDrive.addedCandidates || []).map(String), app.studentId.toString()])];
        const conflicts = await schedulingService.checkDriveConflicts(interviewDrive);
        if (conflicts.length) {
            const err = new Error('This candidate has a scheduling conflict with the selected drive.');
            err.status = 409; err.code = 'SCHEDULING_CONFLICT'; err.conflicts = conflicts; throw err;
        }
    }
    app.status = newStatus;
    if (interviewDrive) app.driveId = interviewDrive._id;
    if (interviewDrive && interviewDriveChanged) await interviewDrive.save();
    try { await app.save(); }
    catch (error) {
        if (error.name === 'VersionError') {
            if (interviewDrive && interviewDriveChanged) {
                interviewDrive.shortlistedCandidates = interviewDrive.shortlistedCandidates.filter((id) => id.toString() !== app.studentId.toString());
                interviewDrive.addedCandidates = interviewDrive.addedCandidates.filter((id) => id.toString() !== app.studentId.toString());
                await interviewDrive.save().catch(() => {});
            }
            const conflict = new Error('This application changed in another request. Refresh and try again.');
            conflict.status = 409; conflict.code = 'CONCURRENT_UPDATE'; throw conflict;
        }
        if (interviewDrive && interviewDriveChanged) {
            interviewDrive.shortlistedCandidates = interviewDrive.shortlistedCandidates.filter((id) => id.toString() !== app.studentId.toString());
            interviewDrive.addedCandidates = interviewDrive.addedCandidates.filter((id) => id.toString() !== app.studentId.toString());
            await interviewDrive.save().catch(() => {});
        }
        throw error;
    }
    const job = await Job.findById(app.jobId).select('title requirements.role');
    const role = job?.requirements?.role || job?.title || 'your application';
    const messages = {
        Shortlisted: `Your application for ${role} has been shortlisted.`,
        Interview: null,
        Selected: `You have been selected for ${role}.`,
        Rejected: `Your application for ${role} has been closed.`
    };
    if (newStatus === 'Interview' && interviewDrive) {
        const date = new Date(interviewDrive.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        await notify(app.studentId, `You have moved to the interview stage for ${role}. Drive: ${date}, ${interviewDrive.startTime}–${interviewDrive.endTime}. Your individual interview appointment will be scheduled separately.`, 'interview', { type: 'drive', id: interviewDrive._id }, `application:${app._id}:Interview:${interviewDrive._id}`);
    } else if (messages[newStatus]) {
        await notify(app.studentId, messages[newStatus], 'application', { type: 'application', id: app._id }, `application:${app._id}:${newStatus}`);
    }
    return app;
};

async function scheduleInterview(appId, scheduledAt, actor) {
    const app = await Application.findById(appId);
    if (!app) { const err = new Error('Application not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err; }
    if (actor?.role !== 'recruiter' || app.recruiterId.toString() !== actor.id.toString()) { const err = new Error('Not authorized to schedule this interview'); err.status = 403; err.code = 'FORBIDDEN'; throw err; }
    if (app.status !== 'Interview' || !app.driveId) { const err = new Error('Add the candidate to an interview drive before scheduling an interview.'); err.status = 409; err.code = 'INTERVIEW_DRIVE_REQUIRED'; throw err; }
    const date = new Date(scheduledAt);
    if (!Number.isFinite(date.getTime()) || date <= new Date()) { const err = new Error('Choose a future interview date and time.'); err.status = 400; err.code = 'INVALID_SCHEDULE'; throw err; }
    const drive = await Drive.findOne({ _id: app.driveId, jobId: app.jobId, recruiterId: app.recruiterId });
    if (!drive || !['Scheduled', 'Ongoing'].includes(drive.status)) { const err = new Error('The candidate’s associated drive is unavailable.'); err.status = 409; err.code = 'INVALID_INTERVIEW_DRIVE'; throw err; }
    app.interviewScheduledAt = date;
    await app.save();
    const job = await Job.findById(app.jobId).select('title requirements.role');
    const role = job?.requirements?.role || job?.title || 'your application';
    await notify(app.studentId, `Your interview for ${role} is scheduled for ${date.toLocaleString('en-GB')}.`, 'interview', { type: 'application', id: app._id }, `application:${app._id}:interview-scheduled:${date.toISOString()}`);
    return app;
}

module.exports = {
    createApplication,
    getApplicationById,
    getApplicationsForStudent,
    getApplicationsForJob,
    getApplicationsForDrive,
    updateApplicationStatus,
    scheduleInterview,
    applicationTransitions
};
