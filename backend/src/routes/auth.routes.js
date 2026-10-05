const express = require('express');
const {
    login,
    getMe,
    startRegistration,
    verifyOtp,
    resendOtp,
    startPasswordReset,
    finishPasswordReset
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Registration starts with email verification; public registration never creates an account directly.
router.post('/register', startRegistration);
router.post('/register/send-otp', startRegistration);
router.post('/register/verify-otp', verifyOtp);
router.post('/otp/verify', verifyOtp);
router.post('/otp/resend', resendOtp);
router.post('/password/forgot', startPasswordReset);
router.post('/password/reset', finishPasswordReset);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
