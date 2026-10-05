const driveService = require('../services/drive.service');

const addCandidates = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can add candidates to drives' } });
        if (!Array.isArray(req.body?.studentIds)) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'studentIds must be an array' } });
        const result = await driveService.addCandidates(req.params.id, req.body.studentIds, req.user);
        res.status(200).json({ success: true, data: { drive: result.drive, addedCount: result.addedCount, addedStudentIds: result.addedStudentIds } });
    } catch (err) { next(err); }
};

const deleteDrive = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can delete drives' } });
        const result = await driveService.deleteDrive(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const createDrive = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can create drives' } });
        }

        const drive = await driveService.createDrive(req.user.id, req.body);
        res.status(201).json({ success: true, data: drive });
    } catch (err) {
        next(err);
    }
};

const checkDriveDraft = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can preflight their drives' } });
        const conflicts = await driveService.checkDriveDraft(req.user.id, req.body);
        res.status(200).json({ success: true, data: { conflicts, conflictCount: conflicts.length } });
    } catch (err) { next(err); }
};

const getDrives = async (req, res, next) => {
    try {
        const filters = {};
        // If recruiter, only see their drives
        if (req.user.role === 'recruiter') {
            filters.recruiterId = req.user.id;
        } else if (req.user.role !== 'placement') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view placement drives' } });
        }
        // Students could see upcoming drives if needed, though usually they see it via applications/jobs.
        
        const drives = await driveService.getDrives(filters);
        res.status(200).json({ success: true, data: drives });
    } catch (err) {
        next(err);
    }
};

const getDriveById = async (req, res, next) => {
    try {
        if (!['recruiter', 'placement'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view drive details' } });
        }
        const drive = await driveService.getDriveById(req.params.id);
        if (!drive) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Drive not found' }});
        }
        if (req.user.role === 'recruiter' && drive.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view this drive' } });
        }
        res.status(200).json({ success: true, data: drive });
    } catch (err) {
        next(err);
    }
};

const shortlistCandidates = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can manage drive candidates' } });
        }

        const { studentIds } = req.body;
        if (!Array.isArray(studentIds)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'studentIds must be an array' } });
        }

        const result = await driveService.shortlistCandidates(req.params.id, studentIds, req.user);
        res.status(200).json({ success: true, data: { ...result.drive.toObject(), conflicts: result.conflicts } });
    } catch (err) {
        next(err);
    }
};

const removeCandidate = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can manage drive candidates' } });
        const drive = await driveService.removeCandidate(req.params.id, req.params.studentId, req.user);
        res.status(200).json({ success: true, data: drive });
    } catch (err) { next(err); }
};

const checkConflicts = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter' && req.user.role !== 'placement') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
        }
        const studentIds = req.body?.studentIds || [];
        if (!Array.isArray(studentIds)) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'studentIds must be an array' } });
        const result = await driveService.checkConflicts(req.params.id, studentIds);
        if (req.user.role === 'recruiter' && result.drive.recruiterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to inspect this drive' } });
        }
        res.status(200).json({ success: true, data: { driveId: result.drive._id, conflicts: result.conflicts, conflictCount: result.conflicts.length } });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createDrive,
    checkDriveDraft,
    getDrives,
    getDriveById,
    addCandidates,
    deleteDrive,
    shortlistCandidates,
    removeCandidate,
    checkConflicts
};
