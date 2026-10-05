const applicationService = require('../services/application.service');
const Application = require('../models/Application');
const Student = require('../models/Student');
const Recruiter = require('../models/Recruiter');

const listPlacementApplications = async (req, res, next) => {
    try {
        const applications = await Application.find({})
            .select('studentId jobId recruiterId driveId status eligibility.isEligible matching.finalScore appliedAt')
            .populate('studentId', 'name')
            .populate('jobId', 'title status recruiterId requirements')
            .populate('driveId', 'companyName role date startTime endTime mode status')
            .sort({ appliedAt: -1 }).lean();
        const studentIds = [...new Set(applications.map((app) => app.studentId?._id || app.studentId).filter(Boolean).map(String))];
        const recruiterIds = [...new Set(applications.map((app) => app.recruiterId).filter(Boolean).map(String))];
        const [profiles, recruiterProfiles] = await Promise.all([
            Student.find({ userId: { $in: studentIds } }).select('userId branch cgpa readiness profilePicture').lean(),
            Recruiter.find({ userId: { $in: recruiterIds } }).select('userId companyName').lean()
        ]);
        const studentById = new Map(profiles.map((profile) => [String(profile.userId), profile]));
        const recruiterById = new Map(recruiterProfiles.map((profile) => [String(profile.userId), profile]));
        const data = applications.map((app) => {
            const studentId = String(app.studentId?._id || app.studentId || '');
            const profile = studentById.get(studentId);
            const company = recruiterById.get(String(app.recruiterId));
            return {
                ...app,
                studentProfile: profile ? {
                    branch: profile.branch || null,
                    cgpa: profile.cgpa ?? null,
                    hasProfilePicture: Boolean(profile.profilePicture?.fileName)
                } : null,
                companyName: company?.companyName || '—'
            };
        });
        res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
};

const createApplication = async (req, res, next) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only students can apply' }
            });
        }

        const { jobId, driveId } = req.body;
        const application = await applicationService.createApplication(req.user.id, jobId, driveId);

        res.status(201).json({
            success: true,
            data: {
                applicationId: application._id,
                status: application.status
            }
        });
    } catch (err) {
        next(err);
    }
};

const getApplicationById = async (req, res, next) => {
    try {
        const app = await applicationService.getApplicationById(req.params.id);
        if (!app) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' }});
        }
        
        // Basic authorization
        if (req.user.role === 'student' && app.studentId._id.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' }});
        }
        
        if (req.user.role === 'recruiter' && app.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' }});
        }

        res.status(200).json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

const getStudentApplications = async (req, res, next) => {
    try {
        // Student endpoints are private to that student and placement staff.
        if (req.user.role !== 'placement' && (req.user.role !== 'student' || req.params.id !== req.user.id.toString())) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' }});
        }

        const apps = await applicationService.getApplicationsForStudent(req.params.id);
        res.status(200).json({ success: true, data: apps });
    } catch (err) {
        next(err);
    }
};

const getJobApplications = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view job applications' }});
        }
        if (req.user.role === 'recruiter') {
            const job = await require('../services/job.service').getJobById(req.params.id);
            if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' }});
            if (job.recruiterId.toString() !== req.user.id.toString()) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view applications for this job' }});
        }
        const apps = await applicationService.getApplicationsForJob(req.params.id);
        res.status(200).json({ success: true, data: apps });
    } catch (err) {
        next(err);
    }
};

const updateApplicationStatus = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to update status' }});
        }
        const existing = await applicationService.getApplicationById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' }});
        if (req.user.role === 'recruiter' && existing.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to update this application' }});
        }

        const { status } = req.body;
        const app = await applicationService.updateApplicationStatus(req.params.id, status, req.user, { driveId: req.body.driveId });

        res.status(200).json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

const scheduleInterview = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can schedule interviews.' } });
        const application = await applicationService.scheduleInterview(req.params.id, req.body?.scheduledAt, req.user);
        res.status(200).json({ success: true, data: application });
    } catch (err) { next(err); }
};

module.exports = {
    listPlacementApplications,
    createApplication,
    getApplicationById,
    getStudentApplications,
    getJobApplications,
    updateApplicationStatus,
    scheduleInterview
};
