'use strict';

const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const controller = require('../controllers/careerPractice.controller');

const router = express.Router({ mergeParams: true });
router.use(protect, authorize('student'));
router.get('/latest', controller.getLatest);
router.post('/assessment/start', controller.startAssessment);
router.post('/assessment/:attemptId/submit', controller.submitAssessment);
router.post('/mock-interviews/start', controller.startInterview);
router.post('/mock-interviews/:interviewId/submit', controller.submitInterview);

module.exports = router;
