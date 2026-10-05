const mongoose = require('mongoose');

const driveSchema = new mongoose.Schema({
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    recruiterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    companyName: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    venue: {
        type: String
    },
    mode: {
        type: String,
        enum: ['online', 'offline'],
        required: true
    },
    interviewStages: [{
        name: String,
        order: Number
    }],
    eligibleCandidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    addedCandidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    shortlistedCandidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    selectedCandidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        enum: ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'],
        default: 'Scheduled'
    },
    conflicts: [{
        type: { type: String }, // 'type' is a reserved keyword in Mongoose, wrap it like this
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        relatedDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drive' },
        description: String
    }],
    demoKey: { type: String, select: false }
}, {
    timestamps: true
});

driveSchema.index({ demoKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Drive', driveSchema);
