'use strict';
const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { ask } = require('../controllers/assistant.controller');
const router = express.Router();
router.use(protect);
router.post('/', ask);
module.exports = router;
