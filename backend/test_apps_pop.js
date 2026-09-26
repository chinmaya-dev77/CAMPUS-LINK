const mongoose = require('mongoose');
require('dotenv').config();
require('./test-isolation').assertIsolatedMongoUri();
const Application = require('./src/models/Application');
require('./src/models/Job'); // Ensure Job schema is registered

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const apps = await Application.find({}).populate('jobId').lean();
    console.log(JSON.stringify(apps[apps.length - 1], null, 2));
    process.exit(0);
}
run();
