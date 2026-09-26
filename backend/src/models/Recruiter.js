const mongoose = require('mongoose');

const recruiterSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    companyName: {
        type: String,
        trim: true
    },
    recruiterName: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },
    industry: {
        type: String,
        trim: true
    },
    companyDescription: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Recruiter', recruiterSchema);
