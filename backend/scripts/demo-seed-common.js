'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEMO_PREFIX = 'campuslink-cs-demo-v1:';
const STATE_FILE = path.resolve(__dirname, '../.demo-seed-state.json');
const PROFILE_FIELDS = ['companyName', 'recruiterName', 'email', 'phone', 'industry', 'companyDescription', 'website'];
const COMPANIES = [
    { name: 'TechNova AI Solutions', industry: 'Software Development', phone: '+91 80 5550 1001', website: 'https://technova.example.com', description: 'Builds software platforms and applied AI products for businesses, with a focus on dependable engineering and early-career talent.' },
    { name: 'DataSphere Analytics', industry: 'Data Analytics', phone: '+91 80 5550 1002', website: 'https://datasphere.example.com', description: 'Turns complex business data into practical analytics products, decision tools, and measurable insights.' },
    { name: 'CloudBridge Technologies', industry: 'Cloud Computing', phone: '+91 80 5550 1003', website: 'https://cloudbridge.example.com', description: 'Designs cloud-native services and developer platforms for teams modernizing their digital systems.' },
    { name: 'Nexora Software', industry: 'Enterprise Software', phone: '+91 80 5550 1004', website: 'https://nexora.example.com', description: 'Creates secure enterprise applications with an emphasis on maintainable services and thoughtful user experiences.' },
    { name: 'ByteCraft Labs', industry: 'Technology Research', phone: '+91 80 5550 1005', website: 'https://bytecraft.example.com', description: 'A product engineering studio building web applications, automation tools, and software prototypes.' },
    { name: 'InnoStack Technologies', industry: 'Information Technology', phone: '+91 80 5550 1006', website: 'https://innostack.example.com', description: 'Helps organizations ship reliable digital products through full-stack development and platform engineering.' },
    { name: 'QuantumSoft', industry: 'Artificial Intelligence', phone: '+91 80 5550 1007', website: 'https://quantumsoft.example.com', description: 'Develops practical machine-learning software and data products for research and industry teams.' },
    { name: 'CodeVertex', industry: 'Application Development', phone: '+91 80 5550 1008', website: 'https://codevertex.example.com', description: 'Builds customer-facing web products and backend systems with a strong focus on quality and scalability.' },
    { name: 'InsightWorks', industry: 'Business Intelligence', phone: '+91 80 5550 1009', website: 'https://insightworks.example.com', description: 'Combines data engineering and business intelligence to make operational information easier to use.' },
    { name: 'DevCore Systems', industry: 'Software Engineering', phone: '+91 80 5550 1010', website: 'https://devcore.example.com', description: 'Engineers modern software systems and developer tools for growing technology organizations.' }
];

const JOBS = [
    { title: 'Software Engineer', skills: ['Java', 'Data Structures', 'Algorithms', 'OOP', 'SQL'], preferred: ['Spring Boot', 'Git', 'REST APIs'], minCgpa: 7.0 },
    { title: 'Backend Developer', skills: ['Java', 'SQL', 'DBMS', 'Data Structures', 'REST APIs'], preferred: ['Spring Boot', 'Docker', 'Git'], minCgpa: 7.0 },
    { title: 'Full Stack Developer', skills: ['JavaScript', 'HTML', 'CSS', 'React', 'Node.js'], preferred: ['Express.js', 'MongoDB', 'Git'], minCgpa: 6.5 },
    { title: 'Software Development Engineer', skills: ['Java', 'Algorithms', 'Data Structures', 'OOP', 'Problem Solving'], preferred: ['System Design', 'SQL', 'Git'], minCgpa: 7.0 },
    { title: 'Python Developer', skills: ['Python', 'OOP', 'SQL', 'REST APIs', 'Git'], preferred: ['Django', 'Flask', 'Docker'], minCgpa: 6.5 },
    { title: 'Data Analyst', skills: ['Python', 'SQL', 'Excel', 'Statistics', 'Data Analysis'], preferred: ['Pandas', 'Power BI', 'Tableau'], minCgpa: 6.5 },
    { title: 'Data Scientist', skills: ['Python', 'Statistics', 'Machine Learning', 'Pandas', 'SQL'], preferred: ['Scikit-learn', 'Data Visualization', 'NumPy'], minCgpa: 7.0 },
    { title: 'Machine Learning Engineer', skills: ['Python', 'Machine Learning', 'Statistics', 'Data Structures', 'SQL'], preferred: ['Scikit-learn', 'TensorFlow', 'MLOps'], minCgpa: 7.0 },
    { title: 'Frontend Developer', skills: ['JavaScript', 'HTML', 'CSS', 'React', 'Responsive Design'], preferred: ['TypeScript', 'Accessibility', 'Git'], minCgpa: 6.5 },
    { title: 'QA Automation Engineer', skills: ['Java', 'Python', 'Testing', 'SQL', 'Problem Solving'], preferred: ['Selenium', 'API Testing', 'CI/CD'], minCgpa: 6.5 },
    { title: 'DevOps Engineer', skills: ['Linux', 'Git', 'Python', 'Networking', 'CI/CD'], preferred: ['Docker', 'Kubernetes', 'Cloud Platforms'], minCgpa: 7.0 },
    { title: 'Cloud Engineer', skills: ['Linux', 'Networking', 'Python', 'Cloud Fundamentals', 'Git'], preferred: ['AWS', 'Docker', 'Terraform'], minCgpa: 7.0 },
    { title: 'AI Engineer', skills: ['Python', 'Machine Learning', 'Data Structures', 'Statistics', 'SQL'], preferred: ['NLP', 'Deep Learning', 'PyTorch'], minCgpa: 7.0 },
    { title: 'Java Developer', skills: ['Java', 'OOP', 'DBMS', 'SQL', 'Data Structures'], preferred: ['Spring Boot', 'Microservices', 'Git'], minCgpa: 6.5 },
    { title: 'Web Developer', skills: ['JavaScript', 'HTML', 'CSS', 'React', 'REST APIs'], preferred: ['Node.js', 'Accessibility', 'Git'], minCgpa: 6.5 }
];

const DRIVE_DATES = ['2026-10-10', '2026-10-14', '2026-10-18', '2026-10-22', '2026-10-27', '2026-11-03', '2026-11-08', '2026-11-15', '2026-11-22', '2026-12-05', '2026-12-12', '2026-12-20'];

function snapshotProfile(profile) {
    if (!profile) return null;
    const result = {};
    for (const field of PROFILE_FIELDS) result[field] = profile[field] ?? null;
    return result;
}

function profileSeed(user, company) {
    return {
        companyName: company.name,
        recruiterName: user.name,
        email: user.email,
        phone: company.phone,
        industry: company.industry,
        companyDescription: company.description,
        website: company.website
    };
}

async function saveState(state) {
    const temporary = `${STATE_FILE}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, STATE_FILE);
}

async function readState() {
    try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); }
    catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error(`Could not read demo seed state: ${error.message}`);
    }
}

module.exports = { DEMO_PREFIX, STATE_FILE, PROFILE_FIELDS, COMPANIES, JOBS, DRIVE_DATES, snapshotProfile, profileSeed, saveState, readState };
