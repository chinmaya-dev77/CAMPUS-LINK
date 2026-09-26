'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { overlaps, getOverlap, validateDriveSchedule } = require('./src/services/scheduling/scheduling.engine');

const drive = (date, startTime, endTime, extra = {}) => ({ date, startTime, endTime, mode: 'online', ...extra });

test('different dates with identical times do not overlap', () => {
    assert.equal(overlaps(drive('2026-10-15', '10:00', '12:00'), drive('2026-10-16', '10:00', '12:00')), false);
});

test('exactly matching intervals conflict', () => {
    assert.deepEqual(getOverlap(drive('2026-10-15', '10:00', '12:00'), drive('2026-10-15', '10:00', '12:00')),
        { date: '2026-10-15', startTime: '10:00', endTime: '12:00' });
});

test('partial overlaps return the shared interval', () => {
    assert.deepEqual(getOverlap(drive('2026-10-15', '10:00', '12:00'), drive('2026-10-15', '11:00', '13:00')),
        { date: '2026-10-15', startTime: '11:00', endTime: '12:00' });
});

test('an interval fully contained by another conflicts', () => {
    assert.equal(overlaps(drive('2026-10-15', '09:00', '15:00'), drive('2026-10-15', '11:00', '12:00')), true);
});

test('adjacent intervals do not overlap', () => {
    assert.equal(overlaps(drive('2026-10-15', '10:00', '12:00'), drive('2026-10-15', '12:00', '13:00')), false);
});

test('non-overlapping intervals do not conflict', () => {
    assert.equal(overlaps(drive('2026-10-15', '10:00', '11:00'), drive('2026-10-15', '12:00', '13:00')), false);
});

test('schedule validation rejects invalid dates, times, and reversed intervals', () => {
    assert.throws(() => validateDriveSchedule(drive('2026-02-30', '10:00', '11:00')),
        { code: 'INVALID_SCHEDULING_DATA', status: 400 });
    assert.throws(() => validateDriveSchedule(drive('2026-10-15', '25:00', '26:00')),
        { code: 'INVALID_SCHEDULING_DATA', status: 400 });
    assert.throws(() => validateDriveSchedule(drive('2026-10-15', '11:00', '10:00')),
        { code: 'INVALID_SCHEDULING_DATA', status: 400 });
});

test('schedule validation requires mode and all interval fields', () => {
    assert.throws(() => validateDriveSchedule({ date: '2026-10-15', startTime: '10:00', endTime: '11:00' }),
        { code: 'INVALID_SCHEDULING_DATA', status: 400 });
});
