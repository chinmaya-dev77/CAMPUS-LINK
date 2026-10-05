const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    required: { type: Boolean, default: true },
    // Upload lifecycle only. Verification decisions live in verificationStatus.
    status: { type: String, enum: ['Pending', 'Submitted', 'Verified', 'Rejected'], default: 'Pending' },
    verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'NEEDS_REVIEW', 'REJECTED'] },
    verificationMethod: { type: String, enum: ['AI', 'MANUAL'] },
    hasFile: { type: Boolean, default: false },
    storedFileName: { type: String, select: false },
    publicId: { type: String, select: false },
    resourceType: { type: String, select: false },
    secureUrl: { type: String, select: false },
    verification: {
        confidence: { type: Number, min: 0, max: 100 },
        checks: [{ key: String, label: String, passed: Boolean, reason: String }],
        extracted: { type: mongoose.Schema.Types.Mixed },
        reason: { type: String, maxlength: 500 },
        verifiedAt: Date
    },
    originalFileName: { type: String },
    contentType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
    rejectionReason: { type: String, maxlength: 500 },
    submittedAt: Date,
    verifiedAt: Date
});

const offerSchema = new mongoose.Schema({
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    driveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drive' },
    companyName: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    ctc: { type: Number, required: true, min: 0 },
    offerStatus: {
        type: String,
        enum: ['Selected', 'Offer Generated', 'Offer Sent', 'Pending', 'Accepted', 'Declined', 'Documentation Pending', 'Documents Verified', 'Joining Confirmed'],
        default: 'Selected',
        required: true
    },
    documentStatus: { type: String, enum: ['Pending', 'Submitted', 'Verified', 'Rejected'], default: 'Pending' },
    documents: { type: [documentSchema], default: [] },
    joiningDate: { type: Date },
    documentDeadline: { type: Date },
    statusHistory: [{ status: { type: String, required: true }, changedAt: { type: Date, default: Date.now } }
    ]
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Offer', offerSchema);
