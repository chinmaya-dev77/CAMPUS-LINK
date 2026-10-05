const express = require('express');
const { listPlacementRecruiters, getProfile, updateProfile, createProfile } = require('../controllers/recruiter.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.get('/', authorize('placement'), listPlacementRecruiters);

router.route('/')
    .post(createProfile);

router.route('/:id')
    .get(getProfile)
    .patch(updateProfile);

module.exports = router;
