require('dotenv').config();
const API_PORT = require('./test-isolation')();
const http = require('http');

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
function authHeaders(token) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

async function main() {
    const BASE = { hostname: 'localhost', port: API_PORT };
    const ts = Date.now();

    console.log("1. Registering Recruiter...");
    const rMail = `recruiter_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Test Rec', email: rMail, password: 'test-pass', role: 'recruiter' });
    const rLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email: rMail, password: 'test-pass' });
    const rToken = rLogin.data.data.token;

    console.log("2. Creating Job...");
    const jobData = {
        title: 'Backend Software Developer',
        description: 'Requirements: 3+ years experience. BS in Computer Science. Must know JS, Node, Express, and MongoDB. Experience with git.',
        requirements: {
            requiredSkills: ['javascript', 'node.js', 'database/sql'],
            preferredSkills: ['react'],
            minimumCGPA: 7.0,
            maximumBacklogs: 1,
            eligibleBranches: ['CSE', 'IT']
        },
        status: 'active'
    };
    const cJob = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(rToken) }, jobData);
    const jobId = cJob.data.data._id;

    console.log("3. Registering Student...");
    const sMail = `student_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Test Student', email: sMail, password: 'test-pass', role: 'student' });
    const sLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email: sMail, password: 'test-pass' });
    const sToken = sLogin.data.data.token;
    const studentId = sLogin.data.data.user.id;

    console.log("4. Setting Student Profile Data...");
    await req({ ...BASE, path: `/api/students/${studentId}`, method: 'GET', headers: authHeaders(sToken) });
    await req({ ...BASE, path: `/api/students/${studentId}`, method: 'PATCH', headers: authHeaders(sToken) }, {
        branch: 'CSE', cgpa: 8.5, backlogs: 0,
        skills: [
            { name: 'javascript', level: 'advanced' },
            { name: 'node.js', level: 'advanced' },
            { name: 'database/sql', level: 'intermediate' }
        ]
    });

    console.log("5. Testing Student -> Match Endpoint...");
    const matchRes = await req({ ...BASE, path: `/api/jobs/${jobId}/match`, method: 'POST', headers: authHeaders(sToken) });
    console.log("   Match Status:", matchRes.status);
    console.log("   Match Data:", JSON.stringify(matchRes.data, null, 2));

    console.log("6. Testing Recruiter -> Candidates Endpoint...");
    const candRes = await req({ ...BASE, path: `/api/jobs/${jobId}/candidates?includeIneligible=true`, method: 'GET', headers: authHeaders(rToken) });
    console.log("   Candidates Status:", candRes.status);
    console.log("   Candidates Data Count:", candRes.data.data ? candRes.data.data.length : 0);
    
    // Check if the student is in the list
    const found = candRes.data.data.some(c => c.studentName === 'Test Student');
    console.log("   Student found in candidates:", found);
}
main().catch(console.error);
