const express = require('express');
const { createDrive, checkDriveDraft, getDrives, getDriveById, addCandidates, deleteDrive, shortlistCandidates, removeCandidate, checkConflicts } = require('../controllers/drive.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getDrives)
    .post(createDrive);

router.post('/preflight', checkDriveDraft);

router.route('/:id')
    .get(getDriveById)
    .delete(deleteDrive);

router.post('/:id/candidates', addCandidates);
router.post('/:id/shortlist', shortlistCandidates);
router.delete('/:id/candidates/:studentId', removeCandidate);
router.post('/:id/check-conflicts', checkConflicts);

module.exports = router;
