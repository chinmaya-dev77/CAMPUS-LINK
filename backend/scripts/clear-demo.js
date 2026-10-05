'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('node:fs/promises');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Recruiter = require('../src/models/Recruiter');
const Student = require('../src/models/Student');
const Job = require('../src/models/Job');
const Drive = require('../src/models/Drive');
const Application = require('../src/models/Application');
const Offer = require('../src/models/Offer');
const { DEMO_PREFIX, STATE_FILE, PROFILE_FIELDS, readState } = require('./demo-seed-common');

const demoFilter = { demoKey: { $regex: '^campuslink-cs-demo-v1:' } };
const same = (left, right) => String(left ?? '') === String(right ?? '');

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured in backend/.env.');
    await mongoose.connect(process.env.MONGODB_URI);
    const state = await readState();
    const [demoJobs, demoDrives] = await Promise.all([
        Job.find(demoFilter).select('_id recruiterId +demoKey'),
        Drive.find(demoFilter).select('_id recruiterId jobId addedCandidates shortlistedCandidates selectedCandidates +demoKey')
    ]);
    if (!state) {
        if (demoJobs.length || demoDrives.length) throw new Error('Demo seed state is missing; refusing to clear so recruiter profiles cannot be lost.');
        console.log('No CampusLink CS demo records to clear.');
        return;
    }
    if (state.version !== 1 || !state.profiles) throw new Error('Demo seed state is invalid; no data was changed.');

    const jobIds = demoJobs.map((job) => job._id);
    const [applicationCount, offerCount] = jobIds.length ? await Promise.all([
        Application.countDocuments({ jobId: { $in: jobIds } }),
        Offer.countDocuments({ jobId: { $in: jobIds } })
    ]) : [0, 0];
    if (applicationCount || offerCount || demoDrives.some((drive) => drive.addedCandidates?.length || drive.shortlistedCandidates?.length || drive.selectedCandidates?.length)) {
        throw new Error('Demo jobs/drives have candidate workflow data. Nothing was deleted; remove or resolve those references first.');
    }

    const recruiterIds = Object.keys(state.profiles);
    const [users, studentsBefore, applicationsBefore, offersBefore, nonDemoJobsBefore, nonDemoDrivesBefore] = await Promise.all([
        User.find({ _id: { $in: recruiterIds }, role: 'recruiter' }).select('_id'),
        Student.countDocuments({}), Application.countDocuments({}), Offer.countDocuments({}),
        Job.countDocuments({ demoKey: { $not: /^campuslink-cs-demo-v1:/ } }),
        Drive.countDocuments({ demoKey: { $not: /^campuslink-cs-demo-v1:/ } })
    ]);
    const existingUsers = new Set(users.map((user) => String(user._id)));
    const skippedProfiles = [];
    let profilesRestored = 0;
    let profilesRemoved = 0;

    for (const userId of recruiterIds) {
        const snapshot = state.profiles[userId];
        if (!existingUsers.has(userId)) { skippedProfiles.push(userId); continue; }
        if (!snapshot?.seeded) continue; // No completed profile write was recorded for this account.
        const profile = await Recruiter.findOne({ userId });
        if (!profile) continue;
        const stillSeeded = PROFILE_FIELDS.every((field) => same(profile[field], snapshot.seeded[field]));
        if (!stillSeeded) { skippedProfiles.push(userId); continue; }

        if (snapshot.created || snapshot.before === null) {
            const [otherJobs, otherDrives] = await Promise.all([
                Job.countDocuments({ recruiterId: userId, demoKey: { $not: /^campuslink-cs-demo-v1:/ } }),
                Drive.countDocuments({ recruiterId: userId, demoKey: { $not: /^campuslink-cs-demo-v1:/ } })
            ]);
            if (otherJobs || otherDrives) { skippedProfiles.push(userId); continue; }
            await Recruiter.deleteOne({ _id: profile._id, userId });
            profilesRemoved++;
        } else {
            for (const field of PROFILE_FIELDS) profile[field] = snapshot.before[field] == null ? undefined : snapshot.before[field];
            await profile.save();
            profilesRestored++;
        }
    }

    const removedDrives = await Drive.deleteMany(demoFilter);
    const removedJobs = await Job.deleteMany(demoFilter);
    const [studentsAfter, applicationsAfter, offersAfter, nonDemoJobsAfter, nonDemoDrivesAfter, remainingDemoJobs, remainingDemoDrives] = await Promise.all([
        Student.countDocuments({}), Application.countDocuments({}), Offer.countDocuments({}),
        Job.countDocuments({ demoKey: { $not: /^campuslink-cs-demo-v1:/ } }),
        Drive.countDocuments({ demoKey: { $not: /^campuslink-cs-demo-v1:/ } }),
        Job.countDocuments(demoFilter), Drive.countDocuments(demoFilter)
    ]);
    if (studentsAfter !== studentsBefore || applicationsAfter !== applicationsBefore || offersAfter !== offersBefore
        || nonDemoJobsAfter !== nonDemoJobsBefore || nonDemoDrivesAfter !== nonDemoDrivesBefore
        || remainingDemoJobs || remainingDemoDrives) {
        throw new Error('Clear validation failed; inspect the database before retrying.');
    }
    await fs.unlink(STATE_FILE).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    console.log(JSON.stringify({
        demoJobsRemoved: removedJobs.deletedCount,
        demoDrivesRemoved: removedDrives.deletedCount,
        recruiterProfilesRestored: profilesRestored,
        recruiterProfilesRemoved: profilesRemoved,
        recruiterProfilesPreservedAfterChanges: skippedProfiles.length,
        studentsApplicationsOffersChanged: false,
        nonDemoJobsAndDrivesChanged: false,
        recruiterAccountsDeleted: false
    }, null, 2));
}

main().catch((error) => { console.error(`[Demo clear] ${error.message}`); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect().catch(() => {}); });
