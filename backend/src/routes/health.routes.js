const express = require("express");
const router = express.Router();

/**
 * GET /api/health
 * Confirms the server is running and reports basic service info.
 * Used for Phase 0 verification and uptime monitoring.
 */
router.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            status: "ok",
            service: "campuslink-api",
            version: "1.0.0",
            timestamp: new Date().toISOString(),
        },
        message: "CampusLink API is running",
    });
});

module.exports = router;
