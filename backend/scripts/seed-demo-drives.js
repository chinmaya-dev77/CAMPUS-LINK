'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Recruiter = require('../src/models/Recruiter');
const Student = require('../src/models/Student');
const Job = require('../src/models/Job');
const Drive = require('../src/models/Drive');
const { matchStudentToJob } = require('../src/services/matching/matching.engine');
const driveService = require('../src/services/drive.service');

const demoJobs = [
    {
        key: 'campuslink-demo-full-stack-intern', title: 'Full Stack Developer Intern',
        requiredSkills: ['JavaScript', 'Node.js', 'Express.js', 'MongoDB', 'HTML', 'CSS'],
        preferredSkills: ['React', 'REST APIs', 'Git', 'Docker'], minimumCGPA: 7.0, eligibleBranches: ['CSE', 'IT']
    },
    {
        key: 'campuslink-demo-data-analyst-intern', title: 'Data Analyst Intern',
        requiredSkills: ['Python', 'SQL', 'Excel', 'Statistics', 'Pandas'],
        preferredSkills: ['Power BI', 'Tableau', 'Machine Learning'], minimumCGPA: 7.2, eligibleBranches: ['CSE', 'IT', 'Data Science']
    },
    {
        key: 'campuslink-demo-software-engineer-intern', title: 'Software Engineer Intern',
        requiredSkills: ['Java', 'DSA', 'OOP', 'DBMS', 'SQL'],
        preferredSkills: ['Spring Boot', 'Git', 'System Design'], minimumCGPA: 7.5, eligibleBranches: ['CSE', 'IT']
    }
];

function upcomingDate(offsetDays) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
}

async function run() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured in backend/.env.');
    await mongoose.connect(process.env.MONGODB_URI);
    const recruiter = await Recruiter.findOne().sort({ createdAt: 1 }).select('userId companyName');
    if (!recruiter) throw new Error('No existing recruiter profile is available; no user was created.');
    const recruiterUser = await User.findOne({ _id: recruiter.userId, role: 'recruiter', isActive: true }).select('_id');
    if (!recruiterUser) throw new Error('The existing recruiter profile has no active recruiter account.');
    const students = await Student.find({}).select('userId name skills projects cgpa branch backlogs');
    const results = [];

    for (let index = 0; index < demoJobs.length; index++) {
        const spec = demoJobs[index];
        const requirements = {
            role: spec.title, requiredSkills: spec.requiredSkills, preferredSkills: spec.preferredSkills,
            minimumCGPA: spec.minimumCGPA, eligibleBranches: spec.eligibleBranches
        };
        let job = await Job.findOne({ demoKey: spec.key }).select('+demoKey');
        if (!job) job = new Job({ recruiterId: recruiterUser._id, demoKey: spec.key });
        job.title = spec.title;
        job.description = `${spec.title} placement drive. Candidates will be evaluated on the required skills and eligibility criteria shown in this listing.`;
        job.requirements = requirements;
        job.status = 'active';
        await job.save();

        const eligibleCandidates = students.filter((student) => matchStudentToJob(student, job).eligible).map((student) => student.userId);
        let drive = await Drive.findOne({ demoKey: spec.key }).select('+demoKey');
        if (drive) {
            drive.jobId = job._id;
            drive.recruiterId = recruiterUser._id;
            drive.companyName = recruiter.companyName || 'Campus Recruiting';
            drive.role = spec.title;
            // Eligibility is computed for suggestions/announcements; it is not a
            // candidate association. Recruiters add candidates explicitly.
            drive.eligibleCandidates = [];
            await drive.save();
        } else {
            const driveDraft = {
                jobId: job._id, companyName: recruiter.companyName || 'Campus Recruiting', role: spec.title,
                date: upcomingDate(14 + index * 2), startTime: '09:00', endTime: '11:00', mode: 'online'
            };
            for (let attempt = 0; attempt < 60; attempt++) {
                const conflicts = await driveService.checkDriveDraft(recruiterUser._id, driveDraft);
                if (!conflicts.some((conflict) => conflict.type === 'drive_time_overlap')) break;
                driveDraft.date.setUTCDate(driveDraft.date.getUTCDate() + 1);
            }
            drive = await driveService.createDrive(recruiterUser._id, {
                ...driveDraft,
                interviewStages: [{ name: 'Technical interview', order: 1 }], demoKey: spec.key
            });
        }
        results.push({ id: String(drive._id), title: spec.title, eligible: eligibleCandidates.length });
    }
    console.log(JSON.stringify({ recruiter: recruiter.companyName || 'Existing recruiter', drives: results }, null, 2));
}

run().catch((error) => { console.error(`[Demo drives] ${error.message}`); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect().catch(() => {}); });
