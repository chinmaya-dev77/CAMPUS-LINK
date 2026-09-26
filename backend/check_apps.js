const mongoose = require('mongoose');
const { connectDB } = require('./src/config/db.config');
const Application = require('./src/models/Application');

async function check() {
    await connectDB();
    const apps = await Application.find({}).populate('jobId').lean();
    console.log(JSON.stringify(apps, null, 2));
    process.exit(0);
}
check();
