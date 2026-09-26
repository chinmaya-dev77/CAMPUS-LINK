require('dotenv').config();
const API_PORT = require('./test-isolation')();
const http = require('http');

function req(opts, body) {
    return new Promise((resolve, reject) => {
        const r = http.request(opts, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => {
                try { resolve({ status: resp.statusCode, data: JSON.parse(d) }); }
                catch(e) { resolve({ status: resp.statusCode, data: d }); }
            });
        });
        r.on('error', reject);
        if (body) {
            r.setHeader('Content-Type', 'application/json');
            r.write(JSON.stringify(body));
        }
        r.end();
    });
}
function authHeaders(token) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

async function main() {
    const BASE = { hostname: 'localhost', port: API_PORT };
    const ts = Date.now();

    console.log("1. Registering Recruiter...");
    const rMail = `recruiter_ph8_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST' }, { name: 'Test Recruiter 8', email: rMail, password: 'test-pass', role: 'recruiter' });
    const rLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST' }, { email: rMail, password: 'test-pass' });
    const rToken = rLogin.data.data.token;
    const recruiterId = rLogin.data.data.user.id;

    console.log("2. Creating Job...");
    const cJob = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(rToken) }, {
        title: 'Software Engineer',
        description: 'Need Node.js developer',
        requirements: { requiredSkills: ['node.js'] },
        status: 'active'
    });
    const jobId = cJob.data.data._id;

    console.log("3. Registering Student...");
    const sMail = `student_ph8_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST' }, { name: 'Test Student 8', email: sMail, password: 'test-pass', role: 'student' });
    const sLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST' }, { email: sMail, password: 'test-pass' });
    const sToken = sLogin.data.data.token;
    const studentId = sLogin.data.data.user.id;

    console.log("4. Setting Student Profile Data...");
    await req({ ...BASE, path: `/api/students/${studentId}`, method: 'PATCH', headers: authHeaders(sToken) }, {
        branch: 'CSE', cgpa: 8.5, backlogs: 0,
        skills: [{ name: 'node.js', level: 'advanced' }]
    });

    console.log("5. Testing Student -> Apply to Job...");
    const appRes = await req({ ...BASE, path: '/api/applications', method: 'POST', headers: authHeaders(sToken) }, {
        jobId: jobId
    });
    console.log("   Apply Status:", appRes.status);
    console.log("   Apply Data:", JSON.stringify(appRes.data, null, 2));
    const appId = appRes.data.data.applicationId;

    console.log("6. Testing Recruiter -> Create Drive...");
    const driveRes = await req({ ...BASE, path: '/api/drives', method: 'POST', headers: authHeaders(rToken) }, {
        jobId: jobId,
        date: '2026-10-15',
        startTime: '10:00',
        endTime: '16:00',
        mode: 'online'
    });
    console.log("   Drive Status:", driveRes.status);
    const driveId = driveRes.data.data._id;

    console.log("7. Testing Recruiter -> Shortlist Candidate for Drive...");
    const slRes = await req({ ...BASE, path: `/api/drives/${driveId}/shortlist`, method: 'POST', headers: authHeaders(rToken) }, {
        studentIds: [studentId]
    });
    console.log("   Shortlist Status:", slRes.status);

    console.log("8. Verifying Application Status updated to 'Shortlisted'...");
    const verifyApp = await req({ ...BASE, path: `/api/applications/${appId}`, method: 'GET', headers: authHeaders(sToken) });
    console.log("   Updated Application Status:", verifyApp.data.data.status);
    if(verifyApp.data.data.status === 'Shortlisted') {
        console.log("   ✅ Application status updated successfully!");
    } else {
        console.log("   ❌ Application status update failed.");
    }
}

main().catch(console.error);
