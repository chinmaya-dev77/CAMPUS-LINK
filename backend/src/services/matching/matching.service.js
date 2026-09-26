const Student = require('../../models/Student');
const Job = require('../../models/Job');
const { matchStudentToJob } = require('./matching.engine');
const { normalizeBranch } = require('../branch.domain');

/**
 * Match a single student against a job.
 * @param {string} studentUserId - The student's userId
 * @param {string} jobId
 */
async function matchStudentForJob(studentUserId, jobId) {
    const [student, job] = await Promise.all([
        Student.findOne({ userId: studentUserId }),
        Job.findById(jobId)
    ]);

    if (!student) {
        const err = new Error('Student profile not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    const result = matchStudentToJob(student, job);
    return { student, job, result };
}

/**
 * Get top matched students for a job (for recruiter view).
 * Only looks at students with a profile; does not require pre-computed readiness.
 * @param {string} jobId
 * @param {Object} options - { includeIneligible: boolean }
 */
async function getMatchedCandidatesForJob(jobId, options = {}) {
    const job = await Job.findById(jobId);
    if (!job) {
        const err = new Error('Job not found');
        err.status = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    const students = await Student.find({});

    const results = students.map(student => {
        const result = matchStudentToJob(student, job);
        return {
            studentId: student.userId,
            studentName: student.name,
            email: student.email,
            branch: normalizeBranch(student.branch) || student.branch,
            hasProfilePicture: Boolean(student.profilePicture?.fileName),
            cgpa: student.cgpa,
            ...result
        };
    });

    // Sort by matchScore descending
    results.sort((a, b) => b.matchScore - a.matchScore);

    if (!options.includeIneligible) {
        return results.filter(r => r.eligible);
    }

    return results;
}

module.exports = {
    matchStudentForJob,
    getMatchedCandidatesForJob
};
