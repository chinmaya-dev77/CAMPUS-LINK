const express = require('express');
const { createDrive, getDrives, getDriveById, shortlistCandidates, checkConflicts } = require('../controllers/drive.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getDrives)
    .post(createDrive);

router.route('/:id')
    .get(getDriveById);

router.post('/:id/shortlist', shortlistCandidates);
router.post('/:id/check-conflicts', checkConflicts);

module.exports = router;
