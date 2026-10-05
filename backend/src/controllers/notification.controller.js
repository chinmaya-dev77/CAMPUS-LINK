const Notification = require('../models/Notification');

const list = async (req, res, next) => {
    try {
        const query = { userId: req.user.id };
        if (req.query.unread === 'true') query.readAt = null;
        const data = await Notification.find(query).sort({ createdAt: -1 }).limit(50).lean();
        res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { $set: { readAt: new Date() } }, { new: true }
        );
        if (!notification) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        res.status(200).json({ success: true, data: notification });
    } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
    try {
        await Notification.updateMany({ userId: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
        res.status(200).json({ success: true, data: { markedRead: true } });
    } catch (err) { next(err); }
};

module.exports = { list, markRead, markAllRead };
