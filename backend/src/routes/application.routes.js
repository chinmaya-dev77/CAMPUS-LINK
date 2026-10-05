const express = require('express');
const { listPlacementApplications, createApplication, getApplicationById, getStudentApplications, getJobApplications, updateApplicationStatus, scheduleInterview } = require('../controllers/application.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const offerController = require('../controllers/offer.controller');

const router = express.Router();

router.use(protect);
router.get('/', authorize('placement'), listPlacementApplications);

router.post('/', createApplication);
router.get('/:id/offer', offerController.getApplication);
router.patch('/:id/interview-schedule', scheduleInterview);
router.get('/:id', getApplicationById);
router.patch('/:id/status', updateApplicationStatus);

module.exports = router;
