'use strict';
const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const controller = require('../controllers/analytics.controller');
const router = express.Router();
router.use(protect);
router.get('/placement', controller.placement);
router.get('/risk', controller.risk);
module.exports = router;
