const express = require('express');
const { getProfile, updateProfile, uploadResume, getResume, uploadProfilePicture, getProfilePicture, deleteProfilePicture } = require('../controllers/student.controller');
const { protect } = require('../middleware/auth.middleware');
const { upload, pictureUpload } = require('../middleware/upload.middleware');

const router = express.Router();

// Both endpoints are protected
router.use(protect);

router.route('/:id')
    .get(getProfile)
    .patch(updateProfile);

// Resume upload — multipart/form-data; field name: "resume"
router.post('/:id/resume', upload.single('resume'), uploadResume);
router.get('/:id/resume', getResume);
router.post('/:id/profile-picture', pictureUpload.single('picture'), uploadProfilePicture);
router.get('/:id/profile-picture', getProfilePicture);
router.delete('/:id/profile-picture', deleteProfilePicture);

const { analyzeReadiness, getReadiness, getSkillGaps } = require('../controllers/readiness.controller');

// Readiness endpoints (Phase 4)
router.post('/:id/readiness/analyze', analyzeReadiness);
router.get('/:id/readiness', getReadiness);
router.get('/:id/skill-gaps', getSkillGaps);
const { getStudentApplications } = require('../controllers/application.controller');
router.get('/:id/applications', getStudentApplications);
const offerController = require('../controllers/offer.controller');
router.get('/:id/offers', offerController.getStudent);

module.exports = router;
