const { Resend } = require('resend');

function createError(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function sanitizeProviderText(value, recipient) {
    let text = String(value || 'Unknown provider error');
    if (recipient) text = text.replace(new RegExp(recipient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[recipient]');
    return text
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/re_[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]')
        .replace(/\b\d{6}\b/g, '[REDACTED_OTP]')
        .slice(0, 500);
}

function logResendFailure(error, recipient) {
    const detail = error?.message || error?.error?.message || error?.response?.data?.message;
    const status = error?.statusCode ?? error?.status ?? error?.response?.status ?? error?.error?.statusCode ?? null;
    const numericStatus = status === null || status === '' ? null : Number(status);
    console.error('[RESEND OTP DIAGNOSTIC]', JSON.stringify({
        provider: 'Resend',
        providerErrorType: sanitizeProviderText(error?.name || error?.type || error?.error?.name || 'ProviderError', recipient),
        providerMessage: sanitizeProviderText(detail, recipient),
        httpStatus: Number.isFinite(numericStatus) ? numericStatus : null
    }));
}

async function sendOtpEmail(email, otp, purpose) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
        console.error('[RESEND OTP DIAGNOSTIC]', JSON.stringify({
            provider: 'Resend',
            apiKeyConfigured: Boolean(apiKey),
            mailFromConfigured: Boolean(from),
            sdkInitialized: false,
            likelyCause: 'Backend process did not load one or more Resend environment variables.'
        }));
        throw createError('Email delivery is not configured. Please try again later.', 503, 'EMAIL_NOT_CONFIGURED');
    }

    let resend;
    try {
        resend = new Resend(apiKey);
    } catch (error) {
        logResendFailure(error, email);
        throw createError('Email delivery could not be initialized. Check the Resend API key configuration.', 503, 'RESEND_INITIALIZATION_FAILED');
    }
    console.info('[RESEND OTP DIAGNOSTIC]', JSON.stringify({
        provider: 'Resend',
        apiKeyConfigured: true,
        mailFromConfigured: true,
        sdkInitialized: true
    }));
    const reset = purpose === 'password_reset';
    const heading = reset ? 'Reset your CampusLink password' : 'Verify your CampusLink email';
    const action = reset ? 'use this code to reset your password' : 'use this code to verify your email address';
    const safeEmail = escapeHtml(email);
    const html = `<!doctype html><html><body style="margin:0;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#202538"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e3e6ef;border-radius:16px"><p style="margin:0 0 24px;color:#694bd1;font-weight:700;letter-spacing:.04em">CampusLink</p><h1 style="margin:0 0 12px;font-size:22px">${heading}</h1><p style="color:#697187;line-height:1.6">Hi ${safeEmail}, ${action}. This code expires in 5 minutes.</p><div style="margin:24px 0;padding:18px;text-align:center;border-radius:12px;background:#f1edfb;color:#49329c;font-size:32px;font-weight:700;letter-spacing:10px">${otp}</div><p style="color:#697187;line-height:1.6">Do not share this code with anyone. If you did not request it, you can safely ignore this email.</p></div></body></html>`;

    let result;
    try {
        result = await resend.emails.send({
            from,
            to: [email],
            subject: reset ? 'CampusLink — Reset Your Password' : 'CampusLink — Verify Your Email',
            html
        });
    } catch (error) {
        logResendFailure(error, email);
        throw createError('We could not send the email. Check the Resend sender and recipient configuration, then try again.', 502, 'EMAIL_DELIVERY_FAILED');
    }

    if (result?.error) {
        logResendFailure(result.error, email);
        throw createError('We could not send the email. Check the Resend sender and recipient configuration, then try again.', 502, 'EMAIL_DELIVERY_FAILED');
    }

    console.info('[RESEND OTP DIAGNOSTIC]', JSON.stringify({
        provider: 'Resend',
        accepted: true,
        messageId: sanitizeProviderText(result?.data?.id || 'not returned', email)
    }));
}

module.exports = { sendOtpEmail };
