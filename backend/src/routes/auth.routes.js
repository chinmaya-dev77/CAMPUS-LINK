const express = require('express');
const { register, login, getMe, startPasswordReset } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

const { authorize } = require('../middleware/auth.middleware');

router.post('/register', register);
router.post('/password/forgot', startPasswordReset);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
