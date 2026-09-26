/**
 * CampusLink — seed.js
 * Database seeding script for the synthetic demo dataset.
 *
 * Populates Users, Students, Recruiters, Jobs, Drives, Applications, Offers,
 * Assessments, and Notifications.
 *
 * To run: npm run seed (from the backend directory)
 * Implementation is planned for Phase 14 (Demo Polish).
 */

require('dotenv').config({ path: '../backend/.env' });
const mongoose = require('mongoose');

// Models will be required here later

const seedDatabase = async () => {
    console.log('[Seed] Starting database seed...');
    
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI is not defined in backend/.env');
        }

        await mongoose.connect(uri);
        console.log(`[Seed] MongoDB connected: ${mongoose.connection.host}`);
        
        // Phase 14: Read JSON files and insert into collections
        console.log('[Seed] Phase 0 stub: No data seeded yet.');
        
        console.log('[Seed] Database seeding completed successfully.');
    } catch (err) {
        console.error(`[Seed] Error during seeding: ${err.message}`);
    } finally {
        await mongoose.disconnect();
        console.log('[Seed] MongoDB disconnected.');
        process.exit(0);
    }
};

seedDatabase();
