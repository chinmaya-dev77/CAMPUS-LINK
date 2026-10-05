const Notification = require('../models/Notification');

async function notify(userId, message, type, relatedEntity, eventKey) {
    if (!userId || !message) return null;
    try {
        return await Notification.create({ userId, message, type, relatedEntity, ...(eventKey ? { eventKey } : {}) });
    } catch (error) {
        if (eventKey && error.code === 11000) return Notification.findOne({ eventKey }).select('+eventKey');
        console.error('[NOTIFICATION] Could not persist event:', error.message);
        return null;
    }
}

module.exports = { notify };
