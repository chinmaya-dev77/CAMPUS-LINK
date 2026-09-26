const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
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
    driveId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Drive'
    },
    status: {
        type: String,
        enum: ['Applied', 'Eligible', 'Ineligible', 'Shortlisted', 'Rejected', 'Interview', 'Selected', 'Offer', 'Withdrawn'],
        default: 'Applied'
    },
    eligibility: {
        isEligible: { type: Boolean, default: true },
        reasons: [String]
    },
    matching: {
        finalScore: Number,
        skillMatch: Number,
        semanticMatch: Number,
        projectRelevance: Number,
        academicFit: Number,
        assessmentEvidence: Number,
        rank: Number,
        strengths: [String],
        skillGaps: [String]
    },
    appliedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// A student may submit at most one application for a given job. The service
// checks this for a friendly error; the unique index also closes concurrent
// request races.
applicationSchema.index({ studentId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
