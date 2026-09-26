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

    const email = 'recruiter' + Date.now() + '@test.com';
    console.log("Registering recruiter...");
    await req({ ...BASE, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { name: 'Test Recruiter', email: email, password: 'test-pass', role: 'recruiter' });
    
    const login = await req({ ...BASE, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { email: email, password: 'test-pass' });
    const token = login.data.data.token;
    const uid = login.data.data.user.id;

    console.log("Recruiter login OK, userId:", uid);

    console.log("Testing GET /api/recruiters/:id (Should return shell profile)...");
    const p1 = await req({ ...BASE, path: '/api/recruiters/' + uid, method: 'GET', headers: authHeaders(token) });
    console.log("GET Profile status:", p1.status, p1.data.data.recruiterName === 'Test Recruiter' ? 'PASS' : 'FAIL');

    console.log("Testing PATCH /api/recruiters/:id...");
    const p2 = await req({ ...BASE, path: '/api/recruiters/' + uid, method: 'PATCH', headers: authHeaders(token) },
        { companyName: 'Acme Corp', industry: 'Tech' });
    console.log("PATCH Profile status:", p2.status, p2.data.data.companyName === 'Acme Corp' ? 'PASS' : 'FAIL');

    console.log("Testing POST /api/jobs...");
    const j1 = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(token) },
        { title: 'SE 1', description: 'desc', requirements: { requiredSkills: ['Java'] } });
    const jobId = j1.data.data._id;
    console.log("POST Job status:", j1.status, jobId ? 'PASS' : 'FAIL');

    console.log("Testing GET /api/jobs?recruiterId=...");
    const j2 = await req({ ...BASE, path: '/api/jobs?recruiterId=' + uid, method: 'GET', headers: authHeaders(token) });
    console.log("GET Jobs status:", j2.status, j2.data.data.length === 1 ? 'PASS' : 'FAIL');

    console.log("Testing PATCH /api/jobs/:id...");
    const j3 = await req({ ...BASE, path: '/api/jobs/' + jobId, method: 'PATCH', headers: authHeaders(token) },
        { title: 'SE 2' });
    console.log("PATCH Job status:", j3.status, j3.data.data.title === 'SE 2' ? 'PASS' : 'FAIL');

    console.log("Testing DELETE /api/jobs/:id...");
    const j4 = await req({ ...BASE, path: '/api/jobs/' + jobId, method: 'DELETE', headers: authHeaders(token) });
    console.log("DELETE Job status:", j4.status, j4.data.success ? 'PASS' : 'FAIL');

    console.log("Testing GET /api/jobs?recruiterId=... after delete");
    const j5 = await req({ ...BASE, path: '/api/jobs?recruiterId=' + uid, method: 'GET', headers: authHeaders(token) });
    console.log("GET Jobs status:", j5.status, j5.data.data.length === 0 ? 'PASS' : 'FAIL');
}

main().catch(console.error);
