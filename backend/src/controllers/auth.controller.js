const authService = require('../services/auth.service');
const otpService = require('../services/auth.otp.service');

const startRegistration = async (req, res, next) => {
    try {
        const result = await otpService.startRegistration(req.body, req.ip);
        res.status(200).json({ success: true, data: result, message: 'Verification code sent.' });
    } catch (error) { next(error); }
};

const verifyOtp = async (req, res, next) => {
    try {
        const result = await otpService.verifyOtp(req.body, req.ip);
        res.status(200).json({ success: true, data: result, message: result.purpose === 'registration' ? 'Email verified and account created.' : 'Email verified.' });
    } catch (error) { next(error); }
};

const resendOtp = async (req, res, next) => {
    try {
        const result = await otpService.resendOtp(req.body, req.ip);
        res.status(200).json({ success: true, data: result, message: 'A new verification code has been sent.' });
    } catch (error) { next(error); }
};

const startPasswordReset = async (req, res, next) => {
    try {
        const result = await otpService.startPasswordReset(req.body, req.ip);
        res.status(200).json({ success: true, data: result, message: 'Verification code sent.' });
    } catch (error) { next(error); }
};

const finishPasswordReset = async (req, res, next) => {
    try {
        await otpService.finishPasswordReset(req.body);
        res.status(200).json({ success: true, message: 'Password updated.' });
    } catch (error) { next(error); }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        // Basic validation
        if (!email || !password) {
            const err = new Error('Please provide email and password');
            err.status = 400;
            err.code = 'VALIDATION_ERROR';
            return next(err);
        }

        const data = await authService.loginUser({ email, password });
        
        res.status(200).json({
            success: true,
            data
        });
    } catch (err) {
        next(err);
    }
};

const getMe = async (req, res, next) => {
    try {
        // req.user is populated by the auth middleware
        res.status(200).json({
            success: true,
            data: req.user
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    startRegistration,
    verifyOtp,
    resendOtp,
    startPasswordReset,
    finishPasswordReset,
    login,
    getMe
};
