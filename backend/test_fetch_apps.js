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

async function test() {
    const BASE = { hostname: 'localhost', port: API_PORT };
    const ts = Date.now();

    const rMail = "recruiter_" + ts + "@test.com";
    await req({ ...BASE, path: '/api/auth/register', method: 'POST' }, { name: 'Rec', email: rMail, password: 'pass', role: 'recruiter' });
    const rLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST' }, { email: rMail, password: 'pass' });
    const rToken = rLogin.data.data.token;
    
    const jobRes = await req({ ...BASE, path: '/api/jobs', method: 'POST', headers: authHeaders(rToken) }, { title: 'Tester', description: 'Test', requirements: {}, status: 'active' });
    const jobId = jobRes.data.data._id;

    const sMail = "student_" + ts + "@test.com";
    await req({ ...BASE, path: '/api/auth/register', method: 'POST' }, { name: 'Stu', email: sMail, password: 'pass', role: 'student' });
    const sLogin = await req({ ...BASE, path: '/api/auth/login', method: 'POST' }, { email: sMail, password: 'pass' });
    const sToken = sLogin.data.data.token;
    const sId = sLogin.data.data.user.id;
    
    await req({ ...BASE, path: '/api/students/'+sId, method: 'PATCH', headers: authHeaders(sToken) }, { branch: 'CSE', cgpa: 8, backlogs: 0 });
    
    await req({ ...BASE, path: '/api/applications', method: 'POST', headers: authHeaders(sToken) }, { jobId });
    
    const appsRes = await req({ ...BASE, path: '/api/students/' + sId + '/applications', method: 'GET', headers: authHeaders(sToken) });
    console.log("Total apps found:", appsRes.data.data.length);
    console.log("Job Title returned:", appsRes.data.data[0]?.jobId?.title);
}
test();
