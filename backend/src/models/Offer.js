const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Pending', 'Submitted', 'Verified', 'Rejected'], default: 'Pending' }
}, { _id: false });

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
    statusHistory: [{ status: { type: String, required: true }, changedAt: { type: Date, default: Date.now } }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);
