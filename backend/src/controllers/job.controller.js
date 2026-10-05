const jobService = require('../services/job.service');
const { normalizeSkill } = require('../services/readiness/skill.domain');

const createJob = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can create jobs' }
            });
        }

        const jobData = {
            ...req.body,
            recruiterId: req.user.id
        };

        const job = await jobService.createJob(jobData);

        res.status(201).json({
            success: true,
            data: job
        });
    } catch (err) {
        next(err);
    }
};

const getJobs = async (req, res, next) => {
    try {
        const filters = {};
        if (req.query.status) {
            filters.status = req.query.status;
        }
        if (req.query.recruiterId) {
            filters.recruiterId = req.query.recruiterId;
        }

        // Students can only see active jobs
        if (req.user.role === 'student') {
            filters.status = 'active';
        } else if (req.user.role === 'recruiter') {
            // Recruiters can only browse their own jobs, regardless of query-string IDs.
            filters.recruiterId = req.user.id;
        }

        const jobs = await jobService.getJobs(filters);

        res.status(200).json({
            success: true,
            data: jobs
        });
    } catch (err) {
        next(err);
    }
};

const getJobById = async (req, res, next) => {
    try {
        const job = await jobService.getJobById(req.params.id);
        
        if (!job) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Job not found' }
            });
        }

        if (req.user.role === 'student' && job.status !== 'active') {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Job not found' }
            });
        }
        if (req.user.role === 'recruiter' && job.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view this job' } });
        }

        res.status(200).json({
            success: true,
            data: job
        });
    } catch (err) {
        next(err);
    }
};

const updateJob = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can update jobs' }
            });
        }

        const job = await jobService.updateJob(req.params.id, req.user.id, req.body);

        res.status(200).json({
            success: true,
            data: job
        });
    } catch (err) {
        next(err);
    }
};

const deleteJob = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can delete jobs' }
            });
        }

        await jobService.deleteJob(req.params.id, req.user.id);

        res.status(200).json({
            success: true,
            message: 'Job deleted successfully'
        });
    } catch (err) {
        next(err);
    }
};

const aiService = require('../services/ai.service');
const { validateJdOutput } = require('../validators/jdSchema.validator');

const analyzeJob = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can analyze jobs' }
            });
        }

        const job = await jobService.getJobById(req.params.id);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Job not found' }
            });
        }

        if (job.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Not authorized to analyze this job' }
            });
        }

        const rawText = `Title: ${job.title}\n\nDescription:\n${job.description}`;
        const rawLlmOutput = await aiService.parseJobDescription(rawText);
        
        let validated;
        try {
            validated = validateJdOutput(rawLlmOutput);
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: 'AI_PARSE_ERROR', message: 'Failed to parse AI output' }
            });
        }

        const currentRequirements = job.requirements?.toObject?.() || { ...(job.requirements || {}) };
        const extractedRequiredSkills = validated.requiredSkills.map(normalizeSkill).filter(Boolean);
        const extractedPreferredSkills = validated.preferredSkills.map(normalizeSkill).filter(Boolean);
        const updatedRequirements = {
            ...currentRequirements, // preserve manual stuff like branches, CGPA and backlogs
            requiredSkills: currentRequirements.requiredSkills?.length ? currentRequirements.requiredSkills : extractedRequiredSkills,
            preferredSkills: currentRequirements.preferredSkills?.length ? currentRequirements.preferredSkills : extractedPreferredSkills,
            role: validated.role,
            experience: validated.experience,
            education: validated.education,
            responsibilities: validated.responsibilities
        };

        const updatedJob = await jobService.updateJob(job._id, req.user.id, { requirements: updatedRequirements });

        const data = updatedJob.toObject();
        data.aiAnalysis = {
            ...validated,
            normalizedRequiredSkills: extractedRequiredSkills,
            normalizedPreferredSkills: extractedPreferredSkills,
            normalizedJobRequiredSkills: (updatedRequirements.requiredSkills || []).map(normalizeSkill).filter(Boolean),
            normalizedJobPreferredSkills: (updatedRequirements.preferredSkills || []).map(normalizeSkill).filter(Boolean)
        };
        res.status(200).json({
            success: true,
            data,
            message: 'JD analyzed successfully'
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createJob,
    getJobs,
    getJobById,
    updateJob,
    deleteJob,
    analyzeJob
};
