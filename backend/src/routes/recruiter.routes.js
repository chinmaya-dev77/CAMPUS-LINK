const express = require('express');
const { getProfile, updateProfile, createProfile } = require('../controllers/recruiter.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createProfile);

router.route('/:id')
    .get(getProfile)
    .patch(updateProfile);

module.exports = router;
