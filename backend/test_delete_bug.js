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
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}
function authHeaders(token) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function main() {
    const BASE = { hostname: 'localhost', port: API_PORT };
    const ts = Date.now();

    // 1. Register recruiter
    const rMail = `recruiter_del_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'Del Rec', email: rMail, password: 'pass', role: 'recruiter' });
    const rLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: rMail, password: 'pass' });
    const rToken = rLogin.data.data.token;
    const rUserId = rLogin.data.data.user.id;
    console.log('Recruiter ID:', rUserId);

    // 2. Register student
    const sMail = `student_del_${ts}@test.com`;
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'Del Student', email: sMail, password: 'pass', role: 'student' });
    const sLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: sMail, password: 'pass' });
    const sToken = sLogin.data.data.token;

    // 3. Create a job
    const cJob = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(rToken) }, {
        title: 'Test Job To Delete',
        description: 'This job will be deleted.',
        status: 'active'
    });
    const jobId = cJob.data.data._id;
    console.log('Created job ID:', jobId, 'status:', cJob.data.data.status);

    // 4. Student sees job before delete
    const beforeDelete = await req({ ...BASE, path: '/api/jobs', method: 'GET', headers: authHeaders(sToken) });
    const beforeJobs = beforeDelete.data.data || [];
    const found = beforeJobs.some(j => j._id === jobId);
    console.log(`[BEFORE DELETE] Total active jobs student sees: ${beforeJobs.length}, created job present: ${found}`);

    // 5. Recruiter deletes the job
    const delRes = await req({ ...BASE, path: `/api/jobs/${jobId}`, method: 'DELETE', headers: authHeaders(rToken) });
    console.log('DELETE response:', delRes.status, delRes.data.success, delRes.data.message);

    // 6. Student queries jobs again IMMEDIATELY after delete
    const afterDelete = await req({ ...BASE, path: '/api/jobs', method: 'GET', headers: authHeaders(sToken) });
    const afterJobs = afterDelete.data.data || [];
    const stillPresent = afterJobs.some(j => j._id === jobId);
    console.log(`[AFTER DELETE]  Total active jobs student sees: ${afterJobs.length}, deleted job still present: ${stillPresent}`);

    if (stillPresent) {
        console.log('\n❌ BUG CONFIRMED: Deleted job still returned by GET /api/jobs');
        console.log('Returned job data:', JSON.stringify(afterJobs.find(j => j._id === jobId), null, 2));
    } else {
        console.log('\n✅ Backend is correct: deleted job NOT returned by GET /api/jobs');
        console.log('   → Bug must be in frontend DOM/state, not backend.');
    }
}

main().catch(console.error);
