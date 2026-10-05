const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    recruiterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // The API spec uses recruiterId, usually this maps to the recruiter's User ID
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    source: {
        type: String,
        enum: ['manual', 'pdf'],
        default: 'manual'
    },
    jdFile: {
        fileName: String,
        fileUrl: String
    },
    requirements: {
        role: String,
        requiredSkills: [String],
        preferredSkills: [String],
        minimumCGPA: Number,
        eligibleBranches: [String],
        maximumBacklogs: Number,
        mandatoryRequirements: [String],
        experience: String,
        education: String,
        certifications: [String],
        responsibilities: [String]
    },
    embeddings: {
        jobDescription: [Number],
        requiredSkills: [Number]
    },
    matchingWeights: {
        skillMatch: { type: Number, default: 0.4 },
        semanticMatch: { type: Number, default: 0.2 },
        projectRelevance: { type: Number, default: 0.2 },
        academicFit: { type: Number, default: 0.1 },
        assessmentEvidence: { type: Number, default: 0.1 }
    },
    status: {
        type: String,
        enum: ['draft', 'active', 'closed'],
        default: 'draft'
    },
    demoKey: { type: String, select: false }
}, {
    timestamps: true
});

jobSchema.index({ demoKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Job', jobSchema);
