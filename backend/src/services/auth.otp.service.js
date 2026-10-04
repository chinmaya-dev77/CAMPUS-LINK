const crypto = require('crypto');
const User = require('../models/User');
const AuthOtpChallenge = require('../models/AuthOtpChallenge');
const authService = require('./auth.service');
const emailService = require('./email.service');

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_AUTH_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const requestBuckets = new Map();

function fail(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    throw error;
}

function normalizeEmail(email) {
    if (typeof email !== 'string') fail('Enter a valid email address.', 400, 'VALIDATION_ERROR');
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) fail('Enter a valid email address.', 400, 'VALIDATION_ERROR');
    return value;
}

function rateLimit(ip, email, purpose, action, limit) {
    const now = Date.now();
    for (const [key, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(key);
    for (const key of [`${action}:ip:${ip || 'unknown'}`, `${action}:email:${purpose}:${email}`]) {
        const bucket = requestBuckets.get(key);
        if (bucket && bucket.count >= limit) fail('Too many requests. Please wait a while and try again.', 429, 'RATE_LIMITED');
    }
    for (const key of [`${action}:ip:${ip || 'unknown'}`, `${action}:email:${purpose}:${email}`]) {
        const bucket = requestBuckets.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
        bucket.count += 1;
        requestBuckets.set(key, bucket);
    }
}

function hashOtp(otp) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'change_this_to_a_strong_random_secret') fail('Email verification is not configured. Please try again later.', 503, 'OTP_NOT_CONFIGURED');
    return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

function createOtp() { return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0'); }
function secureMatch(left, right) {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function newChallenge(email, purpose, otp, details = {}) {
    const now = Date.now();
    return {
        email,
        purpose,
        otpHash: hashOtp(otp),
        otpExpiresAt: new Date(now + OTP_TTL_MS),
        expiresAt: new Date(now + 20 * 60 * 1000),
        attempts: 0,
        lastOtpSentAt: new Date(now),
        verifiedAt: null,
        name: details.name,
        role: details.role,
        passwordHash: details.passwordHash
    };
}

async function sendChallenge(challenge) {
    const otp = createOtp();
    const document = newChallenge(challenge.email, challenge.purpose, otp, challenge);
    await AuthOtpChallenge.findOneAndUpdate(
        { email: challenge.email, purpose: challenge.purpose },
        { $set: document },
        { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );
    try {
        await emailService.sendOtpEmail(challenge.email, otp, challenge.purpose);
    } catch (error) {
        await AuthOtpChallenge.deleteOne({ email: challenge.email, purpose: challenge.purpose });
        throw error;
    }
    return { email: challenge.email, purpose: challenge.purpose, expiresInSeconds: 300, resendAfterSeconds: 60 };
}

async function enforceSendCooldown(email, purpose) {
    const current = await AuthOtpChallenge.findOne({ email, purpose });
    if (!current || current.verifiedAt || !current.lastOtpSentAt) return;
    const waitMs = current.lastOtpSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) fail(`Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`, 429, 'OTP_COOLDOWN');
}

async function startRegistration(input, ip) {
    const email = normalizeEmail(input.email);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const { password, role } = input;
    if (!name || name.length > 120 || typeof password !== 'string' || password.length < 8 || !['student', 'recruiter'].includes(role)) {
        fail('Provide your name, a password of at least 8 characters, and choose Student or Recruiter.', 400, 'VALIDATION_ERROR');
    }
    rateLimit(ip, email, 'registration', 'send', 8);
    if (await User.exists({ email })) fail('An account with this email already exists. Please log in.', 409, 'USER_EXISTS');
    await enforceSendCooldown(email, 'registration');
    const passwordHash = await authService.hashPassword(password);
    return sendChallenge({ email, purpose: 'registration', name, role, passwordHash });
}

async function startPasswordReset(input, ip) {
    const email = normalizeEmail(input.email);
    rateLimit(ip, email, 'password_reset', 'send', 8);
    if (!await User.exists({ email })) fail('Account not found. No CampusLink account is registered with this email.', 404, 'ACCOUNT_NOT_FOUND');
    await enforceSendCooldown(email, 'password_reset');
    return sendChallenge({ email, purpose: 'password_reset' });
}

async function resendOtp(input, ip) {
    const email = normalizeEmail(input.email);
    const purpose = input.purpose;
    if (!['registration', 'password_reset'].includes(purpose)) fail('Choose a valid verification flow.', 400, 'VALIDATION_ERROR');
    rateLimit(ip, email, purpose, 'resend', 8);
    const challenge = await AuthOtpChallenge.findOne({ email, purpose }).select('+passwordHash +otpHash');
    if (!challenge || challenge.verifiedAt) fail('This verification request has expired. Start again to get a new code.', 400, 'OTP_EXPIRED');
    const waitMs = challenge.lastOtpSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) fail(`Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`, 429, 'OTP_COOLDOWN');
    return sendChallenge({ email, purpose, name: challenge.name, role: challenge.role, passwordHash: challenge.passwordHash });
}

async function verifyOtp(input, ip) {
    const email = normalizeEmail(input.email);
    const otp = String(input.otp || '');
    const purpose = input.purpose;
    if (!['registration', 'password_reset'].includes(purpose) || !/^\d{6}$/.test(otp)) fail('Enter the 6-digit verification code.', 400, 'VALIDATION_ERROR');
    rateLimit(ip, email, purpose, 'verify', 30);
    const challenge = await AuthOtpChallenge.findOne({ email, purpose }).select('+otpHash +passwordHash');
    if (!challenge || challenge.verifiedAt || challenge.otpExpiresAt <= new Date() || challenge.expiresAt <= new Date()) {
        fail('This code has expired. Request a new code to continue.', 400, 'OTP_EXPIRED');
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
        await AuthOtpChallenge.deleteOne({ _id: challenge._id });
        fail('Too many incorrect attempts. Request a new code to continue.', 429, 'OTP_ATTEMPTS_EXCEEDED');
    }
    if (!secureMatch(challenge.otpHash, hashOtp(otp))) {
        challenge.attempts += 1;
        if (challenge.attempts >= MAX_ATTEMPTS) {
            await AuthOtpChallenge.deleteOne({ _id: challenge._id });
            fail('Too many incorrect attempts. Request a new code to continue.', 429, 'OTP_ATTEMPTS_EXCEEDED');
        }
        await challenge.save();
        fail('That code is not correct. Check the email and try again.', 400, 'OTP_INVALID');
    }

    if (purpose === 'registration') {
        if (!challenge.name || !challenge.role || !challenge.passwordHash) fail('Registration expired. Please start again.', 400, 'OTP_EXPIRED');
        try {
            const user = await User.create({ name: challenge.name, email, role: challenge.role, passwordHash: challenge.passwordHash });
            await AuthOtpChallenge.deleteOne({ _id: challenge._id });
            return { purpose, user: { id: user._id, name: user.name, email: user.email, role: user.role } };
        } catch (error) {
            if (error.code === 11000) fail('An account with this email already exists. Please log in.', 409, 'USER_EXISTS');
            throw error;
        }
    }

    const verifiedAt = new Date();
    const update = await AuthOtpChallenge.updateOne(
        { _id: challenge._id, otpHash: challenge.otpHash, verifiedAt: null },
        { $unset: { otpHash: 1 }, $set: { verifiedAt, expiresAt: new Date(Date.now() + RESET_AUTH_TTL_MS) } }
    );
    if (!update.modifiedCount) fail('This code was already used. Request a new code to continue.', 400, 'OTP_EXPIRED');
    return { purpose };
}

async function finishPasswordReset(input) {
    const email = normalizeEmail(input.email);
    const password = input.password;
    if (typeof password !== 'string' || password.length < 8) fail('Password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
    const challenge = await AuthOtpChallenge.findOne({ email, purpose: 'password_reset', verifiedAt: { $ne: null }, expiresAt: { $gt: new Date() } });
    if (!challenge) fail('Verify your email code before changing the password.', 400, 'OTP_VERIFICATION_REQUIRED');
    const passwordHash = await authService.hashPassword(password);
    const result = await User.updateOne({ email }, { $set: { passwordHash } });
    if (!result.matchedCount) fail('Account not found. No CampusLink account is registered with this email.', 404, 'ACCOUNT_NOT_FOUND');
    await AuthOtpChallenge.deleteOne({ _id: challenge._id });
}

module.exports = { startRegistration, startPasswordReset, resendOtp, verifyOtp, finishPasswordReset };
