const express = require('express');
const { createJob, getJobs, getJobById, updateJob, deleteJob, analyzeJob } = require('../controllers/job.controller');
const { matchStudentToJob, getCandidatesForJob } = require('../controllers/matching.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getJobs)
    .post(createJob);

router.route('/:id')
    .get(getJobById)
    .patch(updateJob)
    .delete(deleteJob);

router.route('/:id/analyze')
    .post(analyzeJob);

router.route('/:id/match')
    .post(matchStudentToJob);

router.route('/:id/candidates')
    .get(getCandidatesForJob);
const { getJobApplications } = require('../controllers/application.controller');
router.get('/:id/applications', getJobApplications);

module.exports = router;
