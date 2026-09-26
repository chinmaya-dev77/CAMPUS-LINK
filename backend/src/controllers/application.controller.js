const applicationService = require('../services/application.service');

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
        if (!['recruiter', 'placement'].includes(req.user.role)) {
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
        if (!['recruiter', 'placement'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to update status' }});
        }
        const existing = await applicationService.getApplicationById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' }});
        if (req.user.role === 'recruiter' && existing.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to update this application' }});
        }

        const { status } = req.body;
        const app = await applicationService.updateApplicationStatus(req.params.id, status);

        res.status(200).json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createApplication,
    getApplicationById,
    getStudentApplications,
    getJobApplications,
    updateApplicationStatus
};
