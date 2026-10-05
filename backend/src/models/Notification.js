const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, required: true, enum: ['application', 'interview', 'drive', 'offer', 'document', 'joining'] },
    relatedEntity: { type: { type: String, enum: ['application', 'drive', 'offer'] }, id: mongoose.Schema.Types.ObjectId },
    eventKey: { type: String, maxlength: 200, select: false },
    readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ eventKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Notification', notificationSchema);
