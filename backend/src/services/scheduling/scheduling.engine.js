'use strict';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const fail = (message) => {
    const error = new Error(message);
    error.status = 400;
    error.code = 'INVALID_SCHEDULING_DATA';
    throw error;
};

function normalizeDate(date) {
    const value = date instanceof Date ? date.toISOString().slice(0, 10) : String(date || '').slice(0, 10);
    if (!DATE_PATTERN.test(value)) fail('date must be a valid date in YYYY-MM-DD format');
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        fail('date must be a valid date in YYYY-MM-DD format');
    }
    return value;
}

function interval(drive) {
    const date = normalizeDate(drive.date);
    if (!TIME_PATTERN.test(drive.startTime || '') || !TIME_PATTERN.test(drive.endTime || '')) {
        fail('startTime and endTime must use 24-hour HH:mm format');
    }
    const start = Number(drive.startTime.slice(0, 2)) * 60 + Number(drive.startTime.slice(3));
    const end = Number(drive.endTime.slice(0, 2)) * 60 + Number(drive.endTime.slice(3));
    if (end <= start) fail('endTime must be after startTime');
    return { date, start, end };
}

function validateDriveSchedule(drive) {
    if (!drive.date || !drive.startTime || !drive.endTime || !drive.mode) {
        fail('date, startTime, endTime, and mode are required');
    }
    interval(drive);
    return drive;
}

function overlaps(first, second) {
    const a = interval(first);
    const b = interval(second);
    return a.date === b.date && a.start < b.end && b.start < a.end;
}

function getOverlap(first, second) {
    if (!overlaps(first, second)) return null;
    const a = interval(first);
    const b = interval(second);
    const start = Math.max(a.start, b.start);
    const end = Math.min(a.end, b.end);
    const format = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return { date: a.date, startTime: format(start), endTime: format(end) };
}

module.exports = { validateDriveSchedule, overlaps, getOverlap, normalizeDate };
