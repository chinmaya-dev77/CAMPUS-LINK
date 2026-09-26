const Application = require('../models/Application');
const Job = require('../models/Job');
const Student = require('../models/Student');
const matchingEngine = require('./matching/matching.engine');

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
        driveId: driveId,
        status: status,
        eligibility: {
            isEligible: matchResult.eligible,
            reasons: matchResult.eligibilityIssues || []
        },
        matching: {
            finalScore: matchResult.matchScore,
            skillMatch: matchResult.breakdown.skillMatch,
            semanticMatch: 0, // not used in Phase 7/8
            projectRelevance: matchResult.breakdown.projectRelevance,
            academicFit: matchResult.breakdown.academicFit,
            assessmentEvidence: matchResult.breakdown.evidenceCoverage,
            rank: 0, // Defaults to 0, sorting handles actual rank
            strengths: matchResult.skillDetail.matchedRequired.concat(matchResult.skillDetail.matchedPreferred),
            skillGaps: matchResult.skillDetail.missingRequired.concat(matchResult.skillDetail.missingPreferred)
        }
    });

    await application.save();
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
        .sort({ 'matching.finalScore': -1 });
};

const getApplicationsForDrive = async (driveId) => {
    return await Application.find({ driveId })
        .populate('studentId', 'name email branch cgpa')
        .sort({ 'matching.finalScore': -1 });
};

const updateApplicationStatus = async (appId, newStatus) => {
    const app = await Application.findById(appId);
    if (!app) {
        const err = new Error('Application not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    app.status = newStatus;
    await app.save();
    return app;
};

module.exports = {
    createApplication,
    getApplicationById,
    getApplicationsForStudent,
    getApplicationsForJob,
    getApplicationsForDrive,
    updateApplicationStatus
};
