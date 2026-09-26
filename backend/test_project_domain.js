'use strict';
const assert = require('node:assert/strict');
const { mergeResumeProjects } = require('./src/services/project.domain');

const manual = { _id: 'manual-1', title: 'CampusLink', description: 'Manual detail', source: 'manual' };
const oldResume = { _id: 'resume-old', title: 'Weather App', source: 'resume' };
const merged = mergeResumeProjects([manual, oldResume], [
    { title: 'CampusLink', description: 'AI duplicate' },
    { title: 'Weather App', description: 'Refreshed' },
    { title: ' Weather   App ', description: 'Repeated parsed record' },
    { title: 'Placement Portal', description: 'New extracted project' }
]);
assert.equal(merged.length, 3);
assert.equal(merged[0].description, 'Manual detail', 'manual record is preserved');
assert.equal(merged[1].title, 'Weather App');
assert.equal(merged[1].description, 'Refreshed');
assert.equal(merged[2].title, 'Placement Portal');
assert.equal(merged[2].source, 'resume');
console.log('Project merge passed: manual project preserved; parsed duplicates suppressed; parsed resume projects refreshed.');
