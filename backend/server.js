require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

/**
 * Bootstrap function — connects to MongoDB first, then starts the HTTP server.
 * Keeping DB connection and server startup separate makes error handling clearer.
 */
const start = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`[SERVER] CampusLink API running on http://localhost:${PORT}`);
        console.log(`[SERVER] Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`[SERVER] Health check: http://localhost:${PORT}/api/health`);
    });
};

start();