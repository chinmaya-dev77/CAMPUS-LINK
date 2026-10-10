const studentService = require('../services/student.service');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const Offer = require('../models/Offer');
const { extractText, renderPdfPages } = require('../services/pdf.service');
const { parseResumeText, extractResumeTextFromImages } = require('../services/ai.service');
const { validateResumeOutput, extractGraduationYear, extractTechnicalSkillsFromResumeText } = require('../validators/resumeSchema.validator');
const { normalizeBranch } = require('../services/branch.domain');
const multer = require('multer');
const fs     = require('fs');
const path   = require('path');
const { uploadBuffer, deleteAsset, downloadAsset } = require('../services/cloudinary.service');

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

        if (profile.profilePicture?.fileName) {
            profile.profilePicture.fileUrl = `/api/students/${targetUserId}/profile-picture`;
        }
        res.status(200).json({
            success: true,
            data: profile
        });
    } catch (err) {
        next(err);
    }
};

// Placement directory projection: expose only fields used by the placement
// workspace, and never return contact details or stored asset paths here.
const listPlacementStudents = async (req, res, next) => {
    try {
        const users = await User.find({ role: 'student', isActive: true }).select('_id name').sort({ name: 1 }).lean();
        const ids = users.map((user) => user._id);
        const [profiles, applicationRows, offerRows] = await Promise.all([
            Student.find({ userId: { $in: ids } }).select('userId name branch graduationYear cgpa backlogs skills projects readiness.score readiness.category readiness.calculatedAt profilePicture +readiness.sourceHash'),
            Application.aggregate([
                { $match: { studentId: { $in: ids } } },
                { $group: { _id: { studentId: '$studentId', status: '$status' }, count: { $sum: 1 } } }
            ]),
            Offer.aggregate([
                { $match: { studentId: { $in: ids } } },
                { $group: { _id: { studentId: '$studentId', status: '$offerStatus' }, count: { $sum: 1 } } }
            ])
        ]);
        const userById = new Map(users.map((user) => [String(user._id), user]));
        const appsById = new Map();
        applicationRows.forEach((row) => {
            const id = String(row._id.studentId);
            const statuses = appsById.get(id) || {};
            statuses[row._id.status] = row.count;
            appsById.set(id, statuses);
        });
        const offersById = new Map();
        offerRows.forEach((row) => {
            const id = String(row._id.studentId);
            const statuses = offersById.get(id) || {};
            statuses[row._id.status] = row.count;
            offersById.set(id, statuses);
        });
        // Placement directories represent persisted profiles, not role accounts.
        const readinessService = require('../services/readiness/readiness.service');
        const data = await Promise.all(profiles.filter((profile) => userById.has(String(profile.userId))).map(async (profile) => {
            const readiness = await readinessService.ensureReadiness(profile);
            const user = userById.get(String(profile.userId));
            const applicationStatuses = appsById.get(String(user._id)) || {};
            const offerStatuses = offersById.get(String(user._id)) || {};
            return {
                userId: user._id,
                name: profile.name || user.name,
                branch: profile.branch || null,
                graduationYear: profile.graduationYear ?? null,
                cgpa: profile.cgpa ?? null,
                readiness: readiness ? {
                    score: readiness.score ?? null,
                    category: readiness.category || null,
                    calculatedAt: readiness.calculatedAt || null
                } : null,
                hasProfilePicture: Boolean(profile.profilePicture?.fileName),
                applicationStatuses,
                applicationCount: Object.values(applicationStatuses).reduce((sum, count) => sum + count, 0),
                offerStatuses,
                offerCount: Object.values(offerStatuses).reduce((sum, count) => sum + count, 0)
            };
        }));
        res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
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
            'name', 'phone', 'registrationNumber', 'branch', 'graduationYear', 'cgpa', 'backlogs',
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
    listPlacementStudents,
    getProfile,
    updateProfile,
    uploadResume,
    retryResumeAnalysis,
    deleteResume,
    getResume,
    uploadProfilePicture,
    getProfilePicture,
    deleteProfilePicture,
    analyzeResumeBuffer
};

async function authorizeStudentAssetAccess(req, targetUserId) {
    if (req.user.role === 'student') return req.user.id.toString() === targetUserId;
    if (req.user.role === 'placement') return true;
    if (req.user.role !== 'recruiter') return false;
    // Recruiters may view a matched candidate's photo only in the context of
    // a job they own. The My Jobs candidate list includes students who have
    // not applied yet, so the application-only rule below is insufficient
    // for that explicitly authorized matching view.
    const contextJobId = req.query.jobId;
    if (contextJobId) {
        const ownedJob = await Job.exists({ _id: contextJobId, recruiterId: req.user.id });
        if (!ownedJob) return false;
        return Boolean(await Student.exists({ userId: targetUserId, 'profilePicture.fileName': { $exists: true, $ne: '' } }));
    }
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
        const profile = await Student.findOne({ userId: targetId }).select('resume +resume.publicId +resume.resourceType').lean();
        if (!profile?.resume?.storedFileName) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'No resume is available.' } });
        const bytes = profile.resume.publicId
            ? await downloadAsset(profile.resume.publicId, profile.resume.resourceType, path.extname(profile.resume.originalFileName || '').slice(1))
            : fs.existsSync(assetPath(profile.resume.storedFileName)) ? fs.readFileSync(assetPath(profile.resume.storedFileName)) : null;
        if (!bytes) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'No resume is available.' } });
        res.setHeader('Content-Type', profile.resume.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `${req.query.download === 'true' ? 'attachment' : 'inline'}; filename="${sanitizeFileName(profile.resume.originalFileName || 'resume.pdf')}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(bytes);
    } catch (err) { next(err); }
}

async function deleteResume(req, res, next) {
    try {
        const targetId = req.params.id;
        if (!mongooseIdValid(targetId)) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Student ID is invalid.' } });
        if (req.user.role !== 'student' || req.user.id.toString() !== targetId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only delete their own resume.' } });
        const profile = await Student.findOne({ userId: targetId }).select('+resume.publicId +resume.resourceType');
        if (!profile?.resume?.storedFileName) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'No resume is available.' } });
        const old = { publicId: profile.resume.publicId, resourceType: profile.resume.resourceType, file: assetPath(profile.resume.storedFileName) };
        profile.resume = undefined;
        await profile.save();
        if (old.publicId) await deleteAsset(old.publicId, old.resourceType).catch(() => {}); else if (old.file) safeUnlink(old.file);
        await studentService.refreshApplicationEligibility(profile);
        return res.status(200).json({ success: true, message: 'Resume removed.' });
    } catch (err) { next(err); }
}

async function uploadProfilePicture(req, res, next) {
    const file = req.file;
    let uploadedAsset = null;
    try {
        if (req.user.role !== 'student' || req.user.id.toString() !== req.params.id) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only upload their own profile picture.' } });
        }
        if (!file) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Choose an image to upload.' } });
        const bytes = file.buffer;
        const signatures = {
            'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
            'image/png': bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
            'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        };
        if (!signatures[file.mimetype]) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'The uploaded file is not a valid JPG, PNG, or WebP image.' } });
        }
        const profile = await Student.findOne({ userId: req.params.id }).select('+profilePicture.publicId +profilePicture.resourceType') || await studentService.updateProfileByUserId(req.params.id, {});
        const asset = uploadedAsset = await uploadBuffer(bytes, { folder: 'campuslink/profile-pictures', resourceType: 'image', originalFilename: sanitizeFileName(file.originalname) });
        const oldAsset = { publicId: profile.profilePicture?.publicId, resourceType: profile.profilePicture?.resourceType, path: assetPath(profile.profilePicture?.fileName) };
        profile.profilePicture = { fileName: asset.publicId, fileUrl: `/api/students/${req.params.id}/profile-picture`, publicId: asset.publicId, resourceType: asset.resourceType, secureUrl: asset.secureUrl, contentType: file.mimetype, updatedAt: new Date() };
        await profile.save();
        if (oldAsset.publicId) await deleteAsset(oldAsset.publicId, oldAsset.resourceType).catch(() => {}); else if (oldAsset.path) safeUnlink(oldAsset.path);
        return res.status(200).json({ success: true, data: { updatedAt: profile.profilePicture.updatedAt, fileUrl: profile.profilePicture.fileUrl } });
    } catch (err) { if (uploadedAsset?.publicId) await deleteAsset(uploadedAsset.publicId, uploadedAsset.resourceType).catch(() => {}); next(err); }
}

async function getProfilePicture(req, res, next) {
    try {
        if (!mongooseIdValid(req.params.id)) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Student ID is invalid.' } });
        if (!await authorizeStudentAssetAccess(req, req.params.id)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to access this profile picture.' } });
        // Select individual paths. Selecting the parent object and its child
        // fields together produces a MongoDB projection path-collision error.
        const profile = await Student.findOne({ userId: req.params.id }).select('profilePicture.fileName profilePicture.fileUrl profilePicture.contentType profilePicture.publicId profilePicture.resourceType profilePicture.secureUrl').lean();
        const picture = profile?.profilePicture;
        const legacyPath = assetPath(picture?.fileName);
        const legacyCloudinaryId = picture?.fileName && !fs.existsSync(legacyPath) ? picture.fileName : null;
        const cloudinaryPublicId = picture?.publicId || legacyCloudinaryId;
        const imageFormat = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[picture?.contentType]
            || path.extname(picture?.secureUrl || '').slice(1).toLowerCase()
            || path.extname(picture?.fileName || '').slice(1).toLowerCase();
        const bytes = cloudinaryPublicId
            ? await downloadAsset(cloudinaryPublicId, picture?.resourceType || 'image', imageFormat)
            : picture?.fileName && fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath) : null;
        if (!bytes) return res.status(404).json({ success: false, error: { code: 'PICTURE_NOT_FOUND', message: 'No profile picture is available.' } });
        const contentType = supportedPictureType(profile.profilePicture.contentType) || detectPictureType(bytes);
        if (!contentType) return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_IMAGE_TYPE', message: 'The stored profile picture is not a supported image.' } });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(bytes);
    } catch (err) { next(err); }
}

function supportedPictureType(value) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(value) ? value : null;
}

function detectPictureType(bytes) {
    if (!Buffer.isBuffer(bytes)) return null;
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

async function deleteProfilePicture(req, res, next) {
    try {
        if (req.user.role !== 'student' || req.user.id.toString() !== req.params.id) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only remove their own profile picture.' } });
        const profile = await Student.findOne({ userId: req.params.id }).select('+profilePicture.publicId +profilePicture.resourceType');
        if (!profile?.profilePicture?.fileName) return res.status(404).json({ success: false, error: { code: 'PICTURE_NOT_FOUND', message: 'No profile picture is available.' } });
        const old = { publicId: profile.profilePicture.publicId, resourceType: profile.profilePicture.resourceType, path: assetPath(profile.profilePicture.fileName) };
        profile.profilePicture = undefined;
        await profile.save();
        if (old.publicId) await deleteAsset(old.publicId, old.resourceType).catch(() => {}); else if (old.path) safeUnlink(old.path);
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
 * Upload persistence is independent from AI analysis: parsing failures retain
 * the protected Cloudinary file and can be retried by the student.
 */
async function uploadResume(req, res, next) {
    let uploadedCloudinaryAsset = null;
    let resumePersisted = false;

    try {
        const targetUserId = req.params.id;

        // ── Authorization ──────────────────────────────────────────────────
        if (req.user.role !== 'student') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only students can upload resumes' }
            });
        }

        if (req.user.id.toString() !== targetUserId) {
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
        if (!Buffer.isBuffer(req.file.buffer) || req.file.buffer.length < 12) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_RESUME_FILE', message: 'Choose a valid PDF, JPG, PNG, or WebP resume file.' } });
        }
        const contentType = req.file.mimetype === 'image/jpg' ? 'image/jpeg' : req.file.mimetype;
        const validSignature = contentType === 'application/pdf'
            ? req.file.buffer.subarray(0, 4).toString('ascii') === '%PDF'
            : contentType === 'image/jpeg' ? req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff
                : contentType === 'image/png' ? req.file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
                    : contentType === 'image/webp' && req.file.buffer.toString('ascii', 0, 4) === 'RIFF' && req.file.buffer.toString('ascii', 8, 12) === 'WEBP';
        if (!validSignature) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_RESUME_FILE', message: 'Choose a valid PDF, JPG, PNG, or WebP resume file.' } });
        }

        const originalFileName = sanitizeFileName(req.file.originalname);
        const asset = uploadedCloudinaryAsset = await uploadBuffer(req.file.buffer, {
            folder: 'campuslink/resumes', resourceType: 'raw', originalFilename: originalFileName
        });
        const storedFileName = asset.publicId;
        const previousProfile = await Student.findOne({ userId: targetUserId }).select('resume.storedFileName resume.publicId resume.resourceType');
        const resumeMeta = {
            originalFileName, storedFileName, fileUrl: `/api/students/${targetUserId}/resume`,
            publicId: asset.publicId, resourceType: asset.resourceType, secureUrl: asset.secureUrl,
            contentType, analysisStatus: 'PROCESSING', uploadedAt: new Date()
        };
        const user = await User.findById(targetUserId).select('name email');
        if (!user) {
            await deleteAsset(asset.publicId, asset.resourceType).catch(() => {});
            uploadedCloudinaryAsset = null;
            return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Student account not found.' } });
        }
        const storedProfile = await Student.findOneAndUpdate(
            { userId: targetUserId },
            { $set: { resume: resumeMeta }, $setOnInsert: { name: user.name, email: user.email } },
            { new: true, upsert: true, runValidators: true }
        );
        resumePersisted = true;
        if (previousProfile?.resume?.publicId && previousProfile.resume.publicId !== asset.publicId) await deleteAsset(previousProfile.resume.publicId, previousProfile.resume.resourceType).catch(() => {});
        else if (previousProfile?.resume?.storedFileName && previousProfile.resume.storedFileName !== storedFileName) safeUnlink(assetPath(previousProfile.resume.storedFileName));

        const result = await analyzeResumeBuffer(targetUserId, req.file.buffer, resumeMeta);
        const updatedProfile = result.profile || storedProfile;

        return res.status(200).json({
            success: true,
            data: {
                resume: {
                    originalFileName, storedFileName, fileUrl: `/api/students/${targetUserId}/resume`,
                    uploadedAt: updatedProfile.resume.uploadedAt, analysisStatus: updatedProfile.resume.analysisStatus,
                    analysisError: updatedProfile.resume.analysisError
                },
                profile: {
                    branch: updatedProfile.branch, graduationYear: updatedProfile.graduationYear, cgpa: updatedProfile.cgpa,
                    skills: updatedProfile.skills, projects: updatedProfile.projects,
                    certifications: updatedProfile.certifications, experience: updatedProfile.experience,
                    education: updatedProfile.education
                },
                analysis: { status: updatedProfile.resume.analysisStatus, message: updatedProfile.resume.analysisError || 'Resume analysis completed.' }
            },
            message: result.success ? 'Resume uploaded and processed successfully.' : 'Resume uploaded successfully, but AI analysis needs attention.'
        });

    } catch (err) {
        if (uploadedCloudinaryAsset?.publicId && !resumePersisted) await deleteAsset(uploadedCloudinaryAsset.publicId, uploadedCloudinaryAsset.resourceType).catch(() => {});

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

function usableResumeText(text) {
    return (String(text || '').match(/[\p{L}\p{N}]/gu) || []).length >= 20;
}

async function extractResumeTextWithFallback(buffer, contentType = 'application/pdf', dependencies = {}, options = {}) {
    const transcribe = dependencies.extractResumeTextFromImages || extractResumeTextFromImages;
    if (String(contentType || '').startsWith('image/')) {
        const text = await transcribe([{ buffer, contentType }], options);
        if (usableResumeText(text)) return { text, usedVision: true };
        const error = new Error('No usable resume content could be extracted from the image.');
        error.code = 'RESUME_TEXT_UNAVAILABLE'; error.status = 422; throw error;
    }
    try {
        const text = await (dependencies.extractText || extractText)(buffer);
        if (usableResumeText(text)) return { text, usedVision: false };
    } catch (parseError) {
        if (!['EMPTY_PDF', 'PDF_PARSE_ERROR', 'PDF_PARSE_TIMEOUT'].includes(parseError.code)) throw parseError;
    }
    const pages = await (dependencies.renderPdfPages || renderPdfPages)(buffer, 3);
    const text = await transcribe(pages.map((page) => ({ buffer: page, contentType: 'image/jpeg' })), options);
    if (usableResumeText(text)) return { text, usedVision: true };
    const error = new Error('Resume content could not be extracted from the PDF. Please upload a clearer PDF or retry analysis.');
    error.code = 'RESUME_TEXT_UNAVAILABLE'; error.status = 422; throw error;
}

function hasUsableResumeData(data) {
    if (data.name?.trim() || data.phone?.trim() || data.branch?.trim() || Number.isFinite(data.graduationYear) || Number.isFinite(data.cgpa)) return true;
    return [
        ...(data.skills || []).map((item) => item.name),
        ...(data.projects || []).flatMap((item) => [item.title, item.description, ...(item.technologies || [])]),
        ...(data.certifications || []).flatMap((item) => [item.name, item.issuer]),
        ...(data.experience || []).flatMap((item) => [item.company, item.role, item.description]),
        ...(data.education || []).flatMap((item) => [item.institution, item.degree, item.field])
    ].some((value) => typeof value === 'string' && value.trim());
}

function resumeAnalysisMessage(error) {
    if (error.code === 'INVALID_PDF') return 'Resume uploaded successfully, but the file is not a valid PDF.';
    if (error.code === 'PDF_RENDERER_UNAVAILABLE') return 'Resume uploaded successfully, but this server cannot read scanned PDFs right now. Upload a text-based PDF or retry later.';
    if (error.code === 'PDF_RENDER_FAILED') return 'Resume uploaded successfully, but this PDF could not be rendered. It may be corrupt, encrypted, or password-protected.';
    if (error.code === 'EMPTY_PDF' || error.code === 'RESUME_TEXT_UNAVAILABLE') return 'Resume content could not be extracted. Please upload a clearer PDF or retry analysis.';
    if (error.code === 'EMPTY_RESUME_EXTRACTION') return 'Resume text was readable, but no usable profile information could be extracted. Please check the PDF or retry analysis.';
    return 'Resume uploaded successfully, but AI analysis could not be completed. Your file is saved; retry analysis when ready.';
}

function mergeResumeExtractions(primary, fallback) {
    const merged = { ...primary };
    for (const field of ['name', 'phone', 'branch', 'graduationYear', 'cgpa']) {
        if ((merged[field] == null || merged[field] === '') && fallback[field] != null && fallback[field] !== '') merged[field] = fallback[field];
    }
    for (const field of ['skills', 'projects', 'certifications', 'experience', 'education']) {
        const current = merged[field] || [];
        const seen = new Set(current.map((item) => JSON.stringify(item).toLowerCase()));
        merged[field] = [...current, ...(fallback[field] || []).filter((item) => {
            const key = JSON.stringify(item).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
        })];
    }
    return merged;
}

async function analyzeResumeBuffer(userId, buffer, resumeMeta, options = {}) {
    const dependencies = options.dependencies || {};
    const profileService = dependencies.studentService || studentService;
    const StudentModel = dependencies.Student || Student;
    const parseResume = dependencies.parseResumeText || parseResumeText;
    const validate = dependencies.validateResumeOutput || validateResumeOutput;
    try {
        const extraction = await extractResumeTextWithFallback(buffer, resumeMeta?.contentType || 'application/pdf', dependencies, options.bulkResume ? { bulkResume: true } : {});
        let validated = validate(await parseResume(extraction.text, options.bulkResume ? { bulkResume: true } : {}));
        if (extraction.usedVision === false && (!validated.branch || validated.graduationYear == null || !validated.skills?.length)) {
            try {
                const pages = await (dependencies.renderPdfPages || renderPdfPages)(buffer, 3);
                const visualText = await (dependencies.extractResumeTextFromImages || extractResumeTextFromImages)(pages.map((page) => ({ buffer: page, contentType: 'image/jpeg' })), options.bulkResume ? { bulkResume: true } : {});
                if (usableResumeText(visualText)) {
                    const visual = validate(await parseResume(visualText, options.bulkResume ? { bulkResume: true } : {}));
                    validated = mergeResumeExtractions(validated, visual);
                }
            } catch (visionError) {
                // A successful searchable-text extraction remains usable if the optional visual pass fails.
                if (visionError.code === 'AI_RATE_LIMITED' || visionError.code === 'AI_NOT_CONFIGURED') throw visionError;
            }
        }
        // Some PDFs yield readable text, but the model may omit the skills
        // array (or use an unsupported shape). Recover only from an explicit
        // skills section in the extracted text; never infer from arbitrary prose.
        if (!validated.skills?.length) {
            validated.skills = extractTechnicalSkillsFromResumeText(extraction.text);
        }
        if (validated.graduationYear == null) validated.graduationYear = extractGraduationYear(extraction.text) ?? undefined;
        if (!validated.branch) {
            const education = validated.education || [];
            const academicText = education.map((item) => `${item.degree || ''} ${item.field || ''}`).join(' ');
            const branchHint = /computer\s+engineering/i.test(academicText) ? 'Computer Engineering'
                : /computer\s+science|\bCSE\b/i.test(academicText) ? 'Computer Science & Engineering' : '';
            if (branchHint) validated.branch = normalizeBranch(branchHint);
        } else validated.branch = normalizeBranch(validated.branch);
        if (!hasUsableResumeData(validated)) {
            const error = new Error('The AI did not extract usable profile information from the resume.');
            error.code = 'EMPTY_RESUME_EXTRACTION'; error.status = 422; throw error;
        }
        const profile = await profileService.applyResumeData(userId, validated, {
            ...resumeMeta, analysisStatus: 'COMPLETED', analysisError: undefined
        });
        await profileService.refreshApplicationEligibility(profile);
        return { success: true, profile };
    } catch (error) {
        const message = resumeAnalysisMessage(error).slice(0, 500);
        const profile = await StudentModel.findOneAndUpdate({ userId }, {
            $set: { 'resume.analysisStatus': 'FAILED', 'resume.analysisError': message }
        }, { new: true });
        return { success: false, profile, error };
    }
}

async function retryResumeAnalysis(req, res, next) {
    try {
        const targetUserId = req.params.id;
        if (req.user.role !== 'student' || req.user.id.toString() !== targetUserId) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Students may only retry analysis for their own resume.' } });
        }
        const profile = await Student.findOne({ userId: targetUserId }).select('+resume.publicId +resume.resourceType');
        if (!profile?.resume?.storedFileName) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'No resume is available to analyze.' } });
        const buffer = profile.resume.publicId
            ? await downloadAsset(profile.resume.publicId, profile.resume.resourceType, path.extname(profile.resume.originalFileName || '').slice(1))
            : fs.existsSync(assetPath(profile.resume.storedFileName)) ? fs.readFileSync(assetPath(profile.resume.storedFileName)) : null;
        if (!buffer) return res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'The saved resume file is unavailable.' } });
        const resumeMeta = profile.resume.toObject ? profile.resume.toObject() : { ...profile.resume };
        resumeMeta.analysisStatus = 'PROCESSING'; resumeMeta.analysisError = undefined;
        profile.resume.analysisStatus = 'PROCESSING'; profile.resume.analysisError = undefined; await profile.save();
        const result = await analyzeResumeBuffer(targetUserId, buffer, resumeMeta);
        return res.status(200).json({
            success: true,
            data: { resume: { analysisStatus: result.profile.resume.analysisStatus, analysisError: result.profile.resume.analysisError }, profile: result.profile },
            message: result.profile.resume.analysisError || 'Resume analysis completed.'
        });
    } catch (error) { next(error); }
}
