const studentService = require('../services/student.service');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Job = require('../models/Job');
const { extractText }          = require('../services/pdf.service');
const { parseResumeText }      = require('../services/ai.service');
const { validateResumeOutput } = require('../validators/resumeSchema.validator');
const multer = require('multer');
const fs     = require('fs');
const path   = require('path');

// Helper: safely delete a file without crashing if it doesn't exist
function safeUnlink(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
    }
}

// Helper: sanitize client filename (strip path components, allow only safe chars)
function sanitizeFileName(original) {
    const base = path.basename(original || 'resume.pdf');
    // Allow letters, digits, hyphens, underscores, dots only
    return base.replace(/[^a-zA-Z0-9\-_. ]/g, '_').slice(0, 200);
}

const getProfile = async (req, res, next) => {
    try {
        const targetUserId = req.params.id;

        // Authorization Rule: Only the student themselves or a placement officer can view the profile.
        if (req.user.role === 'student' && req.user.id.toString() !== targetUserId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You are not authorized to view this profile' }
            });
        }
        if (req.user.role === 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Recruiters cannot access profiles directly via this endpoint' }
            });
        }

        let profile = await studentService.getProfileByUserId(targetUserId);

        if (!profile) {
            // If the profile does not exist yet (e.g. newly registered),
            // return a shell so the frontend form doesn't break.
            // When they save, PATCH will upsert it.
            if (req.user.id.toString() === targetUserId) {
                profile = {
                    userId: req.user.id,
                    name: req.user.name,
                    email: req.user.email,
                    skills: [],
                    projects: [],
                    certifications: [],
                    experience: [],
                    education: []
                };
            } else {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Student profile not found' }
                });
            }
        }

        res.status(200).json({
            success: true,
            data: profile
        });
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const targetUserId = req.params.id;

        // Authorization Rule: ONLY the student themselves can PATCH their profile.
        if (req.user.role !== 'student') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only students can update their own profiles' }
            });
        }

        if (req.user.id.toString() !== targetUserId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You are not authorized to update this profile' }
            });
        }

        // Strict Allowlist for PATCH
        const allowedUpdates = [
            'name', 'phone', 'branch', 'graduationYear', 'cgpa', 'backlogs',
            'skills', 'projects', 'certifications', 'experience', 'education'
        ];
        
        const updateData = {};
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = req.body[key];
            }
        });

        // Ensure we don't accidentally wipe required nested fields if empty objects are sent
        // Validation will primarily be handled by Mongoose schema constraints

        const updatedProfile = await studentService.updateProfileByUserId(targetUserId, updateData);

        res.status(200).json({
            success: true,
            data: updatedProfile
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            err.status = 400;
            err.code = 'VALIDATION_ERROR';
        }
        next(err);
    }
};

module.exports = {
    getProfile,
    updateProfile,
    uploadResume,
    getResume,
    uploadProfilePicture,
    getProfilePicture,
    deleteProfilePicture
};

async function authorizeStudentAssetAccess(req, targetUserId) {
    if (req.user.role === 'student') return req.user.id.toString() === targetUserId;
    if (req.user.role === 'placement') return true;
    if (req.user.role !== 'recruiter') return false;
    const ownedJobs = await Job.find({ recruiterId: req.user.id }).select('_id').lean();
    return Boolean(ownedJobs.length && await Application.exists({
        studentId: targetUserId,
        jobId: { $in: ownedJobs.map((job) => job._id) }
    }));
}

function assetPath(fileName) {
    const safeName = path.basename(String(fileName || ''));
    return safeName ? path.join(__dirname, '../../uploads', safeName) : null;
}

async function getResume(req, res, next) {
    try {
        const targetId = req.params.id;
        if (!mongooseIdValid(targetId)) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Student ID is invalid.' } });
        if (!await authorizeStudentAssetAccess(req, targetId)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to access this resume.' } });
        const profile = await Student.findOne({ userId: targetId }).select('resume').lean();
        const file = assetPath(profile?.resume?.storedFileName);
        if (!file || !fs.existsSync(file)) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'No resume is available.' } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${req.query.download === 'true' ? 'attachment' : 'inline'}; filename="${sanitizeFileName(profile.resume.originalFileName || 'resume.pdf')}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.sendFile(file);
    } catch (err) { next(err); }
}

async function uploadProfilePicture(req, res, next) {
    const file = req.file;
    try {
        if (req.user.role !== 'student' || req.user.id.toString() !== req.params.id) {
            if (file) safeUnlink(file.path);
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only upload their own profile picture.' } });
        }
        if (!file) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Choose an image to upload.' } });
        const bytes = fs.readFileSync(file.path);
        const signatures = {
            'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
            'image/png': bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
            'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        };
        if (!signatures[file.mimetype]) {
            safeUnlink(file.path);
            return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'The uploaded file is not a valid JPG, PNG, or WebP image.' } });
        }
        const profile = await Student.findOne({ userId: req.params.id }) || await studentService.updateProfileByUserId(req.params.id, {});
        const oldPath = assetPath(profile.profilePicture?.fileName);
        profile.profilePicture = { fileName: file.filename, contentType: file.mimetype, updatedAt: new Date() };
        await profile.save();
        if (oldPath && oldPath !== file.path) safeUnlink(oldPath);
        return res.status(200).json({ success: true, data: { updatedAt: profile.profilePicture.updatedAt } });
    } catch (err) { if (file) safeUnlink(file.path); next(err); }
}

async function getProfilePicture(req, res, next) {
    try {
        if (!mongooseIdValid(req.params.id)) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Student ID is invalid.' } });
        if (!await authorizeStudentAssetAccess(req, req.params.id)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to access this profile picture.' } });
        const profile = await Student.findOne({ userId: req.params.id }).select('profilePicture').lean();
        const file = assetPath(profile?.profilePicture?.fileName);
        if (!file || !fs.existsSync(file)) return res.status(404).json({ success: false, error: { code: 'PICTURE_NOT_FOUND', message: 'No profile picture is available.' } });
        res.setHeader('Content-Type', profile.profilePicture.contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.sendFile(file);
    } catch (err) { next(err); }
}

async function deleteProfilePicture(req, res, next) {
    try {
        if (req.user.role !== 'student' || req.user.id.toString() !== req.params.id) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only remove their own profile picture.' } });
        const profile = await Student.findOne({ userId: req.params.id });
        if (!profile?.profilePicture?.fileName) return res.status(404).json({ success: false, error: { code: 'PICTURE_NOT_FOUND', message: 'No profile picture is available.' } });
        const file = assetPath(profile.profilePicture.fileName);
        profile.profilePicture = undefined;
        await profile.save();
        if (file) safeUnlink(file);
        return res.status(200).json({ success: true, message: 'Profile picture removed.' });
    } catch (err) { next(err); }
}

function mongooseIdValid(value) {
    return /^[a-f\d]{24}$/i.test(value);
}

// ─── uploadResume ─────────────────────────────────────────────────────────────
/**
 * POST /api/students/:id/resume
 *
 * Full pipeline:
 *  multer → magic-byte check → text extraction → AI parsing
 *          → schema validation → selective DB merge → success
 *
 * Failure atomicity: any failure after upload deletes the uploaded file.
 * MongoDB is not modified unless every step succeeds.
 */
async function uploadResume(req, res, next) {
    const uploadedFilePath = req.file ? req.file.path : null;

    try {
        const targetUserId = req.params.id;

        // ── Authorization ──────────────────────────────────────────────────
        if (req.user.role !== 'student') {
            safeUnlink(uploadedFilePath);
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only students can upload resumes' }
            });
        }

        if (req.user.id.toString() !== targetUserId) {
            safeUnlink(uploadedFilePath);
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You are not authorized to upload for this profile' }
            });
        }

        // ── File presence check (multer already validated type/size) ───────
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: 'NO_FILE', message: 'No file was uploaded. Include a PDF in the "resume" field.' }
            });
        }

        // ── Stage 1: PDF text extraction (includes magic-byte check) ───────
        console.log("Uploaded file size:", fs.statSync(uploadedFilePath).size);
        const rawText = await extractText(uploadedFilePath);

        // ── Stage 2: LLM resume parsing ────────────────────────────────────
        const rawLlmOutput = await parseResumeText(rawText);

        // ── Stage 3: Schema validation ──────────────────────────────────────
        const validated = validateResumeOutput(rawLlmOutput);

        // ── Stage 4: Selective DB merge ─────────────────────────────────────
        const originalFileName = sanitizeFileName(req.file.originalname);
        const storedFileName   = req.file.filename;
        const fileUrl          = `/uploads/${storedFileName}`;

        const updatedProfile = await studentService.applyResumeData(
            targetUserId,
            validated,
            { originalFileName, storedFileName, fileUrl, uploadedAt: new Date() }
        );

        // ── Success: file is retained ───────────────────────────────────────
        return res.status(200).json({
            success: true,
            data: {
                resume: {
                    originalFileName,
                    storedFileName,
                    fileUrl,
                    uploadedAt: updatedProfile.resume.uploadedAt
                },
                profile: {
                    skills:         updatedProfile.skills,
                    projects:       updatedProfile.projects,
                    certifications: updatedProfile.certifications,
                    experience:     updatedProfile.experience,
                    education:      updatedProfile.education
                }
            },
            message: 'Resume processed successfully'
        });

    } catch (err) {
        // ── Atomic cleanup: delete uploaded file on any failure ─────────────
        safeUnlink(uploadedFilePath);

        // Multer errors (file size / type)
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                error: {
                    code:    'FILE_ERROR',
                    message: err.code === 'LIMIT_FILE_SIZE'
                        ? `File is too large. Maximum allowed size is ${Math.round((parseInt(process.env.MAX_FILE_SIZE) || 5242880) / 1024 / 1024)} MB.`
                        : err.message
                }
            });
        }

        next(err);
    }
}
