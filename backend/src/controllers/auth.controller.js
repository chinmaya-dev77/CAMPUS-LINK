const authService = require('../services/auth.service');

const register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Basic validation
        if (!name || !email || !password || !role) {
            const err = new Error('Please provide name, email, password and role');
            err.status = 400;
            err.code = 'VALIDATION_ERROR';
            return next(err);
        }
        if (typeof name !== 'string' || !name.trim()
            || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())
            || typeof password !== 'string' || password.length < 8
            || !['student', 'recruiter', 'placement'].includes(role)) {
            const err = new Error('Provide a name, valid email, password of at least 8 characters, and a supported role');
            err.status = 400;
            err.code = 'VALIDATION_ERROR';
            return next(err);
        }

        const user = await authService.registerUser({ name, email, password, role });
        
        res.status(201).json({
            success: true,
            data: { user },
            message: 'Registration successful'
        });
    } catch (err) {
        next(err);
    }
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
    register,
    login,
    getMe
};
