const Recruiter = require('../models/Recruiter');
const User = require('../models/User');

const getProfileByUserId = async (userId) => {
    return await Recruiter.findOne({ userId });
};

const updateProfileByUserId = async (userId, updateData) => {
    const user = await User.findById(userId);
    if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    const dataToSave = { ...updateData, email: user.email };

    if (!dataToSave.recruiterName) {
        dataToSave.recruiterName = user.name;
    }

    const updatedProfile = await Recruiter.findOneAndUpdate(
        { userId },
        { $set: dataToSave },
        { new: true, upsert: true, runValidators: true }
    );

    return updatedProfile;
};

module.exports = {
    getProfileByUserId,
    updateProfileByUserId
};
