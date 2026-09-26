const Job = require('../models/Job');
const { normalizeBranchList } = require('./branch.domain');

function normalizeRequirements(requirements) {
    if (!requirements || !Array.isArray(requirements.eligibleBranches)) return requirements;
    return { ...requirements, eligibleBranches: normalizeBranchList(requirements.eligibleBranches) };
}

const createJob = async (jobData) => {
    return await Job.create({ ...jobData, requirements: normalizeRequirements(jobData.requirements) });
};

const getJobs = async (filters) => {
    return await Job.find(filters).sort({ createdAt: -1 });
};

const getJobById = async (jobId) => {
    return await Job.findById(jobId);
};

const updateJob = async (jobId, recruiterId, updateData) => {
    const job = await Job.findById(jobId);
    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (job.recruiterId.toString() !== recruiterId.toString()) {
        const err = new Error('Not authorized to update this job');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
    }

    // Only allow specific updates
    const allowedUpdates = ['title', 'description', 'requirements', 'status'];
    Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
            job[key] = key === 'requirements' ? normalizeRequirements(updateData[key]) : updateData[key];
        }
    });

    await job.save();
    return job;
};

const deleteJob = async (jobId, recruiterId) => {
    const job = await Job.findById(jobId);
    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (job.recruiterId.toString() !== recruiterId.toString()) {
        const err = new Error('Not authorized to delete this job');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
    }

    await job.deleteOne();
    return true;
};

module.exports = {
    createJob,
    getJobs,
    getJobById,
    updateJob,
    deleteJob
};
