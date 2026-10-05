'use strict';

const mongoose = require('mongoose');
const Drive = require('../../models/Drive');
const Application = require('../../models/Application');
const Recruiter = require('../../models/Recruiter');
const { getOverlap, validateDriveSchedule, normalizeDate } = require('./scheduling.engine');

const idOf = (value) => String(value && value._id ? value._id : value);

function driveSummary(drive, recruiterById = new Map()) {
    const job = drive.jobId && typeof drive.jobId === 'object' ? drive.jobId : null;
    const company = drive.companyName && drive.companyName !== 'Unknown Company'
        ? drive.companyName
        : recruiterById.get(idOf(drive.recruiterId))?.companyName || 'Unknown Company';
    const role = drive.role && drive.role !== 'Unknown Role'
        ? drive.role
        : job?.requirements?.role || job?.title || 'Unknown Role';
    return {
        id: idOf(drive),
        company,
        role,
        date: new Date(drive.date).toISOString().slice(0, 10),
        startTime: drive.startTime,
        endTime: drive.endTime,
        venue: drive.venue || null,
        mode: drive.mode
    };
}

function studentSummary(user) {
    if (!user) return null;
    return { id: idOf(user), name: user.name || 'Student' };
}

function makeConflict(type, student, current, other, overlap, recruiterById) {
    return {
        type,
        student,
        studentId: student && student.id,
        currentDrive: driveSummary(current, recruiterById),
        conflictingDrive: driveSummary(other, recruiterById),
        overlap
    };
}

function dedupeConflicts(conflicts) {
    const unique = new Map();
    for (const conflict of conflicts) {
        const pair = [conflict.currentDrive.id, conflict.conflictingDrive.id].sort().join(':');
        const participant = conflict.type === 'student_time_overlap' ? conflict.studentId : 'venue';
        const key = `${conflict.type}:${participant}:${pair}`;
        if (!unique.has(key)) unique.set(key, conflict);
    }
    return [...unique.values()];
}

async function checkDriveConflicts(drive) {
    validateDriveSchedule(drive);
    const currentId = idOf(drive);
    const studentIds = [...new Set((drive.shortlistedCandidates || []).map(idOf))];
    const apps = studentIds.length
        ? await Application.find({ studentId: { $in: studentIds }, status: 'Shortlisted', driveId: { $exists: true, $nin: [null, drive._id] } }).select('studentId driveId')
        : [];

    const otherIds = new Set(apps.map((app) => idOf(app.driveId)));
    if (studentIds.length) {
        const legacyDrives = await Drive.find({ _id: { $ne: drive._id }, shortlistedCandidates: { $in: studentIds } }).select('_id');
        legacyDrives.forEach((item) => otherIds.add(idOf(item)));
    }
    if (drive.mode === 'offline' && drive.venue) {
        const sameDateDrives = await Drive.find({ _id: { $ne: drive._id }, date: drive.date, status: { $ne: 'Cancelled' } }).select('_id venue mode');
        sameDateDrives.filter((item) => item.mode === 'offline' && item.venue
            && item.venue.trim().toLocaleLowerCase() === drive.venue.trim().toLocaleLowerCase())
            .forEach((item) => otherIds.add(idOf(item)));
    }
    otherIds.delete(currentId);
    const others = otherIds.size
        ? await Drive.find({ _id: { $in: [...otherIds] }, status: { $ne: 'Cancelled' } }).populate('shortlistedCandidates', 'name').populate('jobId', 'title requirements.role')
        : [];
    const recruiterIds = [...new Set([idOf(drive.recruiterId), ...others.map((item) => idOf(item.recruiterId))])];
    const recruiterProfiles = await Recruiter.find({ userId: { $in: recruiterIds } }).select('userId companyName');
    const recruiterById = new Map(recruiterProfiles.map((profile) => [idOf(profile.userId), profile]));
    const currentStudents = new Map((drive.shortlistedCandidates || []).map((student) => [idOf(student), student]));
    // Load safe names for IDs that were not populated on the input drive.
    if ([...currentStudents.values()].some((student) => typeof student === 'string' || mongoose.isValidObjectId(student))) {
        const User = require('../../models/User');
        const users = await User.find({ _id: { $in: studentIds } }).select('name');
        users.forEach((user) => currentStudents.set(idOf(user), user));
    }

    const conflicts = [];
    for (const other of others) {
        const overlap = getOverlap(drive, other);
        if (!overlap) continue;
        const otherStudents = new Set([
            ...(other.shortlistedCandidates || []).map(idOf),
            ...apps.filter((app) => idOf(app.driveId) === idOf(other)).map((app) => idOf(app.studentId))
        ]);
        for (const studentId of studentIds) {
            if (otherStudents.has(studentId)) {
                conflicts.push(makeConflict('student_time_overlap', studentSummary(currentStudents.get(studentId)), drive, other, overlap, recruiterById));
            }
        }
        if (drive.mode === 'offline' && other.mode === 'offline' && drive.venue && other.venue
            && drive.venue.trim().toLocaleLowerCase() === other.venue.trim().toLocaleLowerCase()) {
            conflicts.push(makeConflict('venue_time_overlap', null, drive, other, overlap, recruiterById));
        }
    }
    return dedupeConflicts(conflicts);
}

async function checkDriveTimeConflicts(drive) {
    validateDriveSchedule(drive);
    const date = normalizeDate(drive.date);
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const query = {
        date: { $gte: dayStart, $lt: dayEnd },
        status: { $in: ['Scheduled', 'Ongoing'] }
    };
    const currentId = drive._id ? idOf(drive) : null;
    if (currentId) query._id = { $ne: drive._id };
    const existing = await Drive.find(query).populate('jobId', 'title requirements.role');
    const requestedDrive = driveSummary(drive);
    return existing.flatMap((other) => {
        const overlap = getOverlap(drive, other);
        if (!overlap) return [];
        return [{
            type: 'drive_time_overlap',
            currentDrive: requestedDrive,
            existingDrive: driveSummary(other),
            requestedDrive,
            conflictingDrive: driveSummary(other),
            overlap
        }];
    });
}

async function getStudentConflictsForDrive(drive, studentIds) {
    const students = [...new Set(studentIds.map(idOf))];
    if (!students.length) return [];
    const User = require('../../models/User');
    const names = await User.find({ _id: { $in: students } }).select('name');
    const userById = new Map(names.map((user) => [idOf(user), user]));
    const apps = await Application.find({ studentId: { $in: students }, status: 'Shortlisted', driveId: { $exists: true, $ne: null } }).select('studentId driveId');
    const previousIds = new Set(apps.map((app) => idOf(app.driveId)).filter((id) => id !== idOf(drive)));
    const legacyDrives = await Drive.find({ _id: { $ne: drive._id }, shortlistedCandidates: { $in: students } }).select('_id');
    legacyDrives.forEach((item) => previousIds.add(idOf(item)));
    const previous = previousIds.size ? await Drive.find({ _id: { $in: [...previousIds] }, status: { $ne: 'Cancelled' } }).populate('shortlistedCandidates', 'name').populate('jobId', 'title requirements.role') : [];
    const recruiterIds = [...new Set([idOf(drive.recruiterId), ...previous.map((item) => idOf(item.recruiterId))])];
    const recruiterProfiles = await Recruiter.find({ userId: { $in: recruiterIds } }).select('userId companyName');
    const recruiterById = new Map(recruiterProfiles.map((profile) => [idOf(profile.userId), profile]));
    const conflicts = [];
    for (const other of previous) {
        const overlap = getOverlap(drive, other);
        if (!overlap) continue;
        const matched = new Set([
            ...apps.filter((app) => idOf(app.driveId) === idOf(other)).map((app) => idOf(app.studentId)),
            ...(other.shortlistedCandidates || []).map(idOf)
        ]);
        for (const studentId of students) {
            if (matched.has(studentId)) conflicts.push(makeConflict('student_time_overlap', studentSummary(userById.get(studentId)), drive, other, overlap, recruiterById));
        }
    }
    return dedupeConflicts(conflicts);
}

module.exports = { checkDriveConflicts, checkDriveTimeConflicts, getStudentConflictsForDrive };
