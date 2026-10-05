'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ZIP = path.resolve(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'campuslink_50_cs_resumes_parser_safe.zip');
const STATE_FILE = path.join(ROOT, '.demo-student-seed-state.json');
const STATE_TMP = `${STATE_FILE}.tmp`;
const CSV_FILE = path.join(ROOT, 'campuslink-50-student-credentials.csv');
const EMAIL_DOMAIN = 'gmail.com';
const EXPECTED_COUNT = 50;
const PDF_MAX_BYTES = 25 * 1024 * 1024;

// This account is intentionally excluded from bulk --reanalyze until its
// attached resume is reviewed. Keep this exception explicit; do not infer it
// from a filename mismatch or silently skip other students.
const REANALYZE_EXCLUSIONS = Object.freeze([
    Object.freeze({
        email: 'simrankaur37@gmail.com',
        name: 'Simran Kaur',
        filename: '15_Simran_Kaur.pdf'
    })
]);

// These are the real application paths used by registration, resume upload,
// and resume analysis. They are required in dry-run mode only to verify wiring.
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const authService = require('../src/services/auth.service');
const studentService = require('../src/services/student.service');
const cloudinaryService = require('../src/services/cloudinary.service');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');

function parseFilename(entry) {
    const base = path.posix.basename(entry);
    const match = base.match(/^(\d{2})_([A-Za-z]+(?:_[A-Za-z]+)*)\.pdf$/i);
    if (!match || entry !== base) throw new Error(`Unexpected resume archive entry: ${entry}`);
    const number = Number(match[1]);
    const words = match[2].split('_');
    const name = words.map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ');
    const emailLocal = words.map((part) => part.toLowerCase()).join('');
    const firstName = words[0].toLowerCase();
    return {
        number,
        filename: base,
        name,
        email: `${emailLocal}${number + 22}@${EMAIL_DOMAIN}`,
        password: `${firstName}@1234`
    };
}

function prepareReanalysisBatch(students) {
    const excluded = [];
    const excludedEmails = new Set();

    for (const exclusion of REANALYZE_EXCLUSIONS) {
        const mappedStudent = students.find((student) => student.email === exclusion.email);
        if (!mappedStudent) {
            throw new Error(`Reanalysis input is missing explicitly excluded student ${exclusion.email} (${exclusion.filename}).`);
        }
        if (mappedStudent.name !== exclusion.name || mappedStudent.filename !== exclusion.filename) {
            throw new Error(`Reanalysis exclusion mapping changed for ${exclusion.email}; expected ${exclusion.filename} (${exclusion.name}).`);
        }
        excluded.push(exclusion);
        excludedEmails.add(exclusion.email);
    }

    return {
        students: students.filter((student) => !excludedEmails.has(student.email)),
        excluded
    };
}

async function listZipPdfs(zipPath) {
    const resolvedZip = path.resolve(zipPath);
    const stat = await fs.stat(resolvedZip).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Resume ZIP was not found: ${resolvedZip}`);
    const { stdout } = await execFileAsync('tar', ['-tf', resolvedZip], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const entries = stdout.split(/\r?\n/).filter(Boolean);
    if (entries.length !== EXPECTED_COUNT) throw new Error(`Expected exactly ${EXPECTED_COUNT} ZIP entries; found ${entries.length}.`);
    const students = entries.map(parseFilename).sort((a, b) => a.number - b.number);
    const emails = new Set();
    students.forEach((student, index) => {
        if (student.number !== index + 1) throw new Error(`Resume numbering must be continuous from 01 to 50; found ${student.filename}.`);
        if (emails.has(student.email)) throw new Error(`Duplicate generated login email: ${student.email}`);
        emails.add(student.email);
    });
    return { zipPath: resolvedZip, students };
}

async function readPdf(zipPath, filename) {
    const { stdout: buffer } = await execFileAsync('tar', ['-xOf', zipPath, filename], {
        encoding: 'buffer', maxBuffer: PDF_MAX_BYTES, windowsHide: true
    });
    if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
        throw new Error(`${filename} is not a valid PDF (missing PDF signature).`);
    }
    return buffer;
}

async function readAttachedResume(profile, expectedFilename, expectedChecksum) {
    if (profile.resume?.originalFileName !== expectedFilename || !profile.resume?.storedFileName) {
        const error = new Error(`Attached resume does not match ${expectedFilename}.`);
        error.code = 'ATTACHED_RESUME_MISMATCH';
        throw error;
    }
    let buffer;
    if (profile.resume.publicId) {
        if (typeof cloudinaryService.downloadAsset !== 'function') throw new Error('Existing Cloudinary download service is unavailable.');
        buffer = await cloudinaryService.downloadAsset(profile.resume.publicId, profile.resume.resourceType, path.extname(expectedFilename).slice(1));
    } else {
        const localPath = path.join(ROOT, 'uploads', path.basename(profile.resume.storedFileName));
        buffer = await fs.readFile(localPath);
    }
    if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
        const error = new Error(`Attached resume ${expectedFilename} is unavailable or is not a PDF.`);
        error.code = 'ATTACHED_RESUME_UNAVAILABLE';
        throw error;
    }
    if (sha256(buffer) !== expectedChecksum) {
        const error = new Error(`Attached resume content does not match the archive mapping for ${expectedFilename}.`);
        error.code = 'ATTACHED_RESUME_CHECKSUM_MISMATCH';
        throw error;
    }
    return buffer;
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function csvCell(value) {
    const safe = String(value ?? '');
    return `"${safe.replace(/"/g, '""')}"`;
}

function credentialsCsv(rows) {
    return ['Email,Password', ...rows.map((row) => [row.email, row.password].map(csvCell).join(','))].join('\r\n') + '\r\n';
}

async function readState() {
    try {
        const state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
        if (state.version !== 1 || !state.students || typeof state.students !== 'object') throw new Error('Invalid student seed state version or structure.');
        return state;
    } catch (error) {
        if (error.code === 'ENOENT') return { version: 1, students: {} };
        throw error;
    }
}

async function saveState(state) {
    await fs.writeFile(STATE_TMP, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(STATE_TMP, STATE_FILE);
}

function getResumeAnalyzer() {
    // Lazy import keeps --skip-ai from loading the controller/provider stack.
    const studentController = require('../src/controllers/student.controller');
    if (typeof studentController.analyzeResumeBuffer !== 'function') throw new Error('Existing resume analysis pipeline is unavailable.');
    return studentController.analyzeResumeBuffer;
}

function integrationProblems({ includeAI = true } = {}) {
    const issues = [];
    if (typeof authService.hashPassword !== 'function') issues.push('Existing auth password hasher is unavailable.');
    if (typeof studentService.updateProfileByUserId !== 'function' || typeof studentService.applyResumeData !== 'function') issues.push('Existing student profile service is unavailable.');
    if (typeof cloudinaryService.uploadBuffer !== 'function' || typeof cloudinaryService.deleteAsset !== 'function' || typeof cloudinaryService.downloadAsset !== 'function') issues.push('Existing Cloudinary asset service is unavailable.');
    if (includeAI) {
        try { getResumeAnalyzer(); }
        catch (error) { issues.push(error.message); }
    }
    if (User.modelName !== 'User' || Student.modelName !== 'Student') issues.push('Expected CampusLink User/Student models were not loaded.');
    return issues;
}

async function dryRun(zipPath, skipAI, forceResumeUpload, reanalyze = false) {
    const { zipPath: resolvedZip, students } = await listZipPdfs(zipPath);
    const hashes = [];
    for (const student of students) {
        const buffer = await readPdf(resolvedZip, student.filename);
        hashes.push(sha256(buffer));
    }
    const issues = integrationProblems({ includeAI: !skipAI });
    if (issues.length) throw new Error(issues.join(' '));
    const previewCsv = credentialsCsv(students.map((student) => ({ ...student, userId: '', studentId: '', resumeStatus: 'NOT_RUN', analysisStatus: 'NOT_RUN' })));
    const csvLines = previewCsv.trimEnd().split('\r\n');
    if (csvLines.length !== EXPECTED_COUNT + 1 || csvLines[0] !== 'Email,Password'
        || csvLines.slice(1).some((line) => line.split(',').length !== 2)) {
        throw new Error('Credential CSV header/column validation failed.');
    }
    console.log(JSON.stringify({
        dryRun: true,
        skipAI,
        forceResumeUpload,
        reanalyze,
        zipPath: resolvedZip,
        pdfsValidated: students.length,
        exactMapping: students.map(({ filename, name, email }) => ({ filename, name, email })),
        uniqueEmails: new Set(students.map((student) => student.email)).size,
        uniqueResumeHashes: new Set(hashes).size,
        credentialsCsvRowsValidated: csvLines.length,
        applicationIntegrations: { authHasher: true, userModel: true, studentModel: true, studentProfileService: true, cloudinaryUploader: true, resumeAnalysisPipeline: !skipAI },
        resumeAnalysisPipelineLoaded: !skipAI,
        requiresExistingTrackedAccountsAndProfiles: forceResumeUpload || reanalyze,
        databaseConnected: false,
        cloudinaryUploads: 0,
        aiCalls: 0,
        csvWritten: false
    }, null, 2));
}

function isTrackedDemoUser(user, record, student) {
    return Boolean(record?.userId && String(record.userId) === String(user._id)
        && user.role === 'student' && user.email === student.email && user.name === student.name);
}

async function validateNoUntrackedConflicts(students, state) {
    const emails = students.map((student) => student.email);
    const [users, profiles] = await Promise.all([
        User.find({ email: { $in: emails } }).select('_id name email role').lean(),
        Student.find({ email: { $in: emails } }).select('_id userId name email').lean()
    ]);
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    const conflicts = [];
    let recoveredState = false;
    for (const expected of students) {
        const user = userByEmail.get(expected.email);
        const record = state.students[expected.email];
        if (user && !isTrackedDemoUser(user, record, expected)) {
            const recoverablePendingAccount = record?.pendingUserCreate && user.role === 'student'
                && user.email === expected.email && user.name === expected.name;
            if (recoverablePendingAccount) {
                record.userId = String(user._id);
                delete record.pendingUserCreate;
                recoveredState = true;
            } else {
                conflicts.push(`${expected.email}: existing account is not a matching account recorded by this seed.`);
                continue;
            }
        }
        if (user) {
            const profile = profileByUserId.get(String(user._id));
            if (profile && (!record?.studentId || String(record.studentId) !== String(profile._id))) {
                const recoverablePendingProfile = record?.pendingStudentProfile
                    && profile.name === expected.name && profile.email === expected.email;
                if (recoverablePendingProfile) {
                    record.studentId = String(profile._id);
                    delete record.pendingStudentProfile;
                    recoveredState = true;
                } else conflicts.push(`${expected.email}: existing Student profile is not a matching profile recorded by this seed.`);
            }
            if (profile && (profile.name !== expected.name || profile.email !== expected.email)) {
                conflicts.push(`${expected.email}: Student profile identity does not match the expected seeded account.`);
            }
        } else if (profiles.some((profile) => profile.email === expected.email)) {
            conflicts.push(`${expected.email}: an orphan Student profile already uses this email.`);
        }
    }
    if (conflicts.length) throw new Error(`Preflight found existing untracked/conflicting records; no seed records were changed. ${conflicts.join(' ')}`);
    if (recoveredState) await saveState(state);
}

async function seedOne(studentSpec, zipPath, state, { skipAI, forceResumeUpload = false, reanalyze = false, analyzeResume }) {
    const row = { ...studentSpec, userId: '', studentId: '', resumeStatus: 'FAILED', analysisStatus: 'NOT_RUN' };
    let uploadedAsset = null;
    let resumePersisted = false;
    let assetRecorded = false;
    try {
        const archiveBuffer = await readPdf(zipPath, studentSpec.filename);
        let buffer = archiveBuffer;
        const checksum = sha256(archiveBuffer);
        let stateRecord = state.students[studentSpec.email];
        let user = await User.findOne({ email: studentSpec.email });
        let profile = null;

        // A forced refresh must never create accounts or profiles. The existing
        // state manifest remains the ownership proof for records we may update.
        if ((forceResumeUpload || reanalyze) && !user) {
            row.resumeStatus = 'FAILED:FORCE_TARGET_ACCOUNT_MISSING'; row.analysisStatus = 'SKIPPED'; row.password = '';
            return row;
        }
        if (user && !isTrackedDemoUser(user, stateRecord, studentSpec)) {
            row.resumeStatus = 'SKIPPED_EXISTING_ACCOUNT';
            row.analysisStatus = 'SKIPPED';
            row.password = '';
            return row;
        }
        if (!user) {
            const orphanProfile = await Student.findOne({ email: studentSpec.email });
            if (orphanProfile) {
                row.resumeStatus = 'SKIPPED_EXISTING_PROFILE';
                row.analysisStatus = 'SKIPPED';
                row.password = '';
                return row;
            }
            stateRecord = state.students[studentSpec.email] = stateRecord || {
                name: studentSpec.name, email: studentSpec.email, pendingUserCreate: true, resume: null
            };
            stateRecord.pendingUserCreate = true;
            await saveState(state);
            const passwordHash = await authService.hashPassword(studentSpec.password);
            user = await User.create({ name: studentSpec.name, email: studentSpec.email, passwordHash, role: 'student', isActive: true });
            stateRecord.userId = String(user._id);
            delete stateRecord.pendingUserCreate;
            await saveState(state);
        }

        row.userId = String(user._id);
        if (!stateRecord) {
            // A record without this local ownership manifest is never modified.
            row.resumeStatus = 'SKIPPED_UNTRACKED_ACCOUNT';
            row.analysisStatus = 'SKIPPED';
            row.password = '';
            return row;
        }
        profile = await Student.findOne({ userId: user._id }).select('+resume.publicId +resume.resourceType +resume.secureUrl');
        if (!profile) {
            if (forceResumeUpload || reanalyze) {
                row.resumeStatus = 'FAILED:FORCE_TARGET_PROFILE_MISSING'; row.analysisStatus = 'SKIPPED'; row.password = '';
                return row;
            }
            stateRecord.pendingStudentProfile = true;
            await saveState(state);
            profile = await studentService.updateProfileByUserId(user._id, { name: user.name });
            stateRecord.studentId = String(profile._id);
            delete stateRecord.pendingStudentProfile;
            await saveState(state);
        } else if (!stateRecord.studentId || String(stateRecord.studentId) !== String(profile._id)
            || profile.email !== user.email || profile.name !== user.name) {
            row.resumeStatus = 'SKIPPED_UNTRACKED_OR_MISMATCHED_PROFILE';
            row.analysisStatus = 'SKIPPED';
            row.password = '';
            return row;
        }
        row.studentId = String(profile._id);
        stateRecord.studentId = row.studentId;
        await saveState(state);

        if (!forceResumeUpload && !reanalyze && profile.resume?.analysisStatus === 'COMPLETED') {
            row.resumeStatus = profile.resume?.storedFileName ? 'SKIPPED_ALREADY_ATTACHED' : row.resumeStatus;
            row.analysisStatus = 'SKIPPED_ALREADY_ANALYZED';
            return row;
        }

        if (reanalyze && !profile.resume?.storedFileName) {
            row.resumeStatus = 'FAILED:ATTACHED_RESUME_MISSING'; row.analysisStatus = 'SKIPPED'; row.password = '';
            return row;
        }

        let resumeMeta = null;
        const attachedFilename = profile.resume?.originalFileName;
        const seedResume = stateRecord.resume;
        const resumeMatches = seedResume?.sha256 === checksum && seedResume.filename === studentSpec.filename
            && seedResume.publicId && seedResume.resourceType && seedResume.secureUrl;
        if (!forceResumeUpload && resumeMatches && attachedFilename === studentSpec.filename && profile.resume?.publicId === seedResume.publicId) {
            resumeMeta = {
                originalFileName: studentSpec.filename, storedFileName: seedResume.publicId,
                fileUrl: `/api/students/${user._id}/resume`, publicId: seedResume.publicId,
                resourceType: seedResume.resourceType, secureUrl: seedResume.secureUrl,
                contentType: 'application/pdf', analysisStatus: profile.resume.analysisStatus || 'PROCESSING',
                analysisError: profile.resume.analysisError, uploadedAt: profile.resume.uploadedAt || new Date()
            };
            row.resumeStatus = 'SKIPPED_ALREADY_ATTACHED';
        } else if (!forceResumeUpload && (attachedFilename || profile.resume?.publicId)) {
            if (attachedFilename !== studentSpec.filename || (!reanalyze && profile.resume?.analysisStatus === 'COMPLETED')) {
                row.resumeStatus = 'SKIPPED_EXISTING_RESUME';
                row.analysisStatus = profile.resume?.analysisStatus === 'COMPLETED' ? 'SKIPPED_ALREADY_ANALYZED' : 'SKIPPED';
                row.password = '';
                return row;
            }
            // Keep the attached asset and reuse its own stored contents for analysis.
            resumeMeta = {
                ...(profile.resume.toObject ? profile.resume.toObject() : { ...profile.resume }),
                originalFileName: profile.resume.originalFileName || studentSpec.filename,
                fileUrl: `/api/students/${user._id}/resume`,
                contentType: profile.resume.contentType || 'application/pdf',
                analysisStatus: profile.resume.analysisStatus || 'PROCESSING'
            };
            row.resumeStatus = 'SKIPPED_EXISTING_RESUME';
        } else if (!forceResumeUpload && resumeMatches) {
            // Recover after a crash that uploaded to Cloudinary and saved the
            // manifest but did not finish writing resume metadata to MongoDB.
            resumeMeta = {
                originalFileName: studentSpec.filename, storedFileName: seedResume.publicId,
                fileUrl: `/api/students/${user._id}/resume`, publicId: seedResume.publicId,
                resourceType: seedResume.resourceType, secureUrl: seedResume.secureUrl,
                contentType: 'application/pdf', analysisStatus: 'PROCESSING', uploadedAt: new Date()
            };
            row.resumeStatus = 'RECOVERED_UPLOAD';
        } else {
            uploadedAsset = await cloudinaryService.uploadBuffer(buffer, {
                folder: 'campuslink/resumes', resourceType: 'raw', originalFilename: studentSpec.filename
            });
            if (!forceResumeUpload) {
                stateRecord.resume = {
                    filename: studentSpec.filename, sha256: checksum, publicId: uploadedAsset.publicId,
                    resourceType: uploadedAsset.resourceType, secureUrl: uploadedAsset.secureUrl
                };
                await saveState(state);
                assetRecorded = true;
            }
            resumeMeta = {
                originalFileName: studentSpec.filename, storedFileName: uploadedAsset.publicId,
                fileUrl: `/api/students/${user._id}/resume`, publicId: uploadedAsset.publicId,
                resourceType: uploadedAsset.resourceType, secureUrl: uploadedAsset.secureUrl,
                contentType: 'application/pdf', analysisStatus: 'PROCESSING', uploadedAt: new Date()
            };
            row.resumeStatus = 'UPLOADED';
        }

        const previousAsset = profile.resume?.publicId && profile.resume.publicId !== resumeMeta.publicId
            ? { publicId: profile.resume.publicId, resourceType: profile.resume.resourceType }
            : null;
        if (!['SKIPPED_ALREADY_ATTACHED', 'SKIPPED_EXISTING_RESUME'].includes(row.resumeStatus)) {
            profile.resume = resumeMeta;
            await profile.save();
            resumePersisted = true;
        }
        if (!forceResumeUpload && ['SKIPPED_ALREADY_ATTACHED', 'SKIPPED_EXISTING_RESUME'].includes(row.resumeStatus)) {
            buffer = await readAttachedResume(profile, studentSpec.filename, checksum);
        }
        if (forceResumeUpload && resumePersisted) {
            // Persist the new ownership record only after MongoDB references it.
            stateRecord.resume = {
                filename: studentSpec.filename, sha256: checksum, publicId: uploadedAsset.publicId,
                resourceType: uploadedAsset.resourceType, secureUrl: uploadedAsset.secureUrl
            };
            await saveState(state);
            assetRecorded = true;
            // The new upload and profile reference are now confirmed; old asset
            // deletion is safe and best-effort. Failed deletion leaves no data loss.
            if (previousAsset) await cloudinaryService.deleteAsset(previousAsset.publicId, previousAsset.resourceType).catch(() => {});
        }

        if (skipAI) {
            row.analysisStatus = profile.resume?.analysisStatus === 'COMPLETED' ? 'SKIPPED_ALREADY_ANALYZED' : 'SKIPPED_BY_FLAG';
            return row;
        }
        const analysis = await analyzeResume(user._id, buffer, resumeMeta, { bulkResume: true });
        row.analysisStatus = analysis.success ? 'SUCCESS' : `FAILED: ${analysis.error?.code || 'ANALYSIS_ERROR'}`;
        row.profileStatus = analysis.success ? 'UPDATED' : 'UNCHANGED';
        row.readinessStatus = analysis.success ? 'UPDATED' : 'UNCHANGED';
        if (analysis.success) row.profile = analysis.profile;
        if (analysis.success) row.resumeStatus = row.resumeStatus === 'UPLOADED' ? 'UPLOADED' : 'SKIPPED_ALREADY_ATTACHED';
        return row;
    } catch (error) {
        const failure = error.code || error.message;
        if (row.resumeStatus === 'FAILED') row.resumeStatus = `FAILED: ${failure}`;
        if (row.analysisStatus === 'NOT_RUN') row.analysisStatus = `FAILED: ${failure}`;
        if (uploadedAsset?.publicId && !assetRecorded && !resumePersisted) await cloudinaryService.deleteAsset(uploadedAsset.publicId, uploadedAsset.resourceType).catch(() => {});
        return row;
    }
}

async function actualSeed(zipPath, skipAI, forceResumeUpload = false, reanalyze = false) {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
    const { zipPath: resolvedZip, students } = await listZipPdfs(zipPath);
    const issues = integrationProblems({ includeAI: !skipAI });
    if (issues.length) throw new Error(issues.join(' '));
    if (!cloudinaryService.configured()) throw new Error('Cloudinary is not configured; no database or Cloudinary changes were made.');

    const analyzeResume = skipAI ? null : getResumeAnalyzer();
    await connectDB();
    try {
        const state = await readState();
        // Reanalysis deliberately leaves the excluded student's account,
        // profile, resume metadata, and readiness entirely untouched.
        const reanalysisBatch = reanalyze ? prepareReanalysisBatch(students) : { students, excluded: [] };
        const studentsToProcess = reanalysisBatch.students;
        await validateNoUntrackedConflicts(studentsToProcess, state);
        if (forceResumeUpload || reanalyze) {
            const missing = [];
            for (const expected of studentsToProcess) {
                const record = state.students[expected.email];
                const user = await User.findOne({ email: expected.email });
                if (!user || !isTrackedDemoUser(user, record, expected)) {
                    missing.push(`${expected.filename}: expected existing seeded account ${expected.email}`);
                    continue;
                }
                const profile = await Student.findOne({ userId: user._id }).select('_id name email resume.originalFileName resume.storedFileName');
                if (!profile || String(profile._id) !== String(record?.studentId) || profile.name !== user.name || profile.email !== user.email) {
                    missing.push(`${expected.filename}: expected existing tracked Student profile for ${expected.email}`);
                } else if (reanalyze && (!profile.resume?.storedFileName || profile.resume.originalFileName !== expected.filename)) {
                    missing.push(`${expected.filename}: expected the matching resume to already be attached to ${expected.email}`);
                }
            }
            if (missing.length) throw new Error(`This mode requires all ${studentsToProcess.length} tracked accounts, profiles${reanalyze ? ', and matching attached resumes' : ''}; no work was started. ${missing.join('; ')}`);
        }
        if (reanalyze) {
            for (const excluded of reanalysisBatch.excluded) {
                console.log(`Excluded: ${excluded.name} (${excluded.email})`);
            }
        }
        const rows = [];
        for (const student of studentsToProcess) {
            const row = await seedOne(student, resolvedZip, state, { skipAI, forceResumeUpload, reanalyze, analyzeResume });
            rows.push(row);
            console.log(`[${String(student.number).padStart(2, '0')}/${EXPECTED_COUNT}] ${student.name} (${student.email})`);
            console.log(`  Resume: ${['UPLOADED', 'RECOVERED_UPLOAD', 'SKIPPED_ALREADY_ATTACHED', 'SKIPPED_EXISTING_RESUME'].includes(row.resumeStatus) ? 'attached' : row.resumeStatus}`);
            console.log(`  AI/NLP: ${row.analysisStatus}`);
            if (row.analysisStatus === 'SUCCESS') console.log('  Profile fields: UPDATED\n  Readiness: UPDATED');
            else if (row.analysisStatus.startsWith('FAILED') || row.resumeStatus.startsWith('FAILED')) console.log(`  Reason: ${row.analysisStatus.startsWith('FAILED') ? row.analysisStatus.slice('FAILED: '.length) : row.resumeStatus.slice('FAILED: '.length)}`);
            await saveState(state);
        }
        const credentialRows = rows.filter((row) => row.userId && row.password);
        if (!forceResumeUpload && !reanalyze && credentialRows.length === EXPECTED_COUNT) {
            const temporaryCsv = `${CSV_FILE}.tmp`;
            await fs.writeFile(temporaryCsv, credentialsCsv(credentialRows), { encoding: 'utf8', mode: 0o600 });
            await fs.rename(temporaryCsv, CSV_FILE);
        } else if (!forceResumeUpload && !reanalyze) {
            console.error(`Credential CSV was not written: ${credentialRows.length}/${EXPECTED_COUNT} seeded accounts have confirmed credentials.`);
            process.exitCode = 1;
        }
        const failedRows = rows.filter((row) => row.analysisStatus.startsWith('FAILED') || row.resumeStatus.startsWith('FAILED'));
        const summary = {
            studentsProcessed: rows.length,
            successfulAccounts: rows.filter((row) => row.userId && row.studentId).length,
            resumeUploads: rows.filter((row) => row.resumeStatus === 'UPLOADED').length,
            resumeAlreadyAttached: rows.filter((row) => row.resumeStatus === 'SKIPPED_ALREADY_ATTACHED').length,
            aiAnalysesSuccessful: rows.filter((row) => row.analysisStatus === 'SUCCESS').length,
            aiAnalysesFailed: rows.filter((row) => row.analysisStatus.startsWith('FAILED')).length,
            failed: failedRows.length,
            profileUpdates: rows.filter((row) => row.profileStatus === 'UPDATED').length,
            readinessUpdates: rows.filter((row) => row.readinessStatus === 'UPDATED').length,
            skipped: rows.filter((row) => row.analysisStatus.startsWith('SKIPPED')).length,
            failedStudents: failedRows.map((row) => ({ name: row.name, email: row.email, reason: row.analysisStatus.startsWith('FAILED') ? row.analysisStatus : row.resumeStatus })),
            credentialsCsv: !forceResumeUpload && !reanalyze && credentialRows.length === EXPECTED_COUNT ? CSV_FILE : null,
            aiSkipped: skipAI,
            forceResumeUpload,
            reanalyze
        };
        console.log(JSON.stringify(summary, null, 2));
        if (reanalyze) {
            console.log(`Processed: ${rows.length}`);
            console.log(`Successful: ${summary.aiAnalysesSuccessful}`);
            console.log(`Failed: ${failedRows.length}`);
        }
        if (summary.failed) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

function cliOptions(args) {
    const options = { dryRun: false, skipAI: false, forceResumeUpload: false, reanalyze: false, zipPath: DEFAULT_ZIP };
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--dry-run') options.dryRun = true;
        else if (args[index] === '--skip-ai') options.skipAI = true;
        else if (args[index] === '--force-resume-upload') options.forceResumeUpload = true;
        else if (args[index] === '--reanalyze') options.reanalyze = true;
        else if (args[index] === '--resume-zip') {
            if (!args[index + 1]) throw new Error('--resume-zip requires a ZIP path.');
            options.zipPath = args[++index];
        } else throw new Error(`Unknown argument: ${args[index]}`);
    }
    return options;
}

async function main() {
    const options = cliOptions(process.argv.slice(2));
    if (options.forceResumeUpload && options.reanalyze) throw new Error('--force-resume-upload and --reanalyze cannot be used together.');
    if (options.reanalyze && options.skipAI) throw new Error('--reanalyze requires AI analysis; do not combine it with --skip-ai.');
    if (options.dryRun) await dryRun(options.zipPath, options.skipAI, options.forceResumeUpload, options.reanalyze);
    else await actualSeed(options.zipPath, options.skipAI, options.forceResumeUpload, options.reanalyze);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[50-student seed] ${error.message}`);
        process.exitCode = 1;
    }).finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    });
}

module.exports = { parseFilename, prepareReanalysisBatch, REANALYZE_EXCLUSIONS };
