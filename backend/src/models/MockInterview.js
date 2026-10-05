const mongoose = require('mongoose');

const mockInterviewSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetRole: { type: String, required: true, trim: true, maxlength: 120 },
    questions: [{ id: String, category: String, prompt: String }],
    answers: [{ questionId: String, answer: { type: String, maxlength: 2000 } }],
    status: { type: String, enum: ['in_progress', 'evaluating', 'evaluation_failed', 'completed'], default: 'in_progress', index: true },
    technicalScore: { type: Number, min: 0, max: 100 },
    communicationScore: { type: Number, min: 0, max: 100 },
    behavioralScore: { type: Number, min: 0, max: 100 },
    overallScore: { type: Number, min: 0, max: 100 },
    strengths: [String],
    improvementAreas: [String],
    feedback: { type: String, maxlength: 1200 },
    completedAt: Date,
    durationTakenSeconds: Number
}, { timestamps: true });

mockInterviewSchema.index({ studentId: 1, completedAt: -1 });

module.exports = mongoose.model('MockInterview', mockInterviewSchema);
