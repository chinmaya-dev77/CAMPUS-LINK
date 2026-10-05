const Student = require('../models/Student');
const User = require('../models/User');
const { normalizeBranch } = require('./branch.domain');
const { calculateAndPersistReadiness } = require('./readiness/readiness.service');
const { dedupeResumeProjects, mergeResumeProjects } = require('./project.domain');
const Application = require('../models/Application');
const Job = require('../models/Job');
const { matchStudentToJob } = require('./matching/matching.engine');

function mergeResumeArray(current, incoming, keyFor) {
    const combined = [...(current || [])];
    const keys = new Set(combined.map(keyFor).filter(Boolean));
    for (const item of incoming || []) {
        const key = keyFor(item);
        if (!key || !keys.has(key)) { combined.push(item); if (key) keys.add(key); }
    }
    return combined;
}

function buildResumeProfileUpdate(existing, validatedData) {
    const update = {};
    if (validatedData.skills?.length) update.skills = mergeResumeArray(existing.skills, validatedData.skills, (item) => String(item.name || '').trim().toLowerCase());
    if (validatedData.projects?.length) update.projects = mergeResumeProjects(existing.projects || [], validatedData.projects);
    if (validatedData.certifications?.length) update.certifications = mergeResumeArray(existing.certifications, validatedData.certifications, (item) => `${item.name || ''}|${item.issuer || ''}`.trim().toLowerCase());
    if (validatedData.experience?.length) update.experience = mergeResumeArray(existing.experience, validatedData.experience, (item) => `${item.company || ''}|${item.role || ''}|${item.startDate || ''}`.trim().toLowerCase());
    if (validatedData.education?.length) update.education = mergeResumeArray(existing.education, validatedData.education, (item) => `${item.institution || ''}|${item.degree || ''}|${item.field || ''}|${item.startYear || ''}|${item.endYear || ''}`.trim().toLowerCase());
    if (!existing.name && validatedData.name) update.name = validatedData.name;
    if (!existing.phone && validatedData.phone) update.phone = validatedData.phone;
    if (existing.cgpa == null && validatedData.cgpa != null) update.cgpa = validatedData.cgpa;
    if (!existing.branch && validatedData.branch) update.branch = normalizeBranch(validatedData.branch);
    if (existing.graduationYear == null && validatedData.graduationYear != null) update.graduationYear = validatedData.graduationYear;
    return update;
}

async function refreshApplicationEligibility(student) {
    try {
        const applications = await Application.find({ studentId: student.userId, status: { $nin: ['Rejected', 'Withdrawn', 'Offer', 'Hired'] } });
        if (!applications.length) return;
        const jobs = await Job.find({ _id: { $in: applications.map((application) => application.jobId) } });
        const jobsById = new Map(jobs.map((job) => [String(job._id), job]));
        for (const application of applications) {
            const job = jobsById.get(String(application.jobId));
            if (!job) continue;
            const result = matchStudentToJob(student, job);
            application.eligibility = { isEligible: result.eligible, reasons: result.eligibilityIssues || [] };
            application.matching = {
                ...application.matching?.toObject?.(),
                finalScore: result.matchScore,
                skillMatch: result.breakdown.skillMatch,
                semanticMatch: result.semanticSimilarity,
                projectRelevance: result.breakdown.projectRelevance,
                academicFit: result.breakdown.academicFit,
                assessmentEvidence: result.breakdown.evidenceCoverage,
                rank: application.matching?.rank ?? 0,
                strengths: [...result.skillDetail.matchedRequired, ...result.skillDetail.matchedPreferred],
                skillGaps: [...result.skillDetail.missingRequired, ...result.skillDetail.missingPreferred]
            };
            if (['Applied', 'Eligible', 'Ineligible'].includes(application.status)) {
                application.status = result.eligible ? 'Applied' : 'Ineligible';
            }
            await application.save();
        }
    } catch (error) { console.error('[APPLICATIONS] Could not refresh eligibility after profile change:', error.message); }
}

/**
 * Get student profile by userId
 * If a profile doesn't exist yet (e.g., just registered), we can return 
 * a shell profile based on the User document to avoid 404s on the frontend,
 * or explicitly return null and let the controller handle it.
 * We will return null and let the controller handle initializing the shell.
 */
const getProfileByUserId = async (userId) => {
    return await Student.findOne({ userId });
};

/**
 * Update or create student profile
 */
const updateProfileByUserId = async (userId, updateData) => {
    // We use findOneAndUpdate with upsert: true so that the first PATCH
    // will create the document if it doesn't exist.
    
    // Ensure name and email are pulled from the User collection if this is an upsert,
    // though the allowlist includes name which might override it. To be safe, we 
    // fetch the user to guarantee email integrity.
    const user = await User.findById(userId);
    if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    // Email is strictly forbidden in the update payload from the client,
    // so we set it from the User document.
    const dataToSave = { ...updateData, email: user.email };
    if (Object.hasOwn(dataToSave, 'branch')) dataToSave.branch = normalizeBranch(dataToSave.branch);
    
    // If name wasn't provided in updateData (and it's a new profile), fallback to user.name
    if (!dataToSave.name) {
        dataToSave.name = user.name;
    }

    const updatedProfile = await Student.findOneAndUpdate(
        { userId },
        { $set: dataToSave },
        { new: true, upsert: true, runValidators: true }
    );

    await calculateAndPersistReadiness(updatedProfile);

    await refreshApplicationEligibility(updatedProfile);

    return updatedProfile;
};

/**
 * Apply validated resume-extracted data to the student profile.
 *
 * Data Merge Policy:
 *   Arrays (skills, projects, certifications, experience, education): REPLACE entirely.
 *   name:  update ONLY if the existing profile name is blank.
 *   phone: update ONLY if the existing profile phone is blank.
 *   email, userId, _id, branch, graduationYear, cgpa, backlogs, readiness: NEVER updated.
 *
 * Resume metadata (stored fileName, fileUrl, uploadedAt) is also written here.
 *
 * @param {string} userId         - the student's userId
 * @param {Object} validatedData  - output of validateResumeOutput()
 * @param {Object} resumeMeta     - { originalFileName, storedFileName, fileUrl, uploadedAt }
 * @returns {Promise<Document>}
 */
const applyResumeData = async (userId, validatedData, resumeMeta) => {
    const existing = await Student.findOne({ userId });

    // No Student profile yet → create it from resume data
    if (!existing) {
        const user = await User.findById(userId);

        if (!user) {
            const err = new Error('User account not found.');
            err.status = 404;
            err.code = 'USER_NOT_FOUND';
            throw err;
        }

        const newStudent = await Student.create({
            userId,
            name: validatedData.name || user.name,
            email: user.email,
            phone: validatedData.phone || undefined,
            branch: validatedData.branch ? normalizeBranch(validatedData.branch) : undefined,
            graduationYear: validatedData.graduationYear ?? undefined,
            // Only populate cgpa from resume if it is a valid number in range
            cgpa: (validatedData.cgpa != null) ? validatedData.cgpa : undefined,
            skills: validatedData.skills,
            projects: dedupeResumeProjects(validatedData.projects || []),
            certifications: validatedData.certifications,
            experience: validatedData.experience,
            education: validatedData.education,
            resume: {
                originalFileName: resumeMeta.originalFileName,
                storedFileName: resumeMeta.storedFileName,
                fileUrl: resumeMeta.fileUrl,
                publicId: resumeMeta.publicId,
                resourceType: resumeMeta.resourceType,
                secureUrl: resumeMeta.secureUrl,
                contentType: resumeMeta.contentType,
                analysisStatus: resumeMeta.analysisStatus || 'COMPLETED',
                analysisError: resumeMeta.analysisError,
                uploadedAt: resumeMeta.uploadedAt
            }
        });

        await calculateAndPersistReadiness(newStudent);

        await refreshApplicationEligibility(newStudent);
        return newStudent;
    }

    // Existing Student profile → enrich it
    const updateDoc = buildResumeProfileUpdate(existing, validatedData);

    // Resume metadata
    updateDoc.resume = {
        originalFileName: resumeMeta.originalFileName,
        storedFileName: resumeMeta.storedFileName,
        fileUrl: resumeMeta.fileUrl,
        publicId: resumeMeta.publicId,
        resourceType: resumeMeta.resourceType,
        secureUrl: resumeMeta.secureUrl,
        contentType: resumeMeta.contentType,
        analysisStatus: resumeMeta.analysisStatus || 'COMPLETED',
        analysisError: resumeMeta.analysisError,
        uploadedAt: resumeMeta.uploadedAt
    };

    // Never write:
    // branch, graduationYear, backlogs,
    // readiness, email, userId, _id
    const updatedStudent = await Student.findOneAndUpdate(
        { userId },
        { $set: updateDoc },
        { new: true, runValidators: true }
    );
    await calculateAndPersistReadiness(updatedStudent);
    await refreshApplicationEligibility(updatedStudent);
    return updatedStudent;
};

module.exports = {
    getProfileByUserId,
    updateProfileByUserId,
    applyResumeData,
    refreshApplicationEligibility,
    buildResumeProfileUpdate
};
