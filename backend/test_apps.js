const mongoose = require('mongoose');
require('dotenv').config();
require('./test-isolation').assertIsolatedMongoUri();
const Application = require('./src/models/Application');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const apps = await Application.find({}).lean();
    console.log(JSON.stringify(apps, null, 2));
    process.exit(0);
}
run();
