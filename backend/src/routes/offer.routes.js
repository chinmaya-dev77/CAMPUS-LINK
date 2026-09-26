const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const controller = require('../controllers/offer.controller');

const router = express.Router();
router.use(protect);
router.route('/').get(controller.list).post(controller.create);
router.get('/:id', controller.get);
router.patch('/:id/joining-date', controller.updateJoiningDate);
router.patch('/:id/status', controller.updateStatus);
router.patch('/:id/documents', controller.updateDocuments);
module.exports = router;
