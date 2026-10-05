const recruiterService = require('../services/recruiter.service');
const Recruiter = require('../models/Recruiter');
const User = require('../models/User');
const Job = require('../models/Job');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Offer = require('../models/Offer');

const listPlacementRecruiters = async (req, res, next) => {
    try {
        const users = await User.find({ role: 'recruiter', isActive: true }).select('_id name email').lean();
        const ids = users.map((user) => user._id);
        const [profiles, jobRows, driveRows, applicationRows, offerRows] = await Promise.all([
            Recruiter.find({ userId: { $in: ids } }).select('userId companyName recruiterName industry companyDescription website').lean(),
            Job.aggregate([{ $match: { recruiterId: { $in: ids } } }, { $group: { _id: '$recruiterId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } }]),
            Drive.aggregate([{ $match: { recruiterId: { $in: ids } } }, { $group: { _id: '$recruiterId', count: { $sum: 1 } } }]),
            Application.aggregate([{ $match: { recruiterId: { $in: ids } } }, { $group: { _id: '$recruiterId', count: { $sum: 1 } } }]),
            Offer.aggregate([{ $match: { recruiterId: { $in: ids } } }, { $group: { _id: '$recruiterId', count: { $sum: 1 } } }])
        ]);
        const userById = new Map(users.map((user) => [String(user._id), user]));
        const mapById = (rows) => new Map(rows.map((row) => [String(row._id), row]));
        const jobsById = mapById(jobRows), drivesById = mapById(driveRows);
        const applicationsById = mapById(applicationRows), offersById = mapById(offerRows);
        // Only recruiters with a persisted Recruiter document belong in this directory.
        const data = profiles.filter((profile) => userById.has(String(profile.userId))).map((profile) => {
            const id = String(profile.userId), user = userById.get(id), jobs = jobsById.get(id);
            return {
                userId: user._id,
                companyName: profile.companyName || 'Company profile incomplete',
                recruiterName: profile.recruiterName || user.name,
                email: user.email,
                industry: profile.industry || null,
                companyDescription: profile.companyDescription || null,
                website: profile.website || null,
                activeJobs: jobs?.active || 0,
                jobCount: jobs?.total || 0,
                driveCount: drivesById.get(id)?.count || 0,
                applicationCount: applicationsById.get(id)?.count || 0,
                offerCount: offersById.get(id)?.count || 0
            };
        });
        res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
};

const getProfile = async (req, res, next) => {
    try {
        const targetUserId = req.params.id;

        // Authorization Rule: Only the recruiter themselves can view their profile for editing
        // Wait, students might need to see recruiter profiles? The rules say "Recruiters can manage only their own jobs."
        // We'll let recruiters view their own profile.
        if (req.user.role === 'recruiter' && req.user.id.toString() !== targetUserId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You are not authorized to view this profile' }
            });
        }

        let profile = await recruiterService.getProfileByUserId(targetUserId);

        if (!profile) {
            if (req.user.id.toString() === targetUserId) {
                profile = {
                    userId: req.user.id,
                    recruiterName: req.user.name,
                    email: req.user.email,
                    companyName: '',
                    industry: '',
                    phone: '',
                    companyDescription: '',
                    website: ''
                };
            } else {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Recruiter profile not found' }
                });
            }
        }

        res.status(200).json({
            success: true,
            data: profile
        });
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const targetUserId = req.params.id;

        if (req.user.role !== 'recruiter') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only recruiters can update recruiter profiles' }
            });
        }

        if (req.user.id.toString() !== targetUserId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You are not authorized to update this profile' }
            });
        }

        const allowedUpdates = [
            'companyName', 'recruiterName', 'phone', 'industry', 'companyDescription', 'website'
        ];
        
        const updateData = {};
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = req.body[key];
            }
        });

        const updatedProfile = await recruiterService.updateProfileByUserId(targetUserId, updateData);

        res.status(200).json({
            success: true,
            data: updatedProfile
        });
    } catch (err) {
        next(err);
    }
};

const createProfile = async (req, res, next) => {
    // Treat POST /api/recruiters as updating the current user's profile
    req.params.id = req.user.id.toString();
    return updateProfile(req, res, next);
};

module.exports = {
    listPlacementRecruiters,
    getProfile,
    updateProfile,
    createProfile
};
