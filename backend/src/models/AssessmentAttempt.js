const mongoose = require('mongoose');

const assessmentAttemptSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessmentId: { type: String, required: true, default: 'placement-readiness-v1' },
    assessmentVersion: { type: String, required: true, default: 'campuslink-basics-v1' },
    questionIds: { type: [String], required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    durationSeconds: { type: Number, required: true, default: 900 },
    status: { type: String, enum: ['in_progress', 'completed', 'expired'], default: 'in_progress', index: true },
    answers: [{ questionId: String, selectedIndex: Number, correct: Boolean }],
    technicalScore: { type: Number, min: 0, max: 100 },
    aptitudeScore: { type: Number, min: 0, max: 100 },
    overallScore: { type: Number, min: 0, max: 100 },
    strengths: [String],
    improvementAreas: [String],
    completedAt: Date,
    durationTakenSeconds: Number
}, { timestamps: true });

assessmentAttemptSchema.index({ studentId: 1, completedAt: -1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
