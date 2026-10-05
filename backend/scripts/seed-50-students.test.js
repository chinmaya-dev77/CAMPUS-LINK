'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareReanalysisBatch, REANALYZE_EXCLUSIONS } = require('./seed-50-students');

test('reanalyze explicitly excludes only Simran and retains the other 49 students', () => {
    const students = Array.from({ length: 50 }, (_, index) => ({
        number: index + 1,
        name: index === 14 ? 'Simran Kaur' : `Student ${index + 1}`,
        email: index === 14 ? 'simrankaur37@gmail.com' : `student${index + 1}@gmail.com`,
        filename: index === 14 ? '15_Simran_Kaur.pdf' : `${String(index + 1).padStart(2, '0')}_Student_${index + 1}.pdf`
    }));

    const batch = prepareReanalysisBatch(students);

    assert.equal(batch.students.length, 49);
    assert.equal(batch.excluded.length, 1);
    assert.deepEqual(batch.excluded[0], {
        email: 'simrankaur37@gmail.com',
        name: 'Simran Kaur',
        filename: '15_Simran_Kaur.pdf'
    });
    assert.equal(batch.students.some((student) => student.email === 'simrankaur37@gmail.com'), false);
});

test('reanalyze fails closed if the explicit exclusion no longer matches its expected ZIP mapping', () => {
    assert.throws(() => prepareReanalysisBatch([{
        email: REANALYZE_EXCLUSIONS[0].email,
        name: 'Different Name',
        filename: REANALYZE_EXCLUSIONS[0].filename
    }]), /Reanalysis exclusion mapping changed/);
});

test('reanalyze fails closed when Simran is absent from the input', () => {
    const students = [{ name: 'A Student', email: 'a.student@gmail.com', filename: '01_A_Student.pdf' }];
    assert.throws(() => prepareReanalysisBatch(students), /missing explicitly excluded student/);
});
