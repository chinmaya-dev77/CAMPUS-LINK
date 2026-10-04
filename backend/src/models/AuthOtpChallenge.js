const mongoose = require('mongoose');

const authOtpChallengeSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ['registration', 'password_reset'] },
    otpHash: { type: String, required: true, select: false },
    otpExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastOtpSentAt: { type: Date, required: true },
    verifiedAt: { type: Date },
    name: { type: String, trim: true },
    role: { type: String, enum: ['student', 'recruiter'] },
    passwordHash: { type: String, select: false }
}, { timestamps: true });

authOtpChallengeSchema.index({ email: 1, purpose: 1 }, { unique: true });
authOtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthOtpChallenge', authOtpChallengeSchema);
