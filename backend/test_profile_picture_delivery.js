'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Student = require('./src/models/Student');
const User = require('./src/models/User');
const cloudinary = require('./src/services/cloudinary.service');

const studentId = '64b000000000000000000002';
const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
let requestedAsset = null;
let cloudinaryBytes = imageBytes;
let storedProfile = { profilePicture: null, async save() {} };
let lastPictureSelection = '';
cloudinary.downloadAsset = async (...args) => { requestedAsset = args; return cloudinaryBytes; };
cloudinary.uploadBuffer = async (bytes) => { cloudinaryBytes = Buffer.from(bytes); return { publicId: 'campuslink/profile-pictures/uploaded-test', resourceType: 'image', secureUrl: 'https://res.cloudinary.com/example/image/authenticated/uploaded-test.png' }; };
const studentQuery = Student.findOne;
const userQuery = User.findById;
const savedPicture = { fileName: 'campuslink/profile-pictures/test', publicId: 'campuslink/profile-pictures/test', resourceType: 'image', contentType: undefined };
Student.findOne = () => ({
    select() { return this; },
    async lean() { return { profilePicture: savedPicture }; }
});
User.findById = (id) => ({ select: async () => ({ _id: id, name: 'Student', email: 'student@test.invalid', role: 'student', isActive: true }) });

(async () => {
    const app = express();
    app.use('/api/students', require('./src/routes/student.routes'));
    const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/students/${studentId}/profile-picture`;
        const unauthenticated = await fetch(url);
        assert.equal(unauthenticated.status, 401, 'the actual route must reject unauthenticated requests');

        const token = jwt.sign({ id: studentId }, process.env.JWT_SECRET || (process.env.JWT_SECRET = 'isolated-profile-picture-test-secret'));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const returnedBytes = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png', 'image response type should be inferred from returned bytes if metadata is missing');
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(returnedBytes, imageBytes, 'the actual route must return image bytes from the Cloudinary asset');
        assert.deepEqual(requestedAsset, ['campuslink/profile-pictures/test', 'image', '']);

        savedPicture.publicId = undefined;
        savedPicture.secureUrl = 'https://res.cloudinary.com/example/image/authenticated/v1/legacy-profile.png';
        const legacyToken = jwt.sign({ id: studentId }, process.env.JWT_SECRET);
        const legacyResponse = await fetch(url, { headers: { Authorization: `Bearer ${legacyToken}` } });
        assert.equal(legacyResponse.status, 200, 'older Cloudinary IDs saved only in fileName must remain retrievable');
        assert.deepEqual(requestedAsset, ['campuslink/profile-pictures/test', 'image', 'png']);

        // Exercise the real multipart upload route and then immediately retrieve
        // the persisted photo through the same endpoint used by the frontend.
        Student.findOne = () => ({
            select(fields) { lastPictureSelection = fields; return this; },
            async lean() { return { profilePicture: storedProfile.profilePicture }; },
            then(resolve, reject) { return Promise.resolve(storedProfile).then(resolve, reject); }
        });
        const form = new FormData();
        form.append('picture', new Blob([imageBytes], { type: 'image/png' }), 'profile.png');
        const uploaded = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const uploadResult = await uploaded.json();
        assert.equal(uploaded.status, 200, 'profile photo upload must succeed');
        assert.equal(uploadResult.data.fileUrl, `/api/students/${studentId}/profile-picture`);
        assert.equal(storedProfile.profilePicture.publicId, 'campuslink/profile-pictures/uploaded-test', 'Cloudinary asset ID must be persisted on the student profile');
        const refreshed = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(refreshed.status, 200, 'a successful upload must be visible immediately through profile picture delivery');
        assert.deepEqual(Buffer.from(await refreshed.arrayBuffer()), imageBytes);
        assert.deepEqual(requestedAsset, ['campuslink/profile-pictures/uploaded-test', 'image', 'png']);

        storedProfile.profilePicture = { publicId: 'campuslink/profile-pictures/metadata-only', resourceType: 'image', contentType: 'image/png' };
        const metadataOnly = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(metadataOnly.status, 200, 'profile photos must remain retrievable when the hidden Cloudinary id is the only saved identifier');
        assert.deepEqual(requestedAsset, ['campuslink/profile-pictures/metadata-only', 'image', 'png']);
        assert(!lastPictureSelection.split(/\s+/).includes('profilePicture'), 'picture retrieval must not select a parent path alongside its children');
        assert(lastPictureSelection.includes('profilePicture.publicId'), 'picture retrieval must explicitly include the private Cloudinary id');

        const otherToken = jwt.sign({ id: '64b000000000000000000099' }, process.env.JWT_SECRET);
        const denied = await fetch(url, { headers: { Authorization: `Bearer ${otherToken}` } });
        assert.equal(denied.status, 403, 'a different student must not retrieve the picture');
        console.log('Profile picture delivery handler tests passed.');
    } finally {
        Student.findOne = studentQuery;
        User.findById = userQuery;
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
