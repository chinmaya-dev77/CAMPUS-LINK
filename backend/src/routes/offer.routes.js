const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const controller = require('../controllers/offer.controller');
const { documentUpload } = require('../middleware/upload.middleware');

const router = express.Router();
router.use(protect);
router.route('/').get(controller.list).post(controller.create);
router.get('/:id', controller.get);
router.post('/:id/documents/:index/upload', documentUpload.single('document'), controller.submitDocument);
router.get('/:id/documents/:index/file', controller.getDocumentFile);
router.patch('/:id/documents/:index/status', controller.reviewDocument);
router.delete('/:id/documents/:index', controller.deleteDocument);
router.patch('/:id/joining-date', controller.updateJoiningDate);
router.patch('/:id/ctc', controller.updateCtc);
router.patch('/:id/status', controller.updateStatus);
router.patch('/:id/documents', controller.updateDocuments);
module.exports = router;
