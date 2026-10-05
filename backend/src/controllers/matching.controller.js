const { matchStudentForJob, getMatchedCandidatesForJob } = require('../services/matching/matching.service');
const Job = require('../models/Job');

/**
 * POST /api/jobs/:id/match
 * Student checks their own match against a job.
 * Also available to recruiters and placement cell.
 */
const matchStudentToJob = async (req, res, next) => {
    try {
        const jobId = req.params.id;
        let studentUserId;

        if (req.user.role === 'student') {
            // Student matches themselves
            studentUserId = req.user.id;
        } else if (['recruiter', 'placement'].includes(req.user.role) && req.query.studentId) {
            // Recruiter/placement cell specifies a studentId
            studentUserId = req.query.studentId;
        } else {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_PARAM', message: 'Provide studentId query param for non-student users' }
            });
        }

        if (req.user.role === 'recruiter') {
            const job = await Job.findById(jobId).select('recruiterId');
            if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' }});
            if (job.recruiterId.toString() !== req.user.id.toString()) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to match candidates for this job' }});
        }

        const { student, job, result } = await matchStudentForJob(studentUserId, jobId);

        res.status(200).json({
            success: true,
            data: {
                student: {
                    name: student.name,
                    email: student.email,
                    branch: student.branch,
                    cgpa: student.cgpa
                },
                job: {
                    title: job.title,
                    status: job.status
                },
                ...result
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/jobs/:id/candidates
 * Returns ranked eligible students for a job.
 * Recruiter only.
 */
const getCandidatesForJob = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can view candidates' }
            });
        }

        const includeIneligible = req.query.includeIneligible === 'true';
        const applicantsOnly = req.query.applicantsOnly === 'true';
        const job = await Job.findById(req.params.id).select('recruiterId');
        if (!job) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' }});
        if (job.recruiterId.toString() !== req.user.id.toString()) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view candidates for this job' }});
        const candidates = await getMatchedCandidatesForJob(req.params.id, { includeIneligible, applicantsOnly });

        res.status(200).json({
            success: true,
            data: candidates
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { matchStudentToJob, getCandidatesForJob };
