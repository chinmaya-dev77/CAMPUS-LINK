const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const controller = require('../controllers/notification.controller');

const router = express.Router();
router.use(protect);
router.get('/', controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);
module.exports = router;
