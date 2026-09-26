const http = require('http');
require('dotenv').config();
const API_PORT = require('./test-isolation')();

function req(opts, body) {
    return new Promise((resolve, reject) => {
        const r = http.request(opts, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => resolve({ status: resp.statusCode, data: JSON.parse(d) }));
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

function authHeaders(token) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function main() {
    const BASE = { hostname: 'localhost', port: API_PORT };

    // --- Test 1: CGPA set via PATCH — no CGPA recommendation after analyze ---
    const email1 = 'verifycgpa' + Date.now() + '@test.com';
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'Verify User', email: email1, password: 'pass1234', role: 'student' });
    const login1 = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: email1, password: 'pass1234' });
    const tok1 = login1.data.data.token;
    const uid1 = login1.data.data.user.id;

    await req({ ...BASE, path: '/api/students/' + uid1, method: 'PATCH', headers: authHeaders(tok1) },
        { name: 'Verify User', cgpa: 8.75, backlogs: 0, skills: [{ name: 'JavaScript', level: 'advanced' }], projects: [{ title: 'App', description: 'A web app', technologies: ['JS'], role: 'Dev' }] });

    const r1 = await req({ ...BASE, path: '/api/students/' + uid1 + '/readiness/analyze', method: 'POST', headers: authHeaders(tok1) });
    const d1 = r1.data.data;

    console.log('\n=== Issue #2: CGPA=8.75 set via PATCH, then analyze ===');
    console.log('Academic score:', d1.breakdown.academic, '(expected ~82)');
    console.log('Missing evidence:', JSON.stringify(d1.missingEvidence));
    const hasCgpaRec1 = d1.recommendations.some(r => r.toLowerCase().includes('cgpa'));
    console.log('CGPA rec present (expected FALSE):', hasCgpaRec1, hasCgpaRec1 ? 'FAIL' : 'PASS');
    console.log('Recommendations:', JSON.stringify(d1.recommendations));

    // --- Test 2: No CGPA — should recommend entering it ---
    const email2 = 'noacad' + Date.now() + '@test.com';
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'No Acad', email: email2, password: 'pass1234', role: 'student' });
    const login2 = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: email2, password: 'pass1234' });
    const tok2 = login2.data.data.token;
    const uid2 = login2.data.data.user.id;

    await req({ ...BASE, path: '/api/students/' + uid2, method: 'PATCH', headers: authHeaders(tok2) },
        { name: 'No Acad', skills: [{ name: 'Python', level: 'intermediate' }] });

    const r2 = await req({ ...BASE, path: '/api/students/' + uid2 + '/readiness/analyze', method: 'POST', headers: authHeaders(tok2) });
    const d2 = r2.data.data;

    console.log('\n=== Negative: No CGPA — should recommend entering CGPA ===');
    console.log('Missing evidence:', JSON.stringify(d2.missingEvidence));
    const hasCgpaRec2 = d2.recommendations.some(r => r.toLowerCase().includes('cgpa'));
    console.log('CGPA rec present (expected TRUE):', hasCgpaRec2, hasCgpaRec2 ? 'PASS' : 'FAIL');

    // --- Test 3: resume upload CGPA flow (simulated via direct applyResumeData) ---
    console.log('\n=== Issue #1: Resume upload with cgpa=8.75 in validatedData (new profile) ===');
    const email3 = 'newprofile' + Date.now() + '@test.com';
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'New Profile', email: email3, password: 'pass1234', role: 'student' });
    const login3 = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: email3, password: 'pass1234' });
    const tok3 = login3.data.data.token;
    const uid3 = login3.data.data.user.id;

    // Simulate what applyResumeData does by calling it directly in Node
    const { applyResumeData } = require('./src/services/student.service');
    const validatedFromResume = {
        name: 'New Profile',
        phone: '9876543210',
        cgpa: 8.75,
        skills: [{ name: 'JavaScript', level: 'advanced' }, { name: 'DSA', level: 'intermediate' }],
        projects: [{ title: 'Proj', description: 'Cool', technologies: ['JS'], role: 'Dev' }],
        certifications: [], experience: [], education: []
    };
    const meta = { originalFileName: 'resume.pdf', storedFileName: 'uuid123.pdf', fileUrl: '/uploads/uuid123.pdf', uploadedAt: new Date() };
    const saved = await applyResumeData(uid3, validatedFromResume, meta);
    console.log('Saved cgpa from resume (new profile):', saved.cgpa, saved.cgpa === 8.75 ? 'PASS' : 'FAIL');

    // Now analyze readiness for this profile
    const r3 = await req({ ...BASE, path: '/api/students/' + uid3 + '/readiness/analyze', method: 'POST', headers: authHeaders(tok3) });
    const d3 = r3.data.data;
    console.log('Academic score after resume upload:', d3.breakdown.academic, '(expected ~82)');
    console.log('Academic missing?', d3.missingEvidence.includes('Academic'), '(expected false)');
    const hasCgpaRec3 = d3.recommendations.some(r => r.toLowerCase().includes('cgpa'));
    console.log('CGPA rec after resume upload (expected FALSE):', hasCgpaRec3, hasCgpaRec3 ? 'FAIL' : 'PASS');

    process.exit(0);
}

require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(() => main()).catch(e => { console.error(e); process.exit(1); });
