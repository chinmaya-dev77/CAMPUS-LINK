'use strict';

const assert = require('node:assert/strict');
const Offer = require('./src/models/Offer');
const { evaluatePlacementDocument, extractPlacementDocumentForVerification } = require('./src/services/offer.service');

const student = {
    name: 'Chinmaya Prusty',
    registrationNumber: undefined,
    branch: 'CSE',
    cgpa: 8.2,
    education: [{ institution: 'Campus University', field: 'Computer Science Engineering' }]
};
const extracted = {
    readable: true,
    documentType: 'Marksheet',
    studentName: 'Chinmaya Prusty',
    studentId: '',
    course: 'Computer Science',
    institution: 'Campus University',
    marks: '88/100',
    percentage: 88,
    cgpa: 8.2,
    otherFields: {}
};

assert.equal(evaluatePlacementDocument(extracted, 'Marksheet', student).status, 'VERIFIED', 'an exact full-name match and relevant profile details should verify');
assert.notEqual(evaluatePlacementDocument({ ...extracted, studentName: 'Chinmay Prusty' }, 'Marksheet', student).status, 'VERIFIED', 'name spelling differences must not auto-verify');
assert.notEqual(evaluatePlacementDocument({ ...extracted, studentName: 'Prusty' }, 'Marksheet', student).status, 'VERIFIED', 'a missing middle or given name must not auto-verify');
assert.equal(evaluatePlacementDocument({ ...extracted, studentName: 'CHINMAYA  PRUSTY.' }, 'Marksheet', student).status, 'VERIFIED', 'case, punctuation, and extra spaces should not create a false name mismatch');
assert.equal(evaluatePlacementDocument({ ...extracted, studentId: 'CSE12345' }, 'Marksheet', student).status, 'VERIFIED', 'an ID present only on the document is not a failed requirement');
assert.equal(evaluatePlacementDocument({ ...extracted, studentId: 'WRONG123' }, 'Marksheet', { ...student, registrationNumber: 'CSE12345' }).status, 'NEEDS_REVIEW', 'conflicting IDs must require manual checking');
assert.equal(evaluatePlacementDocument({ ...extracted, course: '' , institution: '', cgpa: null }, 'Marksheet', { name: student.name }).status, 'NEEDS_REVIEW', 'name similarity alone cannot verify a document');
assert.equal(evaluatePlacementDocument({ ...extracted, course: 'Mechanical Engineering' }, 'Marksheet', student).status, 'NEEDS_REVIEW', 'conflicting profile details must require manual checking');
assert.equal(evaluatePlacementDocument({ ...extracted, readable: false }, 'Marksheet', student).status, 'NEEDS_REVIEW', 'unreadable documents must require manual checking');
assert.equal(evaluatePlacementDocument({ ...extracted, documentType: 'Passport' }, 'Marksheet', student).status, 'REJECTED', 'a clearly wrong document type must not verify');

const offer = new Offer({
    applicationId: '64b000000000000000000001', studentId: '64b000000000000000000002',
    recruiterId: '64b000000000000000000003', jobId: '64b000000000000000000004',
    companyName: 'Example', role: 'Engineer', ctc: 500000,
    documents: [{ name: 'Marksheet', verificationStatus: 'VERIFIED', verificationMethod: 'AI' }]
});
(async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 fixture');
    const pageImage = Buffer.from('rendered scanned page');
    const cases = [];
    const extractedFacts = { ...extracted };
    const normalPdfFacts = await extractPlacementDocumentForVerification({ buffer: pdfBytes, contentType: 'application/pdf' }, {
        extractText: async () => 'Extractable transcript text with sufficient readable characters.',
        renderPdfPages: async () => { throw new Error('regular text PDF must not be rendered'); },
        extractPlacementDocument: async (input) => { cases.push(input); return extractedFacts; }
    });
    assert.equal(normalPdfFacts.documentType, 'Marksheet', 'text PDFs should go through text extraction');
    assert.equal(typeof cases[0].text, 'string');

    const scannedPdfFacts = await extractPlacementDocumentForVerification({ buffer: pdfBytes, contentType: 'application/pdf' }, {
        extractText: async () => { const error = new Error('no embedded text'); error.code = 'EMPTY_PDF'; throw error; },
        renderPdfPages: async () => [pageImage],
        extractPlacementDocument: async (input) => { cases.push(input); return extractedFacts; }
    });
    assert.equal(scannedPdfFacts.documentType, 'Marksheet', 'scanned PDFs should be rendered and image-extracted');
    assert.deepEqual(cases[1].imageBuffers, [{ buffer: pageImage, contentType: 'image/jpeg' }]);

    const directImageFacts = await extractPlacementDocumentForVerification({ buffer: pageImage, contentType: 'image/png' }, {
        extractPlacementDocument: async (input) => { cases.push(input); return extractedFacts; }
    });
    assert.equal(directImageFacts.documentType, 'Marksheet', 'uploaded image documents should use vision extraction');
    assert.deepEqual(cases[2].imageBuffers, [{ buffer: pageImage, contentType: 'image/png' }]);
    assert.equal(evaluatePlacementDocument(normalPdfFacts, 'Marksheet', student).status, 'VERIFIED');
    assert.equal(evaluatePlacementDocument(scannedPdfFacts, 'Marksheet', student).status, 'VERIFIED');
    assert.equal(evaluatePlacementDocument(directImageFacts, 'Marksheet', student).status, 'VERIFIED');

    await offer.validate();
    offer.documents[0].verificationMethod = 'MANUAL';
    await offer.validate();
    console.log('Offer verification rule tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
