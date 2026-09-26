'use strict';

const Student = require('../../models/Student');
const Recruiter = require('../../models/Recruiter');
const User = require('../../models/User');
const Job = require('../../models/Job');
const Application = require('../../models/Application');
const Drive = require('../../models/Drive');
const Offer = require('../../models/Offer');
const { normalizeSkill } = require('../readiness/skill.domain');
const { normalizeBranch } = require('../branch.domain');
const { checkDriveConflicts } = require('../scheduling/scheduling.service');

const countBy = (items, keyOf) => {
    const counts = new Map();
    items.forEach((item) => { const key = keyOf(item); if (key) counts.set(key, (counts.get(key) || 0) + 1); });
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};
const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

async function getPlacementAnalytics(now = new Date()) {
    const [students, recruiters, activeUsers, jobs, applications, offers, drives] = await Promise.all([
        Student.find().select('userId branch skills readiness').lean(),
        Recruiter.find().select('userId').lean(),
        User.find({ role: 'recruiter', isActive: true }).select('_id').lean(),
        Job.find().select('title status requirements').lean(),
        Application.find().select('studentId status').lean(),
        Offer.find().select('studentId jobId role ctc offerStatus').lean(),
        Drive.find().select('jobId recruiterId companyName role date startTime endTime venue mode status shortlistedCandidates eligibleCandidates selectedCandidates conflicts').lean()
    ]);
    const studentByUserId = new Map(students.map((student) => [String(student.userId), student]));
    const studentRecords = [...studentByUserId.values()];
    const uniqueStudents = new Set(studentByUserId.keys());
    const selectedApps = applications.filter((a) => a.status === 'Selected');
    const shortlistedApps = applications.filter((a) => a.status === 'Shortlisted');
    // Final placement is recorded only once an offer reaches Joining Confirmed; count distinct students.
    const placedStudents = new Set(offers.filter((o) => o.offerStatus === 'Joining Confirmed' && uniqueStudents.has(String(o.studentId))).map((o) => String(o.studentId)));
    const eligibleStudents = studentRecords.filter((s) => Number.isFinite(s.readiness?.score) && s.readiness.score >= 70).length;
    const placementRate = uniqueStudents.size ? (placedStudents.size / uniqueStudents.size) * 100 : 0;
    const recruiterProfileIds = new Set(recruiters.map((r) => String(r.userId)));
    const activeRecruiters = activeUsers.filter((u) => recruiterProfileIds.has(String(u._id))).length;
    const selectionRate = applications.length ? (new Set(selectedApps.map((a) => String(a.studentId))).size / new Set(applications.map((a) => String(a.studentId))).size) * 100 : 0;

    const studentSkillSets = studentRecords.map((student) => new Set((student.skills || []).map((skill) => normalizeSkill(skill.name)).filter(Boolean)));
    const demanded = [];
    jobs.forEach((job) => {
        const jobSkills = new Set((job.requirements?.requiredSkills || []).map(normalizeSkill).filter(Boolean));
        jobSkills.forEach((skill) => demanded.push(skill));
    });
    const demandBySkill = countBy(demanded, (skill) => skill);
    const gaps = [];
    studentRecords.forEach((student, index) => {
        const existing = studentSkillSets[index];
        const readinessGaps = (student.readiness?.improvementAreas || []).map(normalizeSkill).filter(Boolean);
        const derived = demandBySkill.filter((item) => !existing.has(item.name)).map((item) => item.name);
        [...new Set([...readinessGaps, ...derived])].forEach((skill) => gaps.push(skill));
    });
    const branches = countBy(studentRecords, (s) => normalizeBranch(s.branch) || null);
    const branchSkills = new Map();
    studentRecords.forEach((s) => {
        const branch = normalizeBranch(s.branch); if (!branch) return;
        const skills = branchSkills.get(branch) || new Set();
        (s.skills || []).forEach((skill) => { const normalized = normalizeSkill(skill.name); if (normalized) skills.add(normalized); });
        branchSkills.set(branch, skills);
    });
    const validOffers = offers.filter((o) => numeric(o.ctc));
    const ctcValues = validOffers.map((o) => o.ctc).sort((a, b) => a - b);
    const median = ctcValues.length ? (ctcValues.length % 2 ? ctcValues[(ctcValues.length - 1) / 2] : ctcValues[ctcValues.length / 2 - 1] / 2 + ctcValues[ctcValues.length / 2] / 2) : null;
    const roleGroups = new Map();
    validOffers.forEach((offer) => {
        const role = (offer.role || '').trim() || 'Unspecified';
        const values = roleGroups.get(role) || []; values.push(offer.ctc); roleGroups.set(role, values);
    });
    const mean = (values) => values.reduce((average, value, index) => average + (value - average) / (index + 1), 0);
    const roleCtc = [...roleGroups].map(([role, values]) => ({ role, averageCtc: mean(values), offers: values.length })).sort((a, b) => a.role.localeCompare(b.role));

    const utcDay = now.toISOString().slice(0, 10);
    const utcTime = now.toISOString().slice(11, 16);
    const activeDrives = drives.filter((d) => d.status === 'Ongoing' || (d.status === 'Scheduled'
        && new Date(d.date).toISOString().slice(0, 10) === utcDay
        && d.startTime <= utcTime && utcTime < d.endTime)).length;
    const upcomingDrives = drives.filter((d) => d.status === 'Scheduled'
        && new Date(`${new Date(d.date).toISOString().slice(0, 10)}T${d.startTime}:00.000Z`) > now).length;
    const completedDrives = drives.filter((d) => d.status === 'Completed').length;
    const conflictableDrives = drives.filter((d) => d.status !== 'Cancelled' && (d.status === 'Ongoing' || d.status === 'Scheduled'));
    // Let scheduling failures reach the API error handler; an internal error must not look like zero conflicts.
    const conflictSets = await Promise.all(conflictableDrives.map((drive) => checkDriveConflicts(drive)));
    const conflictKeys = new Set();
    conflictSets.flat().forEach((conflict) => {
        const pair = [conflict.currentDrive.id, conflict.conflictingDrive.id].sort().join(':');
        conflictKeys.add(`${conflict.type}:${conflict.studentId || 'venue'}:${pair}`);
    });

    return {
        generatedAt: now.toISOString(),
        placement: { totalStudents: uniqueStudents.size, eligibleStudents, applications: applications.length, shortlisted: shortlistedApps.length, selected: selectedApps.length, placed: placedStudents.size, placementRate, placementRateDenominator: 'total registered students' },
        recruiters: { activeRecruiters, openJobs: jobs.filter((j) => j.status === 'active').length, candidatesShortlisted: new Set(shortlistedApps.map((a) => String(a.studentId))).size, selectionRate, offers: offers.length, selectionRateDefinition: 'distinct students with a Selected application / distinct students with any application' },
        skills: { mostDemanded: demandBySkill.slice(0, 10), gaps: countBy(gaps, (skill) => skill).slice(0, 10), branchDistribution: branches, branchSkills: [...branchSkills].sort(([a], [b]) => a.localeCompare(b)).map(([branch, skills]) => ({ branch, skills: [...skills].sort() })) },
        compensation: { averageCtc: ctcValues.length ? mean(ctcValues) : null, medianCtc: median, highestCtc: ctcValues.length ? ctcValues[ctcValues.length - 1] : null, validOffers: ctcValues.length, roleWise: roleCtc },
        drives: { active: activeDrives, upcoming: upcomingDrives, completed: completedDrives, conflicts: conflictKeys.size }
    };
}

module.exports = { getPlacementAnalytics };
