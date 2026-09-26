'use strict';
const assert = require('node:assert/strict');
const { transitions, canTransition } = require('./src/services/offer.transitions');

assert.equal(canTransition('Selected', 'Offer Generated'), true);
assert.equal(canTransition('Offer Generated', 'Offer Sent'), true);
assert.equal(canTransition('Offer Sent', 'Pending'), true);
assert.equal(canTransition('Offer Sent', 'Accepted'), true);
assert.equal(canTransition('Pending', 'Declined'), true);
assert.equal(canTransition('Accepted', 'Documentation Pending'), true);
assert.equal(canTransition('Documentation Pending', 'Documents Verified'), true);
assert.equal(canTransition('Documents Verified', 'Joining Confirmed'), true);
assert.equal(canTransition('Selected', 'Joining Confirmed'), false);
assert.equal(canTransition('Declined', 'Accepted'), false);
assert.equal(canTransition('Joining Confirmed', 'Pending'), false);
assert.equal(canTransition('Pending', 'Offer Sent'), false);
assert.deepEqual(transitions['Joining Confirmed'], []);
console.log('Phase 10 lifecycle unit tests passed.');
