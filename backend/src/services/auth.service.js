const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Register a new user
 */
const registerUser = async (userData) => {
    const { name, email, password, role } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        const err = new Error('User with this email already exists');
        err.status = 409;
        err.code = 'USER_EXISTS';
        throw err;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
        name,
        email,
        passwordHash,
        role
    });

    return {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
    };
};

/**
 * Login user and generate JWT
 */
const loginUser = async (credentials) => {
    const { email, password } = credentials;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
        const err = new Error('Invalid email or password');
        err.status = 401;
        err.code = 'INVALID_CREDENTIALS';
        throw err;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        const err = new Error('Invalid email or password');
        err.status = 401;
        err.code = 'INVALID_CREDENTIALS';
        throw err;
    }

    if (!user.isActive) {
        const err = new Error('Account is disabled');
        err.status = 403;
        err.code = 'ACCOUNT_DISABLED';
        throw err;
    }

    // Generate token
    const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return {
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
};

module.exports = {
    registerUser,
    loginUser
};
