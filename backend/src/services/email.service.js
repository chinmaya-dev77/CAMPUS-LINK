const nodemailer = require('nodemailer');

function createError(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function getSmtpConfig() {
    const host = process.env.SMTP_HOST?.trim();
    const portText = process.env.SMTP_PORT?.trim();
    const secureText = process.env.SMTP_SECURE?.trim().toLowerCase();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM?.trim();
    const port = Number(portText);
    const secure = secureText === 'true';

    const missing = !host || !portText || !Number.isInteger(port) || port < 1 || port > 65535
        || !['true', 'false'].includes(secureText) || !user || !password || !from;

    if (missing) {
        console.error('[SMTP OTP DIAGNOSTIC]', JSON.stringify({
            provider: 'Gmail SMTP',
            host: host || null,
            port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
            secureConfigured: ['true', 'false'].includes(secureText),
            credentialsConfigured: Boolean(user && password),
            mailFromConfigured: Boolean(from),
            configurationValid: false
        }));
        throw createError('Email delivery is not configured. Please check the local SMTP settings.', 503, 'EMAIL_NOT_CONFIGURED');
    }

    if (port === 587 && secure) {
        console.error('[SMTP OTP DIAGNOSTIC]', JSON.stringify({
            provider: 'Gmail SMTP', host, port, secure, configurationValid: false,
            likelyCause: 'Port 587 requires STARTTLS with SMTP_SECURE=false.'
        }));
        throw createError('Email delivery is not configured. Use STARTTLS with SMTP_SECURE=false on port 587.', 503, 'SMTP_CONFIGURATION_INVALID');
    }

    return { host, port, secure, user, password, from };
}

function createTransport(config) {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.port === 587 ? { requireTLS: true } : {}),
        auth: { user: config.user, pass: config.password }
    });
}

function sanitizeDiagnosticMessage(message, config, recipient, otp) {
    let safe = String(message || 'SMTP operation failed');
    for (const secret of [config?.password, config?.user, config?.from, recipient, otp]) {
        if (secret) safe = safe.split(String(secret)).join('[REDACTED]');
    }
    return safe
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/\b\d{6}\b/g, '[REDACTED_OTP]')
        .slice(0, 400);
}

function logSmtpFailure(error, config, recipient, otp) {
    console.error('[SMTP OTP DIAGNOSTIC]', JSON.stringify({
        provider: 'Gmail SMTP',
        host: config?.host || process.env.SMTP_HOST?.trim() || null,
        port: config?.port || Number(process.env.SMTP_PORT) || null,
        secure: typeof config?.secure === 'boolean' ? config.secure : null,
        credentialsConfigured: Boolean(config?.user && config?.password),
        errorType: String(error?.name || 'SMTPError').slice(0, 80),
        errorCode: String(error?.code || '').slice(0, 80) || null,
        responseCode: Number.isInteger(error?.responseCode) ? error.responseCode : null,
        message: sanitizeDiagnosticMessage(error?.message, config, recipient, otp)
    }));
}

async function verifySmtpTransport() {
    const config = getSmtpConfig();
    const transporter = createTransport(config);
    try {
        await transporter.verify();
        console.info('[SMTP OTP DIAGNOSTIC]', JSON.stringify({
            provider: 'Gmail SMTP', host: config.host, port: config.port,
            secure: config.secure, credentialsConfigured: true, verified: true
        }));
        return true;
    } catch (error) {
        logSmtpFailure(error, config);
        throw createError('Email delivery could not connect to Gmail SMTP. Check the local SMTP settings.', 503, 'SMTP_CONNECTION_FAILED');
    }
}

async function sendOtpEmail(email, otp, purpose) {
    const config = getSmtpConfig();
    const reset = purpose === 'password_reset';
    const heading = reset ? 'Reset your CampusLink password' : 'Verify your CampusLink email';
    const action = reset ? 'use this code to reset your password' : 'use this code to verify your email address';
    const safeEmail = escapeHtml(email);
    const html = `<!doctype html><html><body style="margin:0;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#202538"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e3e6ef;border-radius:16px"><p style="margin:0 0 24px;color:#694bd1;font-weight:700;letter-spacing:.04em">CampusLink</p><h1 style="margin:0 0 12px;font-size:22px">${heading}</h1><p style="color:#697187;line-height:1.6">Hi ${safeEmail}, ${action}. This code expires in 5 minutes.</p><div style="margin:24px 0;padding:18px;text-align:center;border-radius:12px;background:#f1edfb;color:#49329c;font-size:32px;font-weight:700;letter-spacing:10px">${otp}</div><p style="color:#697187;line-height:1.6">Do not share this code with anyone. If you did not request it, you can safely ignore this email.</p></div></body></html>`;

    try {
        const result = await createTransport(config).sendMail({
            from: config.from,
            to: email,
            subject: reset ? 'CampusLink — Reset Your Password' : 'CampusLink — Verify Your Email',
            html
        });
        console.info('[SMTP OTP DIAGNOSTIC]', JSON.stringify({
            provider: 'Gmail SMTP', host: config.host, port: config.port,
            secure: config.secure, accepted: true,
            messageId: String(result?.messageId || 'not returned').slice(0, 200)
        }));
    } catch (error) {
        logSmtpFailure(error, config, email, otp);
        throw createError('We could not send the email. Please check Gmail SMTP configuration and try again.', 502, 'EMAIL_DELIVERY_FAILED');
    }
}

module.exports = { sendOtpEmail, verifySmtpTransport };
