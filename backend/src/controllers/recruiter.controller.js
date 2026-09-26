const recruiterService = require('../services/recruiter.service');

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
    getProfile,
    updateProfile,
    createProfile
};
