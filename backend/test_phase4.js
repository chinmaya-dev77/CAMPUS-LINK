require('dotenv').config();
const API_PORT = require('./test-isolation')();
const http = require('http');

async function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                    try {
                        resolve({ status: res.statusCode, data: JSON.parse(body) });
                    } catch(e) {
                        resolve({ status: res.statusCode, body });
                    }
                } else {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTest() {
    const email = `test${Date.now()}@example.com`;
    // 1. Register
    const regRes = await makeRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { name: 'Test User', email, password: 'password123', role: 'student' });
    
    console.log('Register:', regRes.status);

    // 2. Login
    const loginRes = await makeRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email, password: 'password123' });
    
    console.log('Login:', loginRes.status);
    console.log('Login Res Data:', JSON.stringify(loginRes.data));
    const token = loginRes.data.data.token;
    const userId = loginRes.data.data.user._id || loginRes.data.data.user.id;

    // 3. Update Profile
    const profileData = {
        name: 'Test User',
        phone: '1234567890',
        branch: 'CSE',
        graduationYear: 2025,
        cgpa: 8.5,
        backlogs: 0,
        skills: [
            { name: 'JavaScript', level: 'advanced' },
            { name: 'React', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' }
        ],
        projects: [
            { title: 'Project 1', description: 'A cool web app', technologies: ['JavaScript', 'React', 'Node.js'], role: 'Full Stack' },
            { title: 'Project 2', description: 'Another app', technologies: ['Python'], role: 'Backend' }
        ],
        education: [
            { institution: 'College', degree: 'BTech', field: 'CSE', startYear: 2021, endYear: 2025 }
        ]
    };

    const updateRes = await makeRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: `/api/students/${userId}`,
        method: 'PATCH',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }, profileData);
    
    console.log('Update Profile:', updateRes.status);

    // 4. Analyze Readiness
    const readinessRes = await makeRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: `/api/students/${userId}/readiness/analyze`,
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });

    console.log('Analyze Readiness:', readinessRes.status);
    console.log(JSON.stringify(readinessRes.data, null, 2));

    // 5. Get Skill Gaps
    const gapsRes = await makeRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: `/api/students/${userId}/skill-gaps`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Get Skill Gaps:', gapsRes.status);
    console.log(JSON.stringify(gapsRes.data, null, 2));
}

runTest().catch(console.error);
