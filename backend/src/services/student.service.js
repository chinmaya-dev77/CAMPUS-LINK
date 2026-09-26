const Student = require('../models/Student');
const User = require('../models/User');
const { normalizeBranch } = require('./branch.domain');
const { dedupeResumeProjects, mergeResumeProjects } = require('./project.domain');

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
                uploadedAt: resumeMeta.uploadedAt
            }
        });

        return newStudent;
    }

    // Existing Student profile → enrich it
    const updateDoc = {};

    // Refresh parsed projects without overwriting manually entered projects.
    updateDoc.skills = validatedData.skills;
    updateDoc.projects = mergeResumeProjects(existing.projects || [], validatedData.projects || []);
    updateDoc.certifications = validatedData.certifications;
    updateDoc.experience = validatedData.experience;
    updateDoc.education = validatedData.education;

    // Name: update only if currently blank
    if (!existing.name && validatedData.name) {
        updateDoc.name = validatedData.name;
    }

    // Phone: update only if currently blank
    if (!existing.phone && validatedData.phone) {
        updateDoc.phone = validatedData.phone;
    }

    // CGPA: update only if currently blank
    if (existing.cgpa == null && validatedData.cgpa != null) {
        updateDoc.cgpa = validatedData.cgpa;
    }

    // Resume metadata
    updateDoc.resume = {
        originalFileName: resumeMeta.originalFileName,
        storedFileName: resumeMeta.storedFileName,
        fileUrl: resumeMeta.fileUrl,
        uploadedAt: resumeMeta.uploadedAt
    };

    // Never write:
    // branch, graduationYear, backlogs,
    // readiness, email, userId, _id
    return await Student.findOneAndUpdate(
        { userId },
        { $set: updateDoc },
        { new: true, runValidators: true }
    );
};

module.exports = {
    getProfileByUserId,
    updateProfileByUserId,
    applyResumeData
};
