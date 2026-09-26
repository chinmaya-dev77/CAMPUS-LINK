const express = require('express');
const { createApplication, getApplicationById, getStudentApplications, getJobApplications, updateApplicationStatus } = require('../controllers/application.controller');
const { protect } = require('../middleware/auth.middleware');
const offerController = require('../controllers/offer.controller');

const router = express.Router();

router.use(protect);

router.post('/', createApplication);
router.get('/', (req, res) => res.status(200).json({ success: true, data: [] })); // Root get if needed, typically placement cell only
router.get('/:id/offer', offerController.getApplication);
router.get('/:id', getApplicationById);
router.patch('/:id/status', updateApplicationStatus);

module.exports = router;
