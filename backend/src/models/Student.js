const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String
    },
    registrationNumber: { type: String, trim: true },
    branch: {
        type: String
    },
    graduationYear: {
        type: Number
    },
    cgpa: {
        type: Number,
        min: 0,
        max: 10
    },
    backlogs: {
        type: Number,
        default: 0,
        min: 0
    },
    resume: {
        originalFileName: String,   // sanitized original client filename (display only)
        storedFileName: String,     // Cloudinary public_id (legacy disk filenames remain readable)
        fileUrl: String,            // protected backend retrieval route
        publicId: String,
        resourceType: String,
        secureUrl: { type: String, select: false },
        contentType: String,
        analysisStatus: { type: String, enum: ['PROCESSING', 'COMPLETED', 'FAILED'] },
        analysisError: { type: String, maxlength: 500 },
        uploadedAt: Date
    },
    profilePicture: {
        fileName: String,
        fileUrl: String,
        publicId: { type: String, select: false },
        resourceType: { type: String, select: false },
        secureUrl: { type: String, select: false },
        contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] },
        updatedAt: Date
    },
    skills: [{
        name: String,
        level: String
    }],
    projects: [{
        title: String,
        description: String,
        technologies: [String],
        role: String,
        githubUrl: String,
        demoUrl: String,
        source: { type: String, enum: ['resume', 'manual'], default: 'manual' }
    }],
    certifications: [{
        name: String,
        issuer: String,
        issueDate: Date
    }],
    experience: [{
        company: String,
        role: String,
        description: String,
        startDate: Date,
        endDate: Date
    }],
    education: [{
        institution: String,
        degree: String,
        field: String,
        startYear: Number,
        endYear: Number
    }],
    readiness: {
        score: Number,
        category: String,
        technicalSkillsScore: Number,
        projectsScore: Number,
        academicScore: Number,
        assessmentScore: Number,
        interviewScore: Number,
        improvementAreas: [String],
        calculatedAt: Date,
        sourceHash: { type: String, select: false }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Student', studentSchema);
