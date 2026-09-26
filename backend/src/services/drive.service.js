const Drive = require('../models/Drive');
const Job = require('../models/Job');
const Recruiter = require('../models/Recruiter');
const schedulingEngine = require('./scheduling/scheduling.engine');
const schedulingService = require('./scheduling/scheduling.service');

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
        interviewStages: driveData.interviewStages || []
    });

    await drive.save();
    return drive;
};

const getDrives = async (filters) => {
    return await Drive.find(filters).populate('jobId', 'title').sort({ date: 1, startTime: 1 });
};

const getDriveById = async (driveId) => {
    return await Drive.findById(driveId)
        .populate('jobId')
        .populate('shortlistedCandidates', 'name email branch cgpa')
        .populate('eligibleCandidates', 'name email branch cgpa');
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

    // Add unique students
    const newShortlist = [...new Map([...(drive.shortlistedCandidates || []), ...studentIds].map((id) => [id.toString(), id])).values()];
    drive.shortlistedCandidates = newShortlist;
    const conflicts = await schedulingService.getStudentConflictsForDrive(drive, studentIds);
    await drive.save();

    // Also update their application status if it exists for this job.
    // We can do this in the controller or here. Let's do it in the controller to avoid circular dependencies if possible,
    // or just require the model.
    const Application = require('../models/Application');
    await Application.updateMany(
        { jobId: drive.jobId, studentId: { $in: studentIds } },
        { $set: { status: 'Shortlisted', driveId: drive._id } }
    );

    return { drive, conflicts };
};

const checkConflicts = async (driveId) => {
    const drive = await Drive.findById(driveId)
        .populate('shortlistedCandidates', 'name')
        .populate('jobId', 'title requirements.role');
    if (!drive) {
        const err = new Error('Drive not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }
    const conflicts = await schedulingService.checkDriveConflicts(drive);
    return { drive, conflicts };
};

module.exports = {
    createDrive,
    getDrives,
    getDriveById,
    shortlistCandidates,
    checkConflicts
};
