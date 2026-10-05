const Drive = require('../models/Drive');
const Job = require('../models/Job');
const Recruiter = require('../models/Recruiter');
const schedulingEngine = require('./scheduling/scheduling.engine');
const schedulingService = require('./scheduling/scheduling.service');
const Student = require('../models/Student');
const { matchStudentToJob } = require('./matching/matching.engine');
const { notify } = require('./notification.service');

async function getDriveConflicts(drive) {
    const [driveConflicts, candidateConflicts] = await Promise.all([
        schedulingService.checkDriveTimeConflicts(drive),
        schedulingService.checkDriveConflicts(drive)
    ]);
    return [...driveConflicts, ...candidateConflicts];
}

function driveHasEnded(drive) {
    const dateKey = new Date(drive.date).toISOString().slice(0, 10);
    const time = /^\d{2}:\d{2}$/.test(drive.endTime || '') ? drive.endTime : '23:59';
    return new Date(`${dateKey}T${time}:00`) <= new Date();
}

const checkDriveDraft = async (recruiterId, driveData) => {
    schedulingEngine.validateDriveSchedule(driveData);
    const job = await Job.findById(driveData.jobId);
    if (!job) {
        const err = new Error('Job not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err;
    }
    if (job.recruiterId.toString() !== recruiterId.toString()) {
        const err = new Error('Not authorized to schedule a drive for this job'); err.status = 403; err.code = 'FORBIDDEN'; throw err;
    }
    const recruiter = await Recruiter.findOne({ userId: recruiterId }).select('companyName');
    const draft = {
        _id: new (require('mongoose').Types.ObjectId)(), recruiterId, jobId: job,
        companyName: recruiter?.companyName || 'Company', role: job.requirements?.role || job.title,
        date: driveData.date, startTime: driveData.startTime, endTime: driveData.endTime,
        venue: driveData.venue, mode: driveData.mode, status: 'Scheduled', shortlistedCandidates: []
    };
    return getDriveConflicts(draft);
};

const createDrive = async (recruiterId, driveData) => {
    schedulingEngine.validateDriveSchedule(driveData);
    // Validate Job
    const job = await Job.findById(driveData.jobId);
    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (job.recruiterId.toString() !== recruiterId.toString()) {
        const err = new Error('Not authorized to create a drive for this job');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
    }

    const recruiter = await Recruiter.findOne({ userId: recruiterId }).select('companyName');

    const drive = new Drive({
        jobId: job._id,
        recruiterId: recruiterId,
        companyName: driveData.companyName || recruiter?.companyName || 'Unknown Company',
        role: driveData.role || job.requirements?.role || job.title || 'Unknown Role',
        date: driveData.date,
        startTime: driveData.startTime,
        endTime: driveData.endTime,
        venue: driveData.venue,
        mode: driveData.mode,
        demoKey: driveData.demoKey,
        interviewStages: driveData.interviewStages || []
    });

    // Persist the actual eligible profile set and announce only to students who
    // pass the same backend eligibility and matching rules used elsewhere.
    const students = await Student.find({});
    const eligible = students.filter((student) => matchStudentToJob(student, job).eligible);
    const conflicts = await getDriveConflicts(drive);
    if (conflicts.length) {
        const driveTimeConflict = conflicts.some((conflict) => conflict.type === 'drive_time_overlap');
        const err = new Error(driveTimeConflict
            ? 'Drive cannot be created because another drive is already scheduled during this time.'
            : 'This drive conflicts with an existing venue or candidate schedule. Choose a different time or venue.');
        err.status = 409; err.code = driveTimeConflict ? 'DRIVE_TIME_CONFLICT' : 'SCHEDULING_CONFLICT'; err.conflicts = conflicts; throw err;
    }

    await drive.save();
    const role = job.requirements?.role || job.title;
    const driveDate = new Date(drive.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    await Promise.all(eligible.map((student) => notify(
        student.userId,
        `New Placement Drive · ${drive.companyName} · ${role} · ${driveDate} · ${drive.startTime}–${drive.endTime}`,
        'drive',
        { type: 'drive', id: drive._id },
        `drive:${drive._id}:announcement:${student.userId}`
    )));
    return drive;
};

const getDrives = async (filters) => {
    return await Drive.find(filters).populate('jobId', 'title').populate('shortlistedCandidates', 'name').populate('addedCandidates', 'name').sort({ date: 1, startTime: 1 });
};

const getDriveById = async (driveId) => {
    return await Drive.findById(driveId)
        .populate('jobId')
        .populate('shortlistedCandidates', 'name email branch cgpa')
        .populate('addedCandidates', 'name email branch cgpa')
        .populate('eligibleCandidates', 'name email branch cgpa');
};

const addCandidates = async (driveId, studentIds, actor) => {
    const drive = await Drive.findById(driveId);
    if (!drive) { const err = new Error('Drive not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err; }
    if (actor?.role !== 'recruiter' || drive.recruiterId.toString() !== actor.id.toString()) {
        const err = new Error('Not authorized to add candidates to this drive'); err.status = 403; err.code = 'FORBIDDEN'; throw err;
    }
    if (['Completed', 'Cancelled'].includes(drive.status) || driveHasEnded(drive)) {
        const err = new Error('Candidates cannot be added to a completed or past drive.'); err.status = 409; err.code = 'DRIVE_LOCKED'; throw err;
    }
    const uniqueStudentIds = [...new Set(studentIds.map(String))];
    if (!uniqueStudentIds.length) return { drive, addedCount: 0, addedStudentIds: [] };
    if (uniqueStudentIds.some((id) => !Drive.base.isValidObjectId(id))) {
        const err = new Error('One or more student IDs are invalid'); err.status = 400; err.code = 'INVALID_INPUT'; throw err;
    }
    const job = await Job.findById(drive.jobId);
    const students = await Student.find({ userId: { $in: uniqueStudentIds } });
    if (!job || students.length !== uniqueStudentIds.length) {
        const err = new Error('One or more candidate profiles could not be found'); err.status = 404; err.code = 'CANDIDATE_NOT_FOUND'; throw err;
    }
    const Application = require('../models/Application');
    const applications = await Application.find({ jobId: drive.jobId, studentId: { $in: uniqueStudentIds } })
        .populate('driveId', 'companyName role date startTime endTime status');
    if (applications.length !== uniqueStudentIds.length) {
        const err = new Error('Candidates must apply to this drive’s job before they can be added.'); err.status = 409; err.code = 'APPLICATION_NOT_FOUND'; throw err;
    }
    const appByStudent = new Map(applications.map((application) => [String(application.studentId), application]));
    const invalidApplications = applications.filter((application) => !application.eligibility?.isEligible
        || !['Applied', 'Eligible', 'Shortlisted', 'Interview'].includes(application.status));
    if (invalidApplications.length) {
        const err = new Error('Only eligible active applicants can be added to this drive.');
        err.status = 409; err.code = 'INVALID_CANDIDATE_STATUS'; throw err;
    }
    const ineligible = students.filter((student) => !matchStudentToJob(student, job).eligible);
    if (ineligible.length) {
        const err = new Error('Only candidates eligible for this drive’s job can be added'); err.status = 409; err.code = 'INELIGIBLE_CANDIDATE'; throw err;
    }
    const otherAssociations = await Drive.find({
        jobId: drive.jobId,
        _id: { $ne: drive._id },
        $or: [
            { addedCandidates: { $in: uniqueStudentIds } },
            { shortlistedCandidates: { $in: uniqueStudentIds } }
        ]
    }).select('companyName role date startTime endTime status addedCandidates shortlistedCandidates');
    const associationByStudent = new Map();
    for (const studentId of uniqueStudentIds) {
        const application = appByStudent.get(studentId);
        const linkedDrive = application?.driveId && String(application.driveId._id || application.driveId) !== String(drive._id)
            ? application.driveId : null;
        const arrayDrive = otherAssociations.find((other) =>
            [...(other.addedCandidates || []), ...(other.shortlistedCandidates || [])].some((id) => String(id) === studentId));
        if (linkedDrive || arrayDrive) associationByStudent.set(studentId, linkedDrive || arrayDrive);
    }
    if (associationByStudent.size) {
        const associations = [...associationByStudent].map(([studentId, otherDrive]) => ({
            studentId,
            drive: {
                id: String(otherDrive._id), companyName: otherDrive.companyName, role: otherDrive.role,
                date: otherDrive.date, startTime: otherDrive.startTime, endTime: otherDrive.endTime, status: otherDrive.status
            }
        }));
        const firstDrive = associations[0].drive;
        const err = new Error(`Candidate is already associated with another ${firstDrive.role || 'job'} drive for ${firstDrive.companyName || 'this company'}.`);
        err.status = 409; err.code = 'CANDIDATE_ALREADY_ON_ANOTHER_DRIVE'; err.associations = associations; throw err;
    }
    const addedStudentIds = [];
    const applicationService = require('./application.service');
    for (const application of applications) {
        if (application.status === 'Interview' && String(application.driveId?._id || application.driveId || '') === String(drive._id)) continue;
        await applicationService.updateApplicationStatus(application._id, 'Interview', actor, { driveId: drive._id });
        addedStudentIds.push(String(application.studentId));
    }
    const updatedDrive = await Drive.findById(drive._id);
    return { drive: updatedDrive, addedCount: addedStudentIds.length, addedStudentIds };
};

const deleteDrive = async (driveId, actor) => {
    const drive = await Drive.findById(driveId);
    if (!drive) { const err = new Error('Drive not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err; }
    if (actor?.role !== 'recruiter' || drive.recruiterId.toString() !== actor.id.toString()) {
        const err = new Error('Not authorized to delete this drive'); err.status = 403; err.code = 'FORBIDDEN'; throw err;
    }
    const Application = require('../models/Application');
    const Offer = require('../models/Offer');
    const progressed = await Application.findOne({ driveId: drive._id, $or: [
        { interviewScheduledAt: { $exists: true, $ne: null } },
        { status: { $in: ['Selected', 'Offer', 'Hired'] } }
    ] }).select('_id status interviewScheduledAt');
    const offerHistory = await Offer.exists({ driveId: drive._id });
    if (progressed || offerHistory) {
        const err = new Error('Cannot delete this drive because a candidate has an interview scheduled or has progressed to a later hiring stage. Close or archive the drive instead.');
        err.status = 409; err.code = 'DRIVE_IN_USE'; throw err;
    }
    await Application.updateMany({ driveId: drive._id, status: 'Interview', interviewScheduledAt: { $exists: false } }, { $set: { status: 'Shortlisted' }, $unset: { driveId: '' } });
    await Application.updateMany({ driveId: drive._id, status: 'Interview', interviewScheduledAt: null }, { $set: { status: 'Shortlisted' }, $unset: { driveId: '' } });
    await Application.updateMany({ driveId: drive._id }, { $unset: { driveId: '' } });
    await Drive.deleteOne({ _id: drive._id });
    return { deleted: true, driveId: String(drive._id), jobId: String(drive.jobId) };
};

const shortlistCandidates = async (driveId, studentIds, actor) => {
    const drive = await Drive.findById(driveId);
    if (!drive) {
        const err = new Error('Drive not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (actor?.role === 'recruiter' && drive.recruiterId.toString() !== actor.id.toString()) {
        const err = new Error('Not authorized to shortlist candidates for this drive');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
    }

    const uniqueStudentIds = [...new Set(studentIds.map(String))];
    const Application = require('../models/Application');
    const applicationService = require('./application.service');
    const applications = await Application.find({ jobId: drive.jobId, studentId: { $in: uniqueStudentIds } });
    if (applications.length !== uniqueStudentIds.length) {
        const err = new Error('Every selected candidate must have an application for this drive job'); err.status = 409; err.code = 'APPLICATION_NOT_FOUND'; throw err;
    }
    if (applications.some((application) => !application.eligibility?.isEligible || !['Applied', 'Eligible', 'Shortlisted'].includes(application.status))) {
        const err = new Error('Only eligible applicants who are in the application or shortlisted stage can be added to a drive'); err.status = 409; err.code = 'INVALID_TRANSITION'; throw err;
    }
    if (applications.some((application) => application.driveId && String(application.driveId) !== String(drive._id))) {
        const err = new Error('A candidate’s application is already associated with another drive for this job.'); err.status = 409; err.code = 'CANDIDATE_ALREADY_ON_ANOTHER_DRIVE'; throw err;
    }
    const otherDrive = await Drive.findOne({
        jobId: drive.jobId, _id: { $ne: drive._id },
        $or: [{ addedCandidates: { $in: uniqueStudentIds } }, { shortlistedCandidates: { $in: uniqueStudentIds } }]
    }).select('role companyName');
    if (otherDrive) {
        const err = new Error(`A candidate is already associated with another ${otherDrive.role || 'job'} drive for ${otherDrive.companyName || 'this company'}.`);
        err.status = 409; err.code = 'CANDIDATE_ALREADY_ON_ANOTHER_DRIVE'; throw err;
    }
    const newShortlist = [...new Map([...(drive.shortlistedCandidates || []), ...uniqueStudentIds].map((id) => [id.toString(), id])).values()];
    drive.shortlistedCandidates = newShortlist;
    drive.addedCandidates = [...new Set([...(drive.addedCandidates || []).map(String), ...uniqueStudentIds])];
    const conflicts = await schedulingService.checkDriveConflicts(drive);
    if (conflicts.length) {
        const err = new Error('One or more candidates have a scheduling conflict. Remove them or choose a different drive time.');
        err.status = 409; err.code = 'SCHEDULING_CONFLICT'; err.conflicts = conflicts; throw err;
    }
    for (const application of applications) {
        application.driveId = drive._id;
        await application.save();
        if (['Applied', 'Eligible'].includes(application.status)) await applicationService.updateApplicationStatus(application._id, 'Shortlisted', actor);
    }
    await drive.save();

    return { drive, conflicts };
};

const removeCandidate = async (driveId, studentId, actor) => {
    if (!Drive.base.isValidObjectId(studentId)) { const err = new Error('Student ID is invalid'); err.status = 400; err.code = 'INVALID_INPUT'; throw err; }
    const drive = await Drive.findById(driveId);
    if (!drive) { const err = new Error('Drive not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err; }
    if (actor?.role !== 'recruiter' || drive.recruiterId.toString() !== actor.id.toString()) {
        const err = new Error('Not authorized to manage candidates for this drive'); err.status = 403; err.code = 'FORBIDDEN'; throw err;
    }
    if (['Completed', 'Cancelled'].includes(drive.status) || driveHasEnded(drive)) {
        const err = new Error('Candidates cannot be removed from a completed or past drive.'); err.status = 409; err.code = 'DRIVE_LOCKED'; throw err;
    }
    const Application = require('../models/Application');
    const application = await Application.findOne({ jobId: drive.jobId, studentId });
    const Offer = require('../models/Offer');
    const hasOfferHistory = application ? await Offer.exists({ applicationId: application._id }) : false;
    if (application && (application.interviewScheduledAt || ['Selected', 'Offer', 'Hired'].includes(application.status) || hasOfferHistory)) {
        const err = new Error(application.interviewScheduledAt ? 'Interview Scheduled — Protected.' : 'Candidates selected or progressed to offer cannot be removed from this drive.'); err.status = 409; err.code = 'CANDIDATE_LOCKED'; throw err;
    }
    const originalShortlisted = [...(drive.shortlistedCandidates || [])];
    const originalAdded = [...(drive.addedCandidates || [])];
    drive.shortlistedCandidates = originalShortlisted.filter((id) => id.toString() !== String(studentId));
    drive.addedCandidates = originalAdded.filter((id) => id.toString() !== String(studentId));
    await drive.save();
    if (application?.driveId?.toString() === drive._id.toString()) {
        const originalStatus = application.status;
        application.driveId = undefined;
        if (application.status === 'Interview') application.status = 'Shortlisted';
        try { await application.save(); }
        catch (error) {
            drive.shortlistedCandidates = originalShortlisted;
            drive.addedCandidates = originalAdded;
            await drive.save().catch(() => {});
            application.status = originalStatus;
            throw error;
        }
    }
    return drive;
};

const checkConflicts = async (driveId, studentIds = []) => {
    const drive = await Drive.findById(driveId)
        .populate('shortlistedCandidates', 'name')
        .populate('jobId', 'title requirements.role');
    if (!drive) {
        const err = new Error('Drive not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }
    const uniqueStudentIds = [...new Set((studentIds || []).map(String))];
    drive.shortlistedCandidates = [...new Map([...(drive.shortlistedCandidates || []), ...uniqueStudentIds].map((id) => [id.toString(), id])).values()];
    const conflicts = await getDriveConflicts(drive);
    return { drive, conflicts };
};

module.exports = {
    checkDriveDraft,
    createDrive,
    getDrives,
    getDriveById,
    addCandidates,
    deleteDrive,
    shortlistCandidates,
    removeCandidate,
    checkConflicts
};
