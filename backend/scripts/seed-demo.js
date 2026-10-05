'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Recruiter = require('../src/models/Recruiter');
const Student = require('../src/models/Student');
const Job = require('../src/models/Job');
const Drive = require('../src/models/Drive');
const Application = require('../src/models/Application');
const Offer = require('../src/models/Offer');
const driveService = require('../src/services/drive.service');
const schedule = require('../src/services/scheduling/scheduling.engine');
const { DEMO_PREFIX, COMPANIES, JOBS, DRIVE_DATES, snapshotProfile, profileSeed, saveState, readState } = require('./demo-seed-common');

function describeJob(job, company) {
    return `${job.title} — Campus Placement Role\n\nJoin ${company.name} as an early-career ${job.title}. You will collaborate with engineers and product partners to design, build, and improve software used in real business workflows.\n\nResponsibilities include implementing and reviewing maintainable code, debugging issues, documenting technical decisions, and contributing to team delivery. Candidates should be pursuing or have completed a B.Tech in Computer Science or a closely related CS program, with a foundation in the listed required skills.\n\nPreferred skills are useful but not mandatory. The role is intended for campus placements and welcomes candidates who can demonstrate strong fundamentals through coursework and projects.`;
}

function jobRequirements(spec) {
    return {
        role: spec.title,
        requiredSkills: spec.skills,
        preferredSkills: spec.preferred,
        minimumCGPA: spec.minCgpa,
        eligibleBranches: ['CSE'],
        maximumBacklogs: 0,
        mandatoryRequirements: ['B.Tech student or recent graduate in Computer Science', 'Available for the scheduled placement drive'],
        experience: 'Fresher / campus placement',
        education: 'B.Tech in Computer Science',
        certifications: [],
        responsibilities: ['Build and maintain production-quality software', 'Collaborate on code reviews and technical planning', 'Test, document, and improve delivered features']
    };
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured in backend/.env.');
    await mongoose.connect(process.env.MONGODB_URI);

    const users = await User.find({ role: 'recruiter', email: /^rc/i }).select('_id name email role isActive').sort({ createdAt: 1, _id: 1 }).lean();
    if (!users.length) throw new Error('No existing recruiter account has a login email beginning with "rc". No data was changed.');
    const userIds = users.map((user) => user._id);
    const existingProfiles = await Recruiter.find({ userId: { $in: userIds } });
    const profileByUserId = new Map(existingProfiles.map((profile) => [String(profile.userId), profile]));
    let state = await readState();
    if (state && state.version !== 1) throw new Error('Unsupported demo seed state version; no data was changed.');
    if (!state) state = { version: 1, profiles: {} };

    // Persist a rollback snapshot before changing any recruiter profile.
    for (const user of users) {
        const key = String(user._id);
        if (!state.profiles[key]) {
            const profile = profileByUserId.get(key);
            state.profiles[key] = { before: snapshotProfile(profile), seeded: null, created: !profile };
        }
    }
    await saveState(state);

    const before = {
        users: users.length,
        students: await Student.countDocuments({}),
        applications: await Application.countDocuments({}),
        offers: await Offer.countDocuments({})
    };
    const companyByUserId = new Map();
    for (let index = 0; index < users.length; index++) {
        const user = users[index];
        const company = COMPANIES[index % COMPANIES.length];
        const profileValues = profileSeed(user, company);
        let profile = profileByUserId.get(String(user._id));
        if (!profile) profile = new Recruiter({ userId: user._id });
        Object.assign(profile, profileValues);
        await profile.save();
        companyByUserId.set(String(user._id), company);
        state.profiles[String(user._id)].seeded = profileValues;
        state.profiles[String(user._id)].created = state.profiles[String(user._id)].before === null;
        await saveState(state);
    }

    const generatedJobs = [];
    for (let recruiterIndex = 0; recruiterIndex < users.length; recruiterIndex++) {
        const user = users[recruiterIndex];
        const company = companyByUserId.get(String(user._id));
        for (let slot = 0; slot < 3; slot++) {
            const spec = JOBS[(recruiterIndex * 3 + slot) % JOBS.length];
            const demoKey = `${DEMO_PREFIX}${user._id}:job:${slot + 1}`;
            let job = await Job.findOne({ demoKey }).select('+demoKey');
            if (!job) job = new Job({ demoKey });
            job.recruiterId = user._id;
            job.title = spec.title;
            job.description = describeJob(spec, company);
            job.source = 'manual';
            job.requirements = jobRequirements(spec);
            job.status = 'active';
            await job.save();
            generatedJobs.push({ user, company, job, spec, slot });
        }
    }

    const driveAssignments = [];
    users.forEach((user, recruiterIndex) => driveAssignments.push({ user, recruiterIndex, slot: 0 }));
    for (let recruiterIndex = 0; driveAssignments.length < DRIVE_DATES.length; recruiterIndex++) {
        driveAssignments.push({ user: users[recruiterIndex % users.length], recruiterIndex: recruiterIndex % users.length, slot: 1 });
    }

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const driveResults = [];
    for (let index = 0; index < DRIVE_DATES.length; index++) {
        const assignment = driveAssignments[index];
        const entry = generatedJobs.find((item) => String(item.user._id) === String(assignment.user._id) && item.slot === assignment.slot);
        if (!entry) throw new Error(`No demo job was prepared for drive ${index + 1}.`);
        const date = new Date(`${DRIVE_DATES[index]}T00:00:00.000Z`);
        if (date < new Date('2026-10-10T00:00:00.000Z') || date < today) throw new Error(`Configured demo drive date ${DRIVE_DATES[index]} is not a valid future date.`);
        const demoKey = `${DEMO_PREFIX}${assignment.user._id}:drive:${assignment.slot + 1}`;
        const driveData = {
            jobId: entry.job._id,
            date,
            startTime: index % 2 ? '10:00' : '09:00',
            endTime: index % 2 ? '12:00' : '11:00',
            mode: 'online',
            venue: 'Online — joining details shared with shortlisted candidates'
        };
        schedule.validateDriveSchedule(driveData);
        let drive = await Drive.findOne({ demoKey }).select('+demoKey');
        // Draft checks allocate a fresh drive ID, so an idempotent rerun would
        // treat this same seeded drive as a conflicting schedule. Validate
        // conflicts only when creating a new drive; existing tagged drives
        // already passed the conflict check when first created.
        if (!drive) {
            const conflicts = await driveService.checkDriveDraft(assignment.user._id, driveData);
            if (conflicts.length) throw new Error(`Drive ${DRIVE_DATES[index]} conflicts with existing schedules: ${JSON.stringify(conflicts)}`);
        }
        if (!drive) drive = new Drive({ demoKey });
        drive.jobId = entry.job._id;
        drive.recruiterId = assignment.user._id;
        drive.companyName = entry.company.name;
        drive.role = entry.spec.title;
        drive.date = date;
        drive.startTime = driveData.startTime;
        drive.endTime = driveData.endTime;
        drive.venue = driveData.venue;
        drive.mode = driveData.mode;
        drive.status = 'Scheduled';
        drive.interviewStages = [{ name: 'Technical assessment', order: 1 }, { name: 'Technical interview', order: 2 }];
        await drive.save();
        driveResults.push({ date: DRIVE_DATES[index], recruiterId: String(assignment.user._id), jobId: String(entry.job._id), driveId: String(drive._id) });
    }

    const demoFilter = { demoKey: { $regex: '^campuslink-cs-demo-v1:' } };
    const [demoJobsAll, demoDrives, afterUsers, afterCounts] = await Promise.all([
        Job.find(demoFilter).select('+demoKey'),
        Drive.find(demoFilter).select('+demoKey').populate('jobId', 'recruiterId'),
        User.find({ _id: { $in: userIds } }).select('_id email role isActive').lean(),
        Promise.all([User.countDocuments({ role: 'recruiter', email: /^rc/i }), Student.countDocuments({}), Application.countDocuments({}), Offer.countDocuments({})])
    ]);
    const demoJobs = demoJobsAll.filter((job) => /:job:\d+$/.test(job.demoKey || ''));
    const expectedAccountMap = new Map(users.map((user) => [String(user._id), `${user.email}|${user.role}|${user.isActive}`]));
    for (const user of afterUsers) if (expectedAccountMap.get(String(user._id)) !== `${user.email}|${user.role}|${user.isActive}`) throw new Error('A recruiter login identity changed during seeding.');
    if (afterUsers.length !== users.length || afterCounts[0] !== before.users || afterCounts[1] !== before.students || afterCounts[2] !== before.applications || afterCounts[3] !== before.offers) throw new Error('A protected account or non-demo record count changed during seeding.');
    if (demoJobs.length !== users.length * 3 || demoDrives.length !== DRIVE_DATES.length) throw new Error('Demo job/drive totals failed validation.');
    const recruiterIdSet = new Set(userIds.map(String));
    if (demoJobs.some((job) => !recruiterIdSet.has(String(job.recruiterId)))) throw new Error('A generated job references an unknown recruiter.');
    if (demoJobs.some((job) => JSON.stringify(job.requirements?.eligibleBranches || []) !== JSON.stringify(['CSE']))) throw new Error('A generated job is not restricted to the CSE department.');
    if (demoDrives.some((drive) => !recruiterIdSet.has(String(drive.recruiterId)) || String(drive.jobId?.recruiterId) !== String(drive.recruiterId) || new Date(drive.date) < new Date('2026-10-10T00:00:00.000Z'))) throw new Error('A generated drive has an invalid relationship or date.');
    if (new Set(demoJobs.map((job) => job.demoKey)).size !== demoJobs.length || new Set(demoDrives.map((drive) => drive.demoKey)).size !== demoDrives.length) throw new Error('Duplicate demo job or drive keys were found.');

    console.log(JSON.stringify({
        recruitersFound: users.length,
        recruiterProfilesUpdated: users.length,
        jobsCreatedOrUpdated: demoJobs.length,
        drivesCreatedOrUpdated: demoDrives.length,
        driveDates: [...new Set(demoDrives.map((drive) => new Date(drive.date).toISOString().slice(0, 10)))].sort(),
        csDepartmentOnly: true,
        jobDriveReferencesValid: true,
        duplicateDemoKeys: false,
        loginIdentitiesUnchanged: true,
        studentsApplicationsOffersUnchanged: true,
        skippedRecruiters: []
    }, null, 2));
}

main().catch((error) => { console.error(`[Demo seed] ${error.message}`); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect().catch(() => {}); });
