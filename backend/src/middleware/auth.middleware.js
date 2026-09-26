const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware to verify JWT token and attach user to req.user
 */
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Not authorized to access this route'
            }
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user by ID but exclude passwordHash
        const user = await User.findById(decoded.id).select('-passwordHash');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'User no longer exists'
                }
            });
        }
        
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'ACCOUNT_DISABLED',
                    message: 'Account is disabled'
                }
            });
        }

        // Attach safe user object to request
        req.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        };
        
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Token is invalid or expired'
            }
        });
    }
};

/**
 * Middleware to restrict access based on user role
 * @param  {...string} roles - allowed roles (e.g., 'student', 'recruiter')
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `User role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route`
                }
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
