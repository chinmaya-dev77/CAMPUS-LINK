const Student = require('../../models/Student');
const Job = require('../../models/Job');
const Application = require('../../models/Application');
const { matchStudentToJob } = require('./matching.engine');
const { normalizeBranch } = require('../branch.domain');
const { ensureReadiness } = require('../readiness/readiness.service');

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

    let studentFilter = {};
    if (Array.isArray(options.studentIds)) studentFilter = { userId: { $in: options.studentIds } };
    else if (options.applicantsOnly) {
        const applicantIds = await Application.distinct('studentId', { jobId });
        studentFilter = { userId: { $in: applicantIds } };
    }
    const students = await Student.find(studentFilter).select('+readiness.sourceHash');

    const results = await Promise.all(students.map(async (student) => {
        const result = matchStudentToJob(student, job);
        const readiness = await ensureReadiness(student);
        return {
            studentId: student.userId,
            studentName: student.name,
            email: student.email,
            branch: normalizeBranch(student.branch) || student.branch,
            hasProfilePicture: Boolean(student.profilePicture?.fileName),
            cgpa: student.cgpa,
            graduationYear: student.graduationYear ?? null,
            readiness: readiness ? { score: readiness.score, category: readiness.category, calculatedAt: readiness.calculatedAt } : null,
            skills: (student.skills || []).map((skill) => skill.name).filter(Boolean).slice(0, 40),
            projects: (student.projects || []).map((project) => ({ title: project.title, description: project.description, technologies: project.technologies || [], githubUrl: project.githubUrl, demoUrl: project.demoUrl })).slice(0, 20),
            ...result
        };
    }));

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
