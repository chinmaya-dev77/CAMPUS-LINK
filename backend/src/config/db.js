const mongoose = require("mongoose");

/**
 * Connects to MongoDB using the URI defined in MONGODB_URI environment variable.
 * Must be called before the HTTP server starts listening.
 */
const connectDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error("[DB] MONGODB_URI is not defined in environment variables.");
        process.exit(1);
    }

    try {
        const conn = await mongoose.connect(uri);
        console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[DB] MongoDB connection failed: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
